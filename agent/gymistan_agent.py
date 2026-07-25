"""
Gymistan Attendance Agent
=========================

Runs on any PC at the gym that shares a network with the biometric device.

Why it exists: Gymistan runs in the cloud, and a cloud server can never open a
connection to a machine sitting on the gym's private network — the device's
address (192.168.x.x) means nothing outside the building. So the direction is
reversed. This agent reads the device over the local network and posts the
punches up to Gymistan. Nothing has to be opened on the router, and the device
is never exposed to the internet.

For the person installing it there is exactly one thing to do: paste the setup
code shown in Gymistan (Attendance -> Device). The device is found automatically.

Build a standalone .exe (no Python needed on the gym's PC):
    pip install pyinstaller pyzk requests
    pyinstaller --onefile --name GymistanAgent gymistan_agent.py
"""

import concurrent.futures
import ipaddress
import json
import os
import socket
import sys
import time
from datetime import datetime

try:
    import requests
    from zk import ZK
except ImportError:
    print('Missing libraries. Run:  pip install pyzk requests')
    sys.exit(1)

VERSION = '1.0'
DEFAULT_SERVER = 'https://gymistan.dev'
DEVICE_PORT = 4370
POLL_SECONDS = 60            # how often punches are swept up
COMMAND_SECONDS = 3          # how often we ask for work — someone is waiting
SCAN_TIMEOUT = 0.35          # per-host TCP probe while scanning the LAN
DEVICE_TIMEOUT = 10

# Settings live next to the executable, so copying that one folder moves the
# whole install. Alongside a PyInstaller .exe sys.executable is the exe itself;
# running as a plain script it is the interpreter, so fall back to __file__.
BASE_DIR = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'gymistan-agent.json')


# ---------------------------------------------------------------- presentation
def log(msg):
    print(f'[{datetime.now():%H:%M:%S}] {msg}', flush=True)


def banner():
    print()
    print('  Gymistan Attendance Agent  v' + VERSION)
    print('  ' + '-' * 40)
    print('  Keeps this gym\'s biometric device in sync with Gymistan.')
    print('  Leave this window open. Minimise it if it is in the way.')
    print()


# ---------------------------------------------------------------- config
def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, encoding='utf-8') as fh:
                return json.load(fh)
        except (OSError, ValueError):
            log('Settings file was unreadable — starting setup again.')
    return {}


def save_config(cfg):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as fh:
        json.dump(cfg, fh, indent=2)


def ask(prompt, default=''):
    val = input(prompt).strip()
    return val or default


def claim_single_instance():
    """Refuse to be the second copy running on this PC.

    Two agents on one device is not harmless: both hold its live capture and both
    report the same scan, so the Live screen shows every entry twice. Binding a
    port is the check — the OS releases it the moment the process ends, so a
    crash or a hard power-off can never leave a stale lock behind, the way a
    lock file would."""
    guard = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        guard.bind(('127.0.0.1', 47318))
        guard.listen(1)
    except OSError:
        return None
    return guard          # held for the life of the process, deliberately


# ---------------------------------------------------------------- device
def local_subnet():
    """This machine's own /24, which is the network the device is on too."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(('8.8.8.8', 80))   # no packets sent; just picks the route
        ip = sock.getsockname()[0]
    finally:
        sock.close()
    return ipaddress.ip_network(f'{ip}/24', strict=False), ip


def port_open(host, port=DEVICE_PORT, timeout=SCAN_TIMEOUT):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        return sock.connect_ex((str(host), port)) == 0


def scan_for_device():
    """Sweep the local /24 for anything answering on the ZKTeco port, so nobody
    has to know what an IP address is. Threaded — 254 hosts in a few seconds."""
    try:
        network, own_ip = local_subnet()
    except OSError:
        log('This PC does not seem to be on a network.')
        return []
    log(f'Looking for the device on {network} ...')
    hosts = [h for h in network.hosts() if str(h) != own_ip]
    found = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=128) as pool:
        for host, is_open in zip(hosts, pool.map(port_open, hosts)):
            if is_open:
                found.append(str(host))
                log(f'  found a device at {host}')
    return found


def device_identity(ip, password=0):
    """Confirm it really is a ZKTeco unit, and get its serial for the record."""
    conn = None
    try:
        conn = ZK(ip, port=DEVICE_PORT, timeout=DEVICE_TIMEOUT,
                  password=password, ommit_ping=True).connect()
        return {'name': conn.get_device_name(), 'serial': conn.get_serialnumber()}
    except Exception:
        return None
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


def read_punches(ip, password=0):
    """Every punch the device is holding, as (device_user_id, datetime)."""
    conn = None
    try:
        conn = ZK(ip, port=DEVICE_PORT, timeout=DEVICE_TIMEOUT,
                  password=password, ommit_ping=True).connect()
        return [(str(l.user_id), l.timestamp) for l in (conn.get_attendance() or [])]
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


# ---------------------------------------------------------------- device jobs
def _connect(cfg):
    return ZK(cfg['device_ip'], port=DEVICE_PORT, timeout=DEVICE_TIMEOUT,
              password=cfg.get('device_password', 0), ommit_ping=True).connect()


def do_list_users(cfg, payload, conn):
    users = conn.get_users() or []
    return {'users': [{'user_id': str(u.user_id), 'name': (u.name or '').strip(),
                       'uid': u.uid, 'privilege': u.privilege, 'card': u.card}
                      for u in users]}


def do_push_users(cfg, payload, conn):
    """Create every member on the device so nobody has to type names on its
    keypad. Existing users are simply overwritten with the same details."""
    pushed, errors = 0, []
    for uid, name in payload.get('people', []):
        try:
            conn.set_user(uid=int(uid), user_id=str(uid), name=str(name)[:24], privilege=0)
            pushed += 1
        except Exception as err:
            errors.append(f'{name}: {err}')
    return {'pushed': pushed, 'errors': errors[:10]}


def do_fp_status(cfg, payload, conn):
    uid = str(payload.get('uid'))
    templates = conn.get_templates() or []
    match = any(str(getattr(t, 'uid', '')) == uid for t in templates)
    if not match:
        # Some firmwares index templates by the device's internal uid rather than
        # the user id, so fall back to matching through the user list.
        for u in (conn.get_users() or []):
            if str(u.user_id) == uid:
                match = any(getattr(t, 'uid', None) == u.uid for t in templates)
                break
    return {'enrolled': bool(match)}


def do_remove_fp(cfg, payload, conn):
    conn.delete_user_template(uid=0, temp_id=0, user_id=str(payload.get('uid')))
    return {'removed': True}


def do_enroll(cfg, payload, conn, server, cmd_id):
    """Put the device into enrolment mode and wait for the person to present a
    finger. The device drives the three scans itself; we just hold the line."""
    uid = str(payload.get('uid'))
    name = str(payload.get('name') or '')[:24]
    finger = int(payload.get('finger') or 0)
    # The user must exist before a finger can be attached to it.
    try:
        conn.set_user(uid=int(uid), user_id=uid, name=name, privilege=0)
    except Exception:
        pass
    server.command_result(cmd_id, ok=True, running=True,
                          message='Place finger on the sensor 3 times')
    conn.enroll_user(uid=int(uid), temp_id=finger, user_id=uid)
    return {'enrolled': True}


COMMANDS = {
    'LIST_USERS': do_list_users,
    'PUSH_USERS': do_push_users,
    'FP_STATUS': do_fp_status,
    'REMOVE_FP': do_remove_fp,
}


def run_command(server, cfg, cmd):
    """Run one job on the device and report what happened. The device is opened
    and closed per job so nothing is left holding it."""
    kind, cmd_id, payload = cmd['kind'], cmd['id'], cmd.get('payload') or {}
    log(f'Job from Gymistan: {kind}')
    conn = None
    try:
        conn = _connect(cfg)
        conn.disable_device()
        if kind == 'ENROLL':
            result = do_enroll(cfg, payload, conn, server, cmd_id)
        else:
            handler = COMMANDS.get(kind)
            if not handler:
                server.command_result(cmd_id, ok=False, message=f'Unknown job {kind}')
                return
            result = handler(cfg, payload, conn)
        server.command_result(cmd_id, ok=True, result=result)
        log(f'  {kind} done')
    except Exception as err:
        log(f'  {kind} failed: {err}')
        try:
            server.command_result(cmd_id, ok=False, message=str(err)[:200])
        except Exception:
            pass
    finally:
        if conn:
            try:
                conn.enable_device()
                conn.disconnect()
            except Exception:
                pass


def run_live(server, cfg, stop_after):
    """Hold the device's live capture open and stream each scan up as it happens,
    for as long as somebody is watching the Live screen."""
    conn = None
    try:
        conn = _connect(cfg)
        log('Live mode on - streaming scans as they happen.')
        for att in conn.live_capture(new_timeout=5):
            if att is not None:
                try:
                    server.live_scans([(str(att.user_id), att.timestamp)])
                except Exception as err:
                    log('  could not send a live scan: ' + explain(err))
            if time.monotonic() > stop_after():
                break
    except Exception as err:
        log('Live mode stopped: ' + str(err)[:120])
    finally:
        if conn:
            try:
                conn.end_live_capture = True
                conn.disconnect()
            except Exception:
                pass
        log('Live mode off.')


# ---------------------------------------------------------------- server
class Server:
    def __init__(self, base_url, token):
        self.url = base_url.rstrip('/') + '/api/attendance/device/ingest/'
        self.headers = {'X-Agent-Token': token}

    def watermark(self):
        """The newest punch Gymistan already has, so we only send what's new."""
        r = requests.get(self.url, headers=self.headers,
                         params={'agent_version': VERSION}, timeout=30)
        r.raise_for_status()
        return r.json()

    def next_command(self):
        r = requests.get(self.url.replace('/ingest/', '/commands/'),
                         headers=self.headers, timeout=30)
        r.raise_for_status()
        return r.json()

    def command_result(self, cmd_id, ok, result=None, message='', running=False):
        r = requests.post(self.url.replace('/ingest/', '/commands/'), headers=self.headers,
                          json={'id': cmd_id, 'ok': ok, 'result': result or {},
                                'message': message, 'running': running}, timeout=30)
        r.raise_for_status()
        return r.json()

    def live_scans(self, scans):
        r = requests.post(self.url.replace('/ingest/', '/live-scan/'), headers=self.headers,
                          json={'scans': [{'uid': u, 'at': dt.isoformat()} for u, dt in scans]},
                          timeout=30)
        r.raise_for_status()
        return r.json()

    def send(self, punches, serial=''):
        payload = {
            'agent_version': VERSION,
            'serial': serial,
            'punches': [{'uid': uid, 'at': dt.isoformat()} for uid, dt in punches],
        }
        r = requests.post(self.url, headers=self.headers, json=payload, timeout=60)
        r.raise_for_status()
        return r.json()


def explain(err):
    """Turn a failure into something the gym can act on."""
    if isinstance(err, requests.HTTPError) and err.response is not None:
        code = err.response.status_code
        try:
            detail = err.response.json().get('detail', '')
        except ValueError:
            detail = ''
        if code == 401:
            return ('Gymistan did not accept the setup code. Get a fresh one from '
                    'Attendance -> Device and delete gymistan-agent.json to re-enter it.')
        if code == 403:
            return detail or 'This gym\'s plan does not include attendance.'
        return f'Gymistan replied {code}. {detail}'.strip()
    if isinstance(err, requests.ConnectionError):
        return 'No internet connection. Will keep trying.'
    if isinstance(err, requests.Timeout):
        return 'Gymistan took too long to answer. Will keep trying.'
    return str(err) or err.__class__.__name__


# ---------------------------------------------------------------- auto-start
def _startup_dir():
    """Windows' per-user Startup folder — anything here runs at sign-in. Per-user
    means no administrator rights are needed, and removing it is just deleting a
    file, which a gym can do without help."""
    appdata = os.environ.get('APPDATA')
    if not appdata:
        return None
    return os.path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')


def _startup_file():
    folder = _startup_dir()
    return os.path.join(folder, 'Gymistan Attendance Agent.cmd') if folder else None


def autostart_enabled():
    path = _startup_file()
    return bool(path and os.path.exists(path))


def enable_autostart():
    """Drop a one-line launcher into Startup. A .cmd rather than a shortcut so it
    needs no extra libraries; `start "" /min` keeps the window out of the way but
    still in the taskbar, so staff can see the agent is alive."""
    path = _startup_file()
    if not path:
        return False, 'Could not find the Windows Startup folder.'
    target = sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        launcher = (f'"{target}"' if getattr(sys, 'frozen', False)
                    else f'"{sys.executable}" "{target}"')
        with open(path, 'w', encoding='utf-8') as fh:
            print('@echo off', file=fh)
            print(f'cd /d "{os.path.dirname(target)}"', file=fh)
            # /min keeps it in the taskbar rather than in the way — staff can
            # still glance at it to see the agent is alive.
            print(f'start "" /min {launcher}', file=fh)
        return True, path
    except OSError as err:
        return False, str(err)


def disable_autostart():
    path = _startup_file()
    try:
        if path and os.path.exists(path):
            os.remove(path)
        return True
    except OSError:
        return False


def offer_autostart():
    """Asked once, at the end of setup. The gym should never have to remember to
    start this thing after a power cut."""
    if autostart_enabled():
        return
    print()
    answer = ask('  Start automatically when this PC turns on? [Y/n]: ', 'y')
    if answer.lower().startswith('n'):
        log('Skipped. You can turn it on later by deleting gymistan-agent.json '
            'and running setup again.')
        return
    ok, detail = enable_autostart()
    if ok:
        log('Done - this will start by itself whenever the PC is switched on.')
    else:
        log('Could not set that up automatically: ' + detail)
        log('You can still start it by hand from this folder.')


# ---------------------------------------------------------------- setup
def first_run_setup():
    print('  Setup — this happens once.\n')
    print('  In Gymistan, open Attendance -> Device and copy the setup code.\n')

    token = ''
    while not token:
        token = ask('  Paste the setup code: ')

    server = ask(f'  Gymistan address [{DEFAULT_SERVER}]: ', DEFAULT_SERVER)
    if not server.startswith('http'):
        server = 'https://' + server

    print()
    log('Checking the setup code ...')
    try:
        info = Server(server, token).watermark()
        log(f'Connected to Gymistan - gym: {info.get("gym", "?")}')
    except Exception as err:
        log('Could not connect: ' + explain(err))
        return None

    print()
    candidates = scan_for_device()
    ip = ''
    for host in candidates:
        ident = device_identity(host)
        if ident:
            log(f'  {host} is a {ident["name"]} (serial {ident["serial"]})')
            ip = host
            break
    if not ip:
        log('No device found automatically.')
        ip = ask('  Enter the device IP by hand (e.g. 192.168.1.201): ')
        if not device_identity(ip):
            log('Could not talk to a device at that address.')
            return None

    cfg = {'server': server, 'token': token, 'device_ip': ip, 'device_password': 0}
    save_config(cfg)
    print()
    log('Setup complete. Settings saved next to this program.')
    offer_autostart()
    print()
    return cfg


# ---------------------------------------------------------------- main loop
def sync_once(server, cfg, state):
    ident = device_identity(cfg['device_ip'], cfg.get('device_password', 0))
    if not ident:
        # The device is off, asleep or unplugged. Not an error worth shouting
        # about every minute — say it once, then stay quiet until it returns.
        if state.get('device_up', True):
            log('Device is not responding. Is it powered on and on the network?')
            state['device_up'] = False
        return
    if not state.get('device_up', True):
        log('Device is back.')
    state['device_up'] = True

    info = server.watermark()
    since = info.get('since')
    cutoff = datetime.fromisoformat(since) if since else None

    punches = read_punches(cfg['device_ip'], cfg.get('device_password', 0))
    fresh = [(uid, dt) for uid, dt in punches if cutoff is None or dt > cutoff]
    if not fresh:
        if not state.get('idle_reported'):
            log(f'Up to date - {len(punches)} punches on the device, nothing new.')
            state['idle_reported'] = True
        return

    state['idle_reported'] = False
    result = server.send(fresh, serial=ident.get('serial', ''))
    applied = result.get('applied', 0)
    unknown = result.get('skipped_unknown', 0)
    msg = f'Sent {len(fresh)} punches - {applied} recorded'
    if unknown:
        msg += f', {unknown} from device IDs not matched to a member yet'
    log(msg)


def main():
    banner()

    guard = claim_single_instance()
    if guard is None:
        print('  This agent is already running on this PC.')
        print('  Look for its window in the taskbar - you do not need a second one.')
        print()
        input('  Press Enter to close.')
        return

    cfg = load_config()
    if not cfg.get('token'):
        cfg = first_run_setup()
        if not cfg:
            input('  Press Enter to close.')
            return

    import threading
    server = Server(cfg['server'], cfg['token'])
    if autostart_enabled():
        log('Starts automatically with this PC.')
    else:
        # Never prompt here. Once auto-start is on, this process is launched with
        # nobody at the keyboard, and an input() would hang it forever. Setup is
        # the only place that asks.
        log('Tip: this does not start by itself yet. Delete gymistan-agent.json '
            'and run setup again to turn that on.')
    log(f'Watching device at {cfg["device_ip"]} - checking every {POLL_SECONDS}s.')
    state = {}
    last_sync = 0.0
    live_thread = None
    live_deadline = [0.0]

    while True:
        try:
            # Jobs are asked for often because somebody is standing at the device
            # waiting; punches are swept far less often because nothing is.
            info = server.next_command()

            if info.get('live'):
                live_deadline[0] = time.monotonic() + 30
                if live_thread is None or not live_thread.is_alive():
                    live_thread = threading.Thread(
                        target=run_live, args=(server, cfg, lambda: live_deadline[0]),
                        daemon=True)
                    live_thread.start()

            cmd = info.get('command')
            if cmd:
                run_command(server, cfg, cmd)
            elif not (live_thread and live_thread.is_alive()):
                # Never talk to the device from two places at once: while live
                # capture holds it, the punch sweep would be refused anyway.
                if time.monotonic() - last_sync >= POLL_SECONDS:
                    sync_once(server, cfg, state)
                    last_sync = time.monotonic()
        except KeyboardInterrupt:
            raise
        except Exception as err:
            log(explain(err))
        time.sleep(COMMAND_SECONDS)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n  Stopped.')
    except Exception as fatal:          # never die with a bare stack trace
        print(f'\n  Unexpected problem: {fatal}')
        input('  Press Enter to close.')

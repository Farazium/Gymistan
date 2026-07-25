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
POLL_SECONDS = 60
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
    cfg = load_config()
    if not cfg.get('token'):
        cfg = first_run_setup()
        if not cfg:
            input('  Press Enter to close.')
            return

    server = Server(cfg['server'], cfg['token'])
    log(f'Watching device at {cfg["device_ip"]} - checking every {POLL_SECONDS}s.')
    state = {}
    while True:
        try:
            sync_once(server, cfg, state)
        except KeyboardInterrupt:
            raise
        except Exception as err:
            log(explain(err))
        time.sleep(POLL_SECONDS)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n  Stopped.')
    except Exception as fatal:          # never die with a bare stack trace
        print(f'\n  Unexpected problem: {fatal}')
        input('  Press Enter to close.')

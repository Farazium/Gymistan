"""Remote fingerprint enrollment.

`enroll_user` blocks for up to a minute while the person places their finger a
few times, so it can't run inside a request. We run it in a daemon thread and
expose the job's state for the UI to poll: the admin clicks Enroll, the device
prompts the member to place their finger, and the screen updates when it's done.

One job per gym at a time. In-memory, so this suits the gym-local backend that
talks to the device.
"""
import threading
import time

from .live import stop_monitor

try:
    from zk import ZK
    _HAS_ZK = True
except Exception:  # library not installed
    ZK = None
    _HAS_ZK = False

_jobs = {}
_lock = threading.Lock()


def _mark_member(member_id, value):
    """Mirror the enrolled state onto the member (own DB connection in the thread)."""
    if not member_id:
        return
    from django.db import close_old_connections
    from apps.members.models import Member
    close_old_connections()
    try:
        Member.objects.filter(pk=member_id).update(has_fingerprint=value)
    finally:
        close_old_connections()


def _run(gym_id, ip, port, password, user_id, name, finger, member_id):
    job = _jobs[gym_id]
    conn = None
    # The live monitor holds the device connection; free it first so enrollment
    # isn't fighting it (that both corrupts the result and lets the enrollment
    # scans get logged as attendance).
    stop_monitor(gym_id)
    time.sleep(3.5)
    try:
        zk = ZK(ip, port=port, password=password, timeout=10, ommit_ping=False)
        conn = zk.connect()
        # Make sure the user record exists so their name shows during enrollment,
        # and clear any existing print on this finger so a re-enroll replaces it
        # cleanly instead of being refused as a duplicate.
        try:
            conn.disable_device()
            conn.set_user(uid=int(user_id), user_id=str(user_id), name=(name or '')[:24], privilege=0)
            try:
                conn.delete_user_template(uid=int(user_id), temp_id=finger)
            except Exception:
                pass
            conn.enable_device()
        except Exception:
            pass
        ok = conn.enroll_user(uid=int(user_id), temp_id=finger, user_id=str(user_id))
        # enroll_user's success flag is firmware-fragile (the K50 reports a code it
        # doesn't recognise), so confirm by reading back whether a fingerprint
        # template now exists for this user.
        if not ok:
            try:
                tmpl = conn.get_user_template(uid=int(user_id), temp_id=finger)
                ok = bool(tmpl and getattr(tmpl, 'template', None))
            except Exception:
                pass
        job['state'] = 'done' if ok else 'failed'
        job['message'] = ('Fingerprint enrolled' if ok
                          else 'Enrollment was cancelled or timed out')
        if ok:
            _mark_member(member_id, True)
    except Exception as e:
        job['state'] = 'failed'
        job['message'] = str(e)
    finally:
        if conn:
            try:
                conn.enable_device()
            except Exception:
                pass
            try:
                conn.disconnect()
            except Exception:
                pass


def start_enroll(gym_id, ip, port, password, user_id, name, finger=0, member_id=None):
    """Kick off enrollment in the background. Returns (started, detail)."""
    if not _HAS_ZK:
        return False, 'pyzk is not installed'
    with _lock:
        cur = _jobs.get(gym_id)
        if cur and cur.get('state') == 'running':
            return False, 'An enrollment is already in progress'
        _jobs[gym_id] = {'state': 'running', 'user_id': str(user_id), 'name': name,
                         'message': 'Ask the member to place their finger on the sensor'}
    threading.Thread(target=_run, daemon=True,
                     args=(gym_id, ip, port, password, str(user_id), name, finger, member_id)).start()
    return True, 'started'


def enroll_status(gym_id):
    return _jobs.get(gym_id) or {'state': 'idle'}

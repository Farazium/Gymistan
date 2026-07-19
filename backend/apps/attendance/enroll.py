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


def _mark_person(kind, pid, value):
    """Mirror the enrolled state onto the member/trainer (own DB connection)."""
    if not pid:
        return
    from django.db import close_old_connections
    close_old_connections()
    try:
        if kind == 'trainer':
            from apps.trainers.models import Trainer
            Trainer.objects.filter(pk=pid).update(has_fingerprint=value)
        else:
            from apps.members.models import Member
            Member.objects.filter(pk=pid).update(has_fingerprint=value)
    finally:
        close_old_connections()


def _run(gym_id, ip, port, password, user_id, name, finger, kind, person_id):
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
        job['conn'] = conn  # so a cancel can close the socket and unblock us
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
        if job.get('cancelled'):
            return  # closed from the UI — don't record or overwrite state
        job['state'] = 'done' if ok else 'failed'
        job['message'] = ('Fingerprint enrolled' if ok
                          else 'Enrollment was cancelled or timed out')
        if ok:
            _mark_person(kind, person_id, True)
    except Exception as e:
        if not job.get('cancelled'):
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


def start_enroll(gym_id, ip, port, password, user_id, name, finger=0,
                 kind='member', person_id=None):
    """Kick off enrollment in the background. Returns (started, detail)."""
    if not _HAS_ZK:
        return False, 'pyzk is not installed'
    with _lock:
        cur = _jobs.get(gym_id)
        if cur and cur.get('state') == 'running':
            return False, 'An enrollment is already in progress'
        _jobs[gym_id] = {'state': 'running', 'user_id': str(user_id), 'name': name,
                         'message': 'Ask them to place their finger on the sensor'}
    threading.Thread(target=_run, daemon=True,
                     args=(gym_id, ip, port, password, str(user_id), name, finger,
                           kind, person_id)).start()
    return True, 'started'


def enroll_status(gym_id):
    job = _jobs.get(gym_id)
    if not job:
        return {'state': 'idle'}
    # Never leak the live connection object out to the API layer.
    return {k: v for k, v in job.items() if k != 'conn'}


def cancel_enroll(gym_id, ip, port, password):
    """Abort a running enrollment: unblock the worker (close its socket) and tell
    the device to leave enroll mode, so a fresh enrollment can start."""
    job = _jobs.pop(gym_id, None)
    if job:
        job['cancelled'] = True
        job['state'] = 'cancelled'
        conn = job.get('conn')
        if conn is not None:
            sock = getattr(conn, '_ZK__sock', None)
            if sock is not None:
                try:
                    sock.close()  # unblock the recv the worker is stuck on
                except Exception:
                    pass
    if not _HAS_ZK:
        return
    # Separate connection to kick the device out of "place finger" mode.
    try:
        c = ZK(ip, port=port, password=password, timeout=6, ommit_ping=False).connect()
        try:
            c.cancel_capture()
        except Exception:
            pass
        try:
            c.disable_device()
            c.enable_device()
        except Exception:
            pass
        try:
            c.disconnect()
        except Exception:
            pass
    except Exception:
        pass

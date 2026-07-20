"""ZKTeco biometric device integration via the `pyzk` library (import name `zk`).

Only the device I/O lives here; turning punches into daily rows is done by
services.record_punches. The pyzk import is guarded so the rest of the app (and
the dummy seeder) works fine on machines without the library or a device.

Install on the machine that talks to the device:  pip install pyzk
"""
from .services import record_punches

try:
    from zk import ZK
    _HAS_ZK = True
except Exception:  # library not installed
    ZK = None
    _HAS_ZK = False


def pull_device_punches(ip, port=4370, timeout=10, password=0):
    """Connect to a ZKTeco device and return a list of (device_user_id, datetime).

    Raises RuntimeError if pyzk is not installed. Any device/network error from
    pyzk propagates to the caller (the sync command reports it)."""
    if not _HAS_ZK:
        raise RuntimeError('pyzk is not installed. Run: pip install pyzk')

    zk = ZK(ip, port=port, timeout=timeout, password=password, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        conn.disable_device()  # freeze device while we read, then re-enable
        logs = conn.get_attendance() or []
        # Each log has .user_id (str) and .timestamp (datetime)
        return [(str(log.user_id), log.timestamp) for log in logs]
    finally:
        if conn:
            try:
                conn.enable_device()
                conn.disconnect()
            except Exception:
                pass


def pull_device_users(ip, port=4370, timeout=10, password=0):
    """Return the list of users enrolled on the device: [{'user_id','name'}]."""
    if not _HAS_ZK:
        raise RuntimeError('pyzk is not installed. Run: pip install pyzk')
    zk = ZK(ip, port=port, timeout=timeout, password=password, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        users = conn.get_users() or []
        return [{'user_id': str(u.user_id), 'name': (u.name or '').strip()} for u in users]
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


def push_users(ip, port, password, people, timeout=20):
    """Create/update users on the device from the PC, so nobody has to type names
    or ids on the keypad. `people` is a list of (user_id, name). Fingerprints are
    NOT set here — those must still be scanned on the sensor (or a card tapped).
    Returns (pushed_count, errors[])."""
    if not _HAS_ZK:
        raise RuntimeError('pyzk is not installed. Run: pip install pyzk')

    zk = ZK(ip, port=port, password=password, timeout=timeout, ommit_ping=False)
    conn = None
    pushed = 0
    errors = []
    try:
        conn = zk.connect()
        conn.disable_device()  # freeze while we write, then re-enable
        for user_id, name in people:
            sid = str(user_id)
            if not sid.isdigit():
                errors.append(f'{sid}: skipped (device id must be numeric)')
                continue
            if int(sid) > 65535:
                # The device stores its internal slot as a 16-bit number.
                errors.append(f'{sid}: skipped (device id must be 65535 or less)')
                continue
            try:
                # The device's internal uid mirrors the user id we track, so a
                # re-push updates the same record (and keeps any fingerprint).
                conn.set_user(uid=int(sid), user_id=sid, name=(name or '')[:24], privilege=0)
                pushed += 1
            except Exception as e:
                errors.append(f'{sid}: {e}')
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
    return pushed, errors


def device_has_fingerprint(ip, port, password, uid, timeout=10):
    """True if the device holds any fingerprint template for this user (any
    finger). One `get_templates` call rather than probing each finger."""
    if not _HAS_ZK:
        raise RuntimeError('pyzk is not installed. Run: pip install pyzk')
    zk = ZK(ip, port=port, password=password, timeout=timeout, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        uid = int(uid)
        for t in (conn.get_templates() or []):
            if t.uid == uid and getattr(t, 'size', 0) and getattr(t, 'valid', 1):
                return True
        return False
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


def delete_device_user(ip, port, password, uid, timeout=10):
    """Remove a user entirely from the device (record + all fingerprints).
    Used when a member/trainer is permanently deleted. Returns True on success."""
    if not _HAS_ZK:
        raise RuntimeError('pyzk is not installed. Run: pip install pyzk')
    zk = ZK(ip, port=port, password=password, timeout=timeout, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        conn.delete_user(uid=int(uid))
        return True
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


def delete_fingerprint(ip, port, password, uid, finger=0, timeout=10):
    """Remove a user's fingerprint template from the device. Returns True on
    success. The user record (name/id) is left in place."""
    if not _HAS_ZK:
        raise RuntimeError('pyzk is not installed. Run: pip install pyzk')
    zk = ZK(ip, port=port, password=password, timeout=timeout, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        conn.delete_user_template(uid=int(uid), temp_id=finger)
        return True
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


def ping_device(ip, port=4370, password=0, timeout=5):
    """Quick reachability check: try to connect to the device and read a light
    identifier, then disconnect. Returns (ok, detail). Never raises — a failure
    comes back as (False, message) so the UI can show 'offline' cleanly.

    Uses a short timeout so a dead IP fails fast instead of hanging the request."""
    if not _HAS_ZK:
        return False, 'pyzk is not installed on the server'
    zk = ZK(ip, port=port, timeout=timeout, password=password, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        # A tiny read confirms the link is really usable, not just a socket open.
        try:
            name = conn.get_device_name()
        except Exception:
            name = ''
        return True, (f'Connected to {name}'.strip() if name else 'Connected')
    except Exception as e:
        return False, str(e) or 'Could not reach device'
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


def sync_device(gym, ip, port=4370, timeout=10, password=0, since=None):
    """Pull punches from a device and record them for `gym`, applying only those
    newer than `since` (incremental). Returns a summary dict with `latest` watermark."""
    punches = pull_device_punches(ip, port=port, timeout=timeout, password=password)
    summary = record_punches(gym, punches, since=since)
    summary['pulled'] = len(punches)
    return summary

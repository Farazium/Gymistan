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


def sync_device(gym, ip, port=4370, timeout=10, password=0, since=None):
    """Pull punches from a device and record them for `gym`, applying only those
    newer than `since` (incremental). Returns a summary dict with `latest` watermark."""
    punches = pull_device_punches(ip, port=port, timeout=timeout, password=password)
    summary = record_punches(gym, punches, since=since)
    summary['pulled'] = len(punches)
    return summary

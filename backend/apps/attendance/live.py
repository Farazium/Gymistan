"""Real-time entrance monitor.

Streams punches off a ZKTeco device the moment they happen (pyzk `live_capture`)
into a small in-memory buffer that the Live view polls. One daemon thread per
gym, holding the device connection open only while the Live screen is actively
polling — it self-stops after a short idle so ordinary Sync Now can still reach
the device.

The thread does device I/O only (no ORM); the view resolves each punch to a
member and its status. Buffer lives in process memory, so this suits the
gym-local backend that talks to the device — not a multi-process cloud worker.
"""
import threading
import time

try:
    from zk import ZK
    _HAS_ZK = True
except Exception:  # library not installed
    ZK = None
    _HAS_ZK = False

# Stop holding the device open once the Live screen stops polling for this long.
IDLE_STOP_SECONDS = 15
# How often live_capture wakes up (to check the idle timer) when nobody punches.
CAPTURE_TIMEOUT = 3

_monitors = {}
_lock = threading.Lock()


class _Monitor:
    def __init__(self, gym_id, ip, port, password):
        self.gym_id = gym_id
        self.ip = ip
        self.port = port
        self.password = password
        self.seq = 0
        self.events = []  # recent [{seq, device_user_id, dt, time}]
        self.recorded_seq = 0  # highest seq already written to the DB
        self.last_poll = time.time()
        self.running = False
        self.error = None
        self._thread = None

    def touch(self):
        self.last_poll = time.time()

    def ensure_running(self):
        with _lock:
            if self.running:
                return
            self.running = True
            self.error = None
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

    def _run(self):
        conn = None
        try:
            zk = ZK(self.ip, port=self.port, password=self.password,
                    timeout=5, ommit_ping=False)
            conn = zk.connect()
            for att in conn.live_capture(new_timeout=CAPTURE_TIMEOUT):
                if time.time() - self.last_poll > IDLE_STOP_SECONDS:
                    conn.end_live_capture = True
                    break
                if att is None:  # capture timed out with no punch — just re-check idle
                    continue
                self.seq += 1
                self.events.append({
                    'seq': self.seq,
                    'device_user_id': str(att.user_id),
                    'dt': att.timestamp,
                    'time': att.timestamp.strftime('%H:%M'),
                })
                self.events = self.events[-30:]
        except Exception as e:  # network/device error — surfaced to the UI
            self.error = str(e)
        finally:
            if conn:
                try:
                    conn.disconnect()
                except Exception:
                    pass
            self.running = False


def get_monitor(gym_id, ip, port, password):
    """Return the live monitor for a gym, rebuilding it if the device address
    changed. Does not start the thread — call `.ensure_running()`."""
    with _lock:
        mon = _monitors.get(gym_id)
        if mon is None or mon.ip != ip or mon.port != port or mon.password != password:
            mon = _Monitor(gym_id, ip, port, password)
            _monitors[gym_id] = mon
        return mon

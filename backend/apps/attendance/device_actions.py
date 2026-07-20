"""Helpers for putting a single person (member or trainer) onto the device —
assigning a device id and pushing their name. Shared by the create hooks and the
device views so the id logic lives in one place.
"""
import threading
import time

from django.db import close_old_connections

from apps.members.models import Member
from apps.trainers.models import Trainer
from .zk_service import push_users, delete_device_user


def run_async(fn, *args, **kwargs):
    """Run a best-effort device operation off the request thread so a slow or
    offline device never blocks the HTTP response — an unreachable device can
    take 30–50s to time out, and delete/restore must not wait on that. The device
    helpers already swallow their own errors; here we just make sure the thread's
    own DB connection is returned instead of leaking."""
    def _wrap():
        try:
            fn(*args, **kwargs)
        finally:
            close_old_connections()
    threading.Thread(target=_wrap, daemon=True).start()


def next_device_id(gym):
    """Smallest free numeric device id, kept unique across members and trainers
    so two people never land on the same device slot."""
    used = set()
    for qs in (Member.objects.filter(gym=gym), Trainer.objects.filter(gym=gym)):
        for duid in qs.exclude(device_user_id='').exclude(device_user_id__isnull=True) \
                      .values_list('device_user_id', flat=True):
            if str(duid).isdigit():
                used.add(int(duid))
    n = 1
    while n in used:
        n += 1
    return n


def get_person(gym, kind, pid):
    """Resolve a person by kind ('member'|'trainer') and id, or None."""
    if kind == 'trainer':
        return Trainer.objects.filter(gym=gym, pk=pid).first()
    return Member.objects.filter(gym=gym, pk=pid, is_deleted=False).first()


def ensure_person_id(person):
    """Give the person a device id if they lack one. Returns it (str).
    Works for a Member or a Trainer — both carry gym + device_user_id."""
    if person.device_user_id:
        return person.device_user_id
    nid = str(next_device_id(person.gym))
    person.device_user_id = nid
    person.save(update_fields=['device_user_id'])
    return nid


def push_person(cfg, person):
    """Ensure the person has a device id and push their name to the device.
    Returns (pushed_count, errors)."""
    uid = ensure_person_id(person)
    return push_users(cfg.ip, cfg.port, cfg.password, [(uid, person.name)])


def remove_person_from_device(person):
    """Best-effort: drop a permanently-deleted member/trainer off the device
    (their record and fingerprints). Never raises — a missing or offline device
    must not block the delete. Call this while the object still exists."""
    duid = person.device_user_id
    if not duid or not str(duid).isdigit():
        return
    from apps.attendance.models import DeviceConfig
    from apps.attendance.live import stop_monitor, monitor_running
    cfg = DeviceConfig.objects.filter(gym=person.gym).first()
    if not cfg or not cfg.ip:
        return
    try:
        if monitor_running(person.gym_id):
            stop_monitor(person.gym_id)
            time.sleep(3.5)
        delete_device_user(cfg.ip, cfg.port, cfg.password, duid)
    except Exception:
        pass

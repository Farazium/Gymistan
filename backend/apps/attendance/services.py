"""Shared attendance logic: turn raw punches into one-row-per-day records.

Used by both the ZKTeco device sync and the dummy seeder, so the "first punch is
check-in, last punch is check-out" rule lives in exactly one place.
"""
from apps.members.models import Member
from apps.trainers.models import Trainer
from .models import Attendance


def resolve_person(gym, device_user_id):
    """Map a device user id to a (kind, obj) pair, or None if unknown.
    Members take priority; falls back to trainers."""
    duid = str(device_user_id).strip()
    if not duid:
        return None
    m = Member.objects.filter(gym=gym, device_user_id=duid, is_deleted=False).first()
    if m:
        return 'member', m
    t = Trainer.objects.filter(gym=gym, device_user_id=duid).first()
    if t:
        return 'trainer', t
    return None


def record_punch(gym, kind, obj, dt, source=Attendance.Source.DEVICE):
    """Upsert a single punch (a datetime) into the person's daily row.
    Returns True if a new row was created."""
    filt = {'gym': gym, 'date': dt.date(), 'member' if kind == 'member' else 'trainer': obj}
    row, created = Attendance.objects.get_or_create(**filt, defaults={
        'check_in': dt.time(), 'check_out': dt.time(), 'source': source,
    })
    if not created:
        t = dt.time()
        changed = False
        if row.check_in is None or t < row.check_in:
            row.check_in = t; changed = True
        if row.check_out is None or t > row.check_out:
            row.check_out = t; changed = True
        if changed:
            row.save(update_fields=['check_in', 'check_out', 'updated_at'])
    return created


def record_punches(gym, punches, source=Attendance.Source.DEVICE, since=None):
    """Bulk-apply (device_user_id, datetime) punches. Unknown ids are skipped.
    If `since` is given, only punches newer than it are applied (incremental sync).
    Returns a summary dict including the newest punch datetime seen (`latest`)."""
    applied = skipped = created = old = 0
    latest = since
    for device_user_id, dt in punches:
        if since is not None and dt <= since:
            old += 1
            continue
        person = resolve_person(gym, device_user_id)
        if not person:
            skipped += 1
            continue
        kind, obj = person
        if record_punch(gym, kind, obj, dt, source=source):
            created += 1
        applied += 1
        if latest is None or dt > latest:
            latest = dt
    return {'applied': applied, 'created': created, 'skipped_unknown': skipped,
            'skipped_old': old, 'latest': latest}

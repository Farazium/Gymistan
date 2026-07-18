"""Helpers for putting a single member onto the device — assigning a device id
and pushing their name. Shared by the member-create hook and the enroll view so
the id logic lives in one place.
"""
from apps.members.models import Member
from apps.trainers.models import Trainer
from .zk_service import push_users


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


def ensure_member_id(member):
    """Give the member a device id if they lack one. Returns it (str)."""
    if member.device_user_id:
        return member.device_user_id
    nid = str(next_device_id(member.gym))
    member.device_user_id = nid
    member.save(update_fields=['device_user_id'])
    return nid


def push_member(cfg, member):
    """Ensure the member has a device id and push their name to the device.
    Returns (pushed_count, errors)."""
    uid = ensure_member_id(member)
    return push_users(cfg.ip, cfg.port, cfg.password, [(uid, member.name)])

import secrets

from django.db import models
from apps.gyms.models import Gym
from apps.members.models import Member
from apps.trainers.models import Trainer


def new_agent_token():
    """A gym's setup code. Long enough that it can't be guessed, short enough that
    someone can paste it without cursing."""
    return secrets.token_urlsafe(24)


class DeviceConfig(models.Model):
    """One ZKTeco device per gym. Stores how to reach it and a record of the last
    sync so the UI can show status and syncs can run incrementally.

    `ip`/`port` are only usable when the backend shares a network with the device.
    Hosted in the cloud it never does — the device sits behind the gym's router on
    a private address — so a small agent runs on a PC at the gym instead, reads the
    device over the LAN and posts punches up. The agent fields below are that
    channel: the gym pastes `agent_token` into the agent once, and `agent_last_seen`
    is what lets the app say whether it's alive."""
    gym = models.OneToOneField(Gym, on_delete=models.CASCADE, related_name='device_config')
    name = models.CharField(max_length=100, blank=True)
    ip = models.CharField(max_length=64, blank=True)
    port = models.PositiveIntegerField(default=4370)
    password = models.PositiveIntegerField(default=0)  # device comm password
    is_active = models.BooleanField(default=True)
    last_sync = models.DateTimeField(null=True, blank=True)          # watermark
    last_sync_at = models.DateTimeField(null=True, blank=True)       # when we last ran
    last_sync_status = models.CharField(max_length=255, blank=True)
    last_sync_count = models.IntegerField(default=0)
    # --- gym-PC agent ---
    # The token is this gym's only credential for the ingest endpoint, so it is
    # unique and regenerable: reissuing it instantly retires whatever the old PC held.
    agent_token = models.CharField(max_length=64, unique=True, default=new_agent_token)
    agent_last_seen = models.DateTimeField(null=True, blank=True)
    agent_version = models.CharField(max_length=20, blank=True)
    # Serial of the device the agent found, so a gym can confirm which unit is
    # reporting (and so a swapped device is visible rather than silent).
    agent_serial = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = 'device_config'

    def __str__(self):
        return f'{self.gym.name} device @ {self.ip or "unset"}'


class Attendance(models.Model):
    """One row per person per day. Exactly one of member/trainer is set. The first
    punch of the day fills check_in, the last fills check_out."""

    class Source(models.TextChoices):
        DEVICE = 'DEVICE', 'Device'   # pulled from a ZKTeco biometric device
        MANUAL = 'MANUAL', 'Manual'   # marked by hand in the app

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='attendance')
    member = models.ForeignKey(Member, on_delete=models.CASCADE, null=True, blank=True, related_name='attendance')
    trainer = models.ForeignKey(Trainer, on_delete=models.CASCADE, null=True, blank=True, related_name='attendance')
    date = models.DateField()
    check_in = models.TimeField(null=True, blank=True)
    check_out = models.TimeField(null=True, blank=True)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.DEVICE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'attendance'
        ordering = ['-date', 'check_in']
        constraints = [
            models.UniqueConstraint(fields=['member', 'date'], name='uniq_member_day',
                                    condition=models.Q(member__isnull=False)),
            models.UniqueConstraint(fields=['trainer', 'date'], name='uniq_trainer_day',
                                    condition=models.Q(trainer__isnull=False)),
        ]
        indexes = [models.Index(fields=['gym', 'date'])]

    def __str__(self):
        who = self.member or self.trainer
        return f'{who} - {self.date}'

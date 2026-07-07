from django.db import models
from apps.gyms.models import Gym
from apps.members.models import Member
from apps.trainers.models import Trainer


class DeviceConfig(models.Model):
    """One ZKTeco device per gym. Stores how to reach it and a record of the last
    sync so the UI can show status and syncs can run incrementally."""
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

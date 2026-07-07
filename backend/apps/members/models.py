from django.db import models
from apps.gyms.models import Gym
from apps.packages.models import Package


class Member(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        EXPIRED = 'EXPIRED', 'Expired'

    class Gender(models.TextChoices):
        MALE = 'MALE', 'Male'
        FEMALE = 'FEMALE', 'Female'

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='members')
    package = models.ForeignKey(Package, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')
    trainer = models.ForeignKey('trainers.Trainer', on_delete=models.SET_NULL, null=True, blank=True, related_name='members')
    member_id = models.CharField(max_length=5, blank=True, null=True)
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20)
    gender = models.CharField(max_length=10, choices=Gender.choices, default=Gender.MALE)
    father_name = models.CharField(max_length=200, blank=True)
    address = models.TextField(blank=True)
    photo = models.ImageField(upload_to='member_photos/', null=True, blank=True)
    join_date = models.DateField()
    expiry_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    notes = models.TextField(blank=True)
    is_deleted = models.BooleanField(default=False)
    # Maps this member to their user id on the ZKTeco biometric device.
    device_user_id = models.CharField(max_length=32, blank=True)
    # Expiry-date value we last sent a WhatsApp renewal reminder for, so a member is
    # reminded only once per membership cycle (reset naturally when expiry changes).
    reminder_sent_for = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'members'
        unique_together = [('gym', 'member_id'), ('gym', 'phone')]
        constraints = [
            models.UniqueConstraint(
                fields=['gym', 'device_user_id'], name='uniq_member_device_id',
                condition=~models.Q(device_user_id='')),
        ]

    def __str__(self):
        return f'{self.name} - {self.gym.name}'

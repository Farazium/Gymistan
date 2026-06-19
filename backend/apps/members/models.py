from django.db import models
from apps.gyms.models import Gym
from apps.packages.models import Package


class Member(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        EXPIRED = 'EXPIRED', 'Expired'
        SUSPENDED = 'SUSPENDED', 'Suspended'

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='members')
    package = models.ForeignKey(Package, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    cnic = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    photo = models.ImageField(upload_to='member_photos/', null=True, blank=True)
    join_date = models.DateField(auto_now_add=True)
    expiry_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'members'

    def __str__(self):
        return f'{self.name} - {self.gym.name}'

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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'members'

    def __str__(self):
        return f'{self.name} - {self.gym.name}'

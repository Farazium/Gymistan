from django.db import models


class Tier(models.TextChoices):
    TIER1    = 'TIER1',    'Basic'
    TIER2_WA = 'TIER2_WA', 'WhatsApp'
    TIER2_AT = 'TIER2_AT', 'Attendance'
    TIER3    = 'TIER3',    'Pro'


class Gym(models.Model):
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    logo = models.ImageField(upload_to='gym_logos/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    joining_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    subscription_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    tier = models.CharField(max_length=20, choices=Tier.choices, default=Tier.TIER1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gyms'

    def __str__(self):
        return self.name


class GymPayment(models.Model):
    METHODS = [('CASH', 'Cash'), ('ONLINE', 'Online')]

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='gym_payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    months = models.PositiveIntegerField(default=1)
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=20, choices=METHODS, default='CASH')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gym_payments'
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f'{self.gym.name} – {self.amount}'

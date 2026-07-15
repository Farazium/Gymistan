from django.db import models
from apps.gyms.models import Gym
from apps.members.models import Member
from apps.packages.models import Package
from apps.common.models import SoftDeleteModel


class Payment(SoftDeleteModel):
    class Status(models.TextChoices):
        PAID = 'PAID', 'Paid'
        PENDING = 'PENDING', 'Pending'
        PARTIAL = 'PARTIAL', 'Partial'

    class PaymentMethod(models.TextChoices):
        CASH = 'CASH', 'Cash'
        ONLINE = 'ONLINE', 'Online'

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='payments')
    member = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='payments')
    package = models.ForeignKey(Package, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    collected_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='collected_payments'
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PAID)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    payment_date = models.DateField(auto_now_add=True)
    due_date = models.DateField(null=True, blank=True)
    prev_expiry = models.DateField(null=True, blank=True)
    new_expiry = models.DateField(null=True, blank=True)
    month = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)
    # Set on an admission fee taken when a member rejoins, so their slip greets them
    # back instead of welcoming them as new. Restoring clears the member's own
    # deleted_at, so the payment is the only thing left that remembers.
    is_rejoin = models.BooleanField(default=False)
    slip_sent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payments'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.member.name} - PKR {self.amount_paid} ({self.status})'

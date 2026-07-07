from django.db import models
from apps.gyms.models import Gym


class Trainer(models.Model):
    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='trainers')
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    cnic = models.CharField(max_length=20, blank=True)
    join_date = models.DateField(null=True, blank=True)
    monthly_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    photo = models.ImageField(upload_to='trainer_photos/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    # Maps this trainer to their user id on the ZKTeco biometric device.
    device_user_id = models.CharField(max_length=32, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'trainers'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['gym', 'device_user_id'], name='uniq_trainer_device_id',
                condition=~models.Q(device_user_id='')),
        ]

    def __str__(self):
        return f'{self.name} - {self.gym.name}'


class SalaryPayment(models.Model):
    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='salary_payments')
    trainer = models.ForeignKey(Trainer, on_delete=models.CASCADE, related_name='salary_payments')
    month = models.CharField(max_length=7)  # 'YYYY-MM'
    base_salary = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    commission = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=10, decimal_places=2)  # base + commission
    payment_date = models.DateField()
    note = models.TextField(blank=True)
    expense = models.ForeignKey(
        'expenses.Expense', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    paid_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='salary_payments'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'salary_payments'
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f'{self.trainer.name} - {self.month} - PKR {self.amount}'

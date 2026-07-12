from django.db import models
from apps.gyms.models import Gym
from apps.common.models import SoftDeleteModel


class Expense(SoftDeleteModel):
    class Category(models.TextChoices):
        RENT = 'RENT', 'Rent'
        UTILITIES = 'UTILITIES', 'Utilities'
        BILLS = 'BILLS', 'Bills'
        SALARIES = 'SALARIES', 'Salaries'
        EQUIPMENT = 'EQUIPMENT', 'Equipment'
        MAINTENANCE = 'MAINTENANCE', 'Maintenance'
        MARKETING = 'MARKETING', 'Marketing'
        INVENTORY = 'INVENTORY', 'Inventory'
        OTHER = 'OTHER', 'Other'

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='expenses')
    added_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses'
    )
    trainer = models.ForeignKey(
        'trainers.Trainer', on_delete=models.SET_NULL, null=True, blank=True, related_name='salary_expenses'
    )
    title = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    date = models.DateField()
    description = models.TextField(blank=True)
    receipt = models.FileField(upload_to='receipts/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'expenses'
        ordering = ['-date']

    def __str__(self):
        return f'{self.title} - PKR {self.amount}'

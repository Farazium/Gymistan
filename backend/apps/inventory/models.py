from django.db import models
from apps.gyms.models import Gym


class Product(models.Model):
    class Category(models.TextChoices):
        PROTEIN = 'PROTEIN', 'Protein'
        SUPPLEMENTS = 'SUPPLEMENTS', 'Supplements'
        SNACKS = 'SNACKS', 'Snacks'
        DRINKS = 'DRINKS', 'Drinks'
        EQUIPMENT = 'EQUIPMENT', 'Equipment'
        OTHER = 'OTHER', 'Other'

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    description = models.TextField(blank=True)
    sell_price = models.DecimalField(max_digits=10, decimal_places=2)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    quantity = models.PositiveIntegerField(default=0)
    low_stock_alert = models.PositiveIntegerField(default=5)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'products'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.gym.name})'

    @property
    def is_low_stock(self):
        return self.quantity <= self.low_stock_alert


class StockLog(models.Model):
    class Action(models.TextChoices):
        RESTOCK = 'RESTOCK', 'Restock'
        SELL = 'SELL', 'Sell'
        ADJUSTMENT = 'ADJUSTMENT', 'Adjustment'

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_logs')
    action = models.CharField(max_length=20, choices=Action.choices)
    quantity = models.IntegerField()
    note = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'stock_logs'
        ordering = ['-created_at']

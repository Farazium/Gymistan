from django.contrib import admin
from .models import Trainer, SalaryPayment


@admin.register(Trainer)
class TrainerAdmin(admin.ModelAdmin):
    list_display = ('name', 'gym', 'phone', 'monthly_salary', 'is_active')
    list_filter = ('gym', 'is_active')
    search_fields = ('name', 'phone')


@admin.register(SalaryPayment)
class SalaryPaymentAdmin(admin.ModelAdmin):
    list_display = ('trainer', 'month', 'base_salary', 'commission', 'amount', 'payment_date')
    list_filter = ('gym', 'month')
    search_fields = ('trainer__name',)

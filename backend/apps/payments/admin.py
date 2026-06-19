from django.contrib import admin
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('member', 'gym', 'amount_paid', 'status', 'payment_date', 'slip_sent')
    list_filter = ('status', 'gym', 'slip_sent')
    search_fields = ('member__name', 'member__phone')

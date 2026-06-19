from django.contrib import admin
from .models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('title', 'gym', 'amount', 'category', 'date')
    list_filter = ('category', 'gym')
    search_fields = ('title',)

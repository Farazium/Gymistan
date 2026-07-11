from django.contrib import admin
from .models import Package


@admin.register(Package)
class PackageAdmin(admin.ModelAdmin):
    list_display = ('name', 'gym', 'price', 'duration_months', 'is_active')
    list_filter = ('gym', 'is_active')

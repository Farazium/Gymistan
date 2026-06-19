from django.contrib import admin
from .models import Member


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'gym', 'package', 'status', 'expiry_date')
    list_filter = ('status', 'gym')
    search_fields = ('name', 'phone', 'cnic')

from rest_framework import serializers
from .models import DeviceConfig


class DeviceConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceConfig
        fields = ['name', 'ip', 'port', 'password', 'is_active',
                  'last_sync', 'last_sync_at', 'last_sync_status', 'last_sync_count']
        read_only_fields = ['last_sync', 'last_sync_at', 'last_sync_status', 'last_sync_count']

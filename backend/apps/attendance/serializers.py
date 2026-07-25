from rest_framework import serializers
from .models import DeviceConfig


class DeviceConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceConfig
        fields = ['name', 'ip', 'port', 'password', 'is_active',
                  'last_sync', 'last_sync_at', 'last_sync_status', 'last_sync_count',
                  'agent_token', 'agent_last_seen', 'agent_version', 'agent_serial']
        # The token is a credential: readable by the gym's own admin (this endpoint
        # is already gym-scoped and tier-gated) but never settable over the wire —
        # it changes only by being reissued.
        read_only_fields = ['last_sync', 'last_sync_at', 'last_sync_status', 'last_sync_count',
                            'agent_token', 'agent_last_seen', 'agent_version', 'agent_serial']

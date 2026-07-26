from rest_framework import serializers
from .models import DeviceConfig


class DeviceConfigSerializer(serializers.ModelSerializer):
    agent_update_available = serializers.SerializerMethodField()

    def get_agent_update_available(self, obj):
        """Whether the PC at the gym is running an older build than we ship.

        Not a fault — an older agent still syncs punches perfectly well — so this
        only lets the panel offer an update rather than nag about one. Imported
        here to keep the version in one place next to the code that cares."""
        from .views import CURRENT_AGENT_VERSION
        return bool(obj.agent_version) and obj.agent_version != CURRENT_AGENT_VERSION

    class Meta:
        model = DeviceConfig
        fields = ['name', 'ip', 'port', 'password', 'is_active',
                  'last_sync', 'last_sync_at', 'last_sync_status', 'last_sync_count',
                  'agent_token', 'agent_last_seen', 'agent_version', 'agent_serial',
                  'agent_update_available']
        # The token is a credential: readable by the gym's own admin (this endpoint
        # is already gym-scoped and tier-gated) but never settable over the wire —
        # it changes only by being reissued.
        read_only_fields = ['last_sync', 'last_sync_at', 'last_sync_status', 'last_sync_count',
                            'agent_token', 'agent_last_seen', 'agent_version', 'agent_serial',
                            'agent_update_available']

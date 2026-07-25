from django.urls import path
from .views import (AttendanceView, MarkAttendanceView, DeviceConfigView,
                    DeviceSyncView, DeviceUsersView, DeviceLiveView, DevicePushView,
                    DeviceEnrollView, DeviceFingerprintStatusView, DevicePingView,
                    AgentIngestView, AgentTokenResetView, AgentCommandsView,
                    AgentLiveScanView)

urlpatterns = [
    path('', AttendanceView.as_view(), name='attendance'),
    path('mark/', MarkAttendanceView.as_view(), name='attendance_mark'),
    path('device/', DeviceConfigView.as_view(), name='device_config'),
    path('device/ping/', DevicePingView.as_view(), name='device_ping'),
    path('device/sync/', DeviceSyncView.as_view(), name='device_sync'),
    path('device/users/', DeviceUsersView.as_view(), name='device_users'),
    path('device/live/', DeviceLiveView.as_view(), name='device_live'),
    path('device/push/', DevicePushView.as_view(), name='device_push'),
    path('device/enroll/', DeviceEnrollView.as_view(), name='device_enroll'),
    path('device/fingerprint/', DeviceFingerprintStatusView.as_view(), name='device_fingerprint'),
    # The gym-PC agent's endpoint. Token-authenticated, not JWT — see AgentIngestView.
    path('device/ingest/', AgentIngestView.as_view(), name='device_ingest'),
    path('device/agent-token/', AgentTokenResetView.as_view(), name='device_agent_token'),
    path('device/commands/', AgentCommandsView.as_view(), name='device_commands'),
    path('device/live-scan/', AgentLiveScanView.as_view(), name='device_live_scan'),
]

from django.urls import path
from .views import (AttendanceView, MarkAttendanceView, DeviceConfigView,
                    DeviceSyncView, DeviceUsersView, DeviceLiveView, DevicePushView,
                    DeviceEnrollView, DeviceFingerprintStatusView)

urlpatterns = [
    path('', AttendanceView.as_view(), name='attendance'),
    path('mark/', MarkAttendanceView.as_view(), name='attendance_mark'),
    path('device/', DeviceConfigView.as_view(), name='device_config'),
    path('device/sync/', DeviceSyncView.as_view(), name='device_sync'),
    path('device/users/', DeviceUsersView.as_view(), name='device_users'),
    path('device/live/', DeviceLiveView.as_view(), name='device_live'),
    path('device/push/', DevicePushView.as_view(), name='device_push'),
    path('device/enroll/', DeviceEnrollView.as_view(), name='device_enroll'),
    path('device/fingerprint/', DeviceFingerprintStatusView.as_view(), name='device_fingerprint'),
]

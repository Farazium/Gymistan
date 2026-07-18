from django.urls import path
from .views import (AttendanceView, MarkAttendanceView, DeviceConfigView,
                    DeviceSyncView, DeviceUsersView, DeviceLiveView)

urlpatterns = [
    path('', AttendanceView.as_view(), name='attendance'),
    path('mark/', MarkAttendanceView.as_view(), name='attendance_mark'),
    path('device/', DeviceConfigView.as_view(), name='device_config'),
    path('device/sync/', DeviceSyncView.as_view(), name='device_sync'),
    path('device/users/', DeviceUsersView.as_view(), name='device_users'),
    path('device/live/', DeviceLiveView.as_view(), name='device_live'),
]

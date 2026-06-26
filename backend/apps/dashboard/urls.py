from django.urls import path
from .views import DashboardView, SuperAdminDashboardView

urlpatterns = [
    path('', DashboardView.as_view(), name='dashboard'),
    path('superadmin/', SuperAdminDashboardView.as_view(), name='superadmin_dashboard'),
]

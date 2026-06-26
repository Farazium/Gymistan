from django.urls import path
from .views import GymListCreateView, GymDetailView, ToggleGymStatusView, GymStatsView, ResetGymAdminPasswordView, RenewGymView

urlpatterns = [
    path('', GymListCreateView.as_view(), name='gym_list_create'),
    path('<int:pk>/', GymDetailView.as_view(), name='gym_detail'),
    path('<int:pk>/toggle/', ToggleGymStatusView.as_view(), name='gym_toggle'),
    path('<int:pk>/stats/', GymStatsView.as_view(), name='gym_stats'),
    path('<int:pk>/reset-admin-password/', ResetGymAdminPasswordView.as_view(), name='gym_reset_password'),
    path('<int:pk>/renew/', RenewGymView.as_view(), name='gym_renew'),
]

from django.urls import path
from .views import GymListCreateView, GymDetailView, ToggleGymStatusView

urlpatterns = [
    path('', GymListCreateView.as_view(), name='gym_list_create'),
    path('<int:pk>/', GymDetailView.as_view(), name='gym_detail'),
    path('<int:pk>/toggle/', ToggleGymStatusView.as_view(), name='gym_toggle'),
]

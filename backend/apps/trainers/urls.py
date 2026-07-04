from django.urls import path
from .views import TrainerListCreateView, TrainerDetailView, PaySalaryView

urlpatterns = [
    path('', TrainerListCreateView.as_view()),
    path('<int:pk>/', TrainerDetailView.as_view()),
    path('<int:pk>/pay-salary/', PaySalaryView.as_view()),
]

from django.urls import path
from .views import MemberListCreateView, MemberDetailView

urlpatterns = [
    path('', MemberListCreateView.as_view(), name='member_list_create'),
    path('<int:pk>/', MemberDetailView.as_view(), name='member_detail'),
]

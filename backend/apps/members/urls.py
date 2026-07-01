from django.urls import path
from .views import MemberListCreateView, MemberDetailView, MemberNextIdView

urlpatterns = [
    path('', MemberListCreateView.as_view(), name='member_list_create'),
    path('next-id/', MemberNextIdView.as_view(), name='member_next_id'),
    path('<int:pk>/', MemberDetailView.as_view(), name='member_detail'),
]

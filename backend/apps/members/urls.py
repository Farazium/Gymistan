from django.urls import path
from .views import MemberListCreateView, MemberDetailView, MemberNextIdView, DeletedMembersView, RestoreMemberView, HardDeleteMemberView, SendReminderView

urlpatterns = [
    path('', MemberListCreateView.as_view(), name='member_list_create'),
    path('next-id/', MemberNextIdView.as_view(), name='member_next_id'),
    path('deleted/', DeletedMembersView.as_view(), name='member_deleted'),
    path('<int:pk>/', MemberDetailView.as_view(), name='member_detail'),
    path('<int:pk>/restore/', RestoreMemberView.as_view(), name='member_restore'),
    path('<int:pk>/hard-delete/', HardDeleteMemberView.as_view(), name='member_hard_delete'),
    path('<int:pk>/reminder/', SendReminderView.as_view(), name='member_reminder'),
]

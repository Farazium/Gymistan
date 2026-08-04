from django.urls import path
from .views import MemberListCreateView, MemberDetailView, MemberNextIdView, DeletedMembersView, RestoreMemberView, HardDeleteMemberView, SendReminderView, SendDuesReminderView, BlacklistedMembersView, BlacklistMemberView

urlpatterns = [
    path('', MemberListCreateView.as_view(), name='member_list_create'),
    path('next-id/', MemberNextIdView.as_view(), name='member_next_id'),
    path('deleted/', DeletedMembersView.as_view(), name='member_deleted'),
    path('blacklisted/', BlacklistedMembersView.as_view(), name='member_blacklisted'),
    path('<int:pk>/', MemberDetailView.as_view(), name='member_detail'),
    path('<int:pk>/restore/', RestoreMemberView.as_view(), name='member_restore'),
    path('<int:pk>/hard-delete/', HardDeleteMemberView.as_view(), name='member_hard_delete'),
    path('<int:pk>/blacklist/', BlacklistMemberView.as_view(), name='member_blacklist'),
    path('<int:pk>/reminder/', SendReminderView.as_view(), name='member_reminder'),
    path('<int:pk>/dues-reminder/', SendDuesReminderView.as_view(), name='member_dues_reminder'),
]

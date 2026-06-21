from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Member
from .serializers import MemberSerializer, MemberListSerializer
from apps.accounts.permissions import IsGymMember
from apps.payments.models import Payment
import datetime


class MemberListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsGymMember]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'package']
    search_fields = ['name', 'phone']
    ordering_fields = ['name', 'join_date', 'expiry_date']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return MemberListSerializer
        return MemberSerializer

    def get_queryset(self):
        return Member.objects.filter(gym=self.request.user.gym).select_related('package')

    def perform_create(self, serializer):
        member = serializer.save(gym=self.request.user.gym)
        admission_fee = self.request.data.get('admission_fee')
        if admission_fee:
            try:
                fee = float(admission_fee)
                if fee > 0:
                    Payment.objects.create(
                        gym=self.request.user.gym,
                        member=member,
                        collected_by=self.request.user,
                        amount=fee,
                        amount_paid=fee,
                        status='PAID',
                        notes='Admission fee',
                    )
            except (ValueError, TypeError):
                pass


class MemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MemberSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return Member.objects.filter(gym=self.request.user.gym)

    def perform_destroy(self, instance):
        cutoff = datetime.date.today() - datetime.timedelta(days=180)
        instance.payments.filter(payment_date__lt=cutoff).delete()
        instance.delete()

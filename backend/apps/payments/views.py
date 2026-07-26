from rest_framework import generics, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from .models import Payment
from .serializers import PaymentSerializer
from .utils import generate_payment_slip, send_whatsapp_slip, OUT_OF_CREDITS
from apps.accounts.permissions import IsGymMember
from apps.gyms.models import WA_TIERS
from apps.common.dates import renew_from
import datetime
from django.utils import timezone


class PaymentListCreateView(generics.ListCreateAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated, IsGymMember]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'member', 'package']
    search_fields = ['member__name', 'member__phone', 'month']
    ordering_fields = ['payment_date', 'amount_paid']
    ordering = ['-created_at']

    def get_queryset(self):
        return Payment.objects.filter(gym=self.request.user.gym).select_related(
            'member', 'package', 'collected_by'
        )

    def perform_create(self, serializer):
        payment = serializer.save(gym=self.request.user.gym, collected_by=self.request.user)
        if payment.status == 'PAID' and payment.package:
            member = payment.member
            new_expiry = renew_from(
                member.expiry_date, payment.package.duration_months,
                anchor_day=member.join_date.day if member.join_date else None,
            )
            payment.prev_expiry = member.expiry_date
            payment.new_expiry = new_expiry
            payment.save(update_fields=['prev_expiry', 'new_expiry'])
            member.expiry_date = new_expiry
            member.status = 'ACTIVE'
            member.save(update_fields=['expiry_date', 'status'])


class PaymentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return Payment.objects.filter(gym=self.request.user.gym)

    def destroy(self, request, *args, **kwargs):
        payment = self.get_object()
        # Cashflow records lock into the books after their grace window: deletable
        # (soft) within 24h of entry, permanent after that.
        if not payment.within_delete_window():
            return Response(
                {'detail': 'This payment is more than 24 hours old and is now a permanent record; it can no longer be deleted.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        payment.soft_delete(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DownloadSlipView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request, pk):
        try:
            payment = Payment.objects.select_related('member', 'package', 'gym').get(
                pk=pk, gym=request.user.gym
            )
        except Payment.DoesNotExist:
            return Response({'message': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        pdf_buffer = generate_payment_slip(payment)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="slip_{payment.id}.pdf"'
        return response


class SendWhatsAppSlipView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def post(self, request, pk):
        try:
            payment = Payment.objects.select_related('member', 'package', 'gym').get(
                pk=pk, gym=request.user.gym
            )
        except Payment.DoesNotExist:
            return Response({'message': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if payment.gym.tier not in WA_TIERS:
            return Response({'message': 'WhatsApp is not enabled for your plan'},
                            status=status.HTTP_403_FORBIDDEN)

        if payment.gym.wa_exhausted:
            return Response({'message': OUT_OF_CREDITS, 'out_of_credits': True},
                            status=status.HTTP_402_PAYMENT_REQUIRED)

        # A receipt for a payment is sent exactly once — no resends.
        if payment.slip_sent:
            return Response(
                {'message': 'Receipt already sent for this payment', 'already_sent': True},
                status=status.HTTP_409_CONFLICT,
            )

        sent, detail = send_whatsapp_slip(payment)

        if sent:
            payment.slip_sent = True
            payment.save(update_fields=['slip_sent'])
            return Response({'message': 'Slip sent via WhatsApp'})
        return Response({'message': f'Failed to send WhatsApp message: {detail}'},
                        status=status.HTTP_502_BAD_GATEWAY)

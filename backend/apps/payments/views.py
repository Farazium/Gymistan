from rest_framework import generics, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from .models import Payment
from .serializers import PaymentSerializer
from .utils import generate_payment_slip, send_whatsapp_slip
from apps.accounts.permissions import IsGymMember
import datetime


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
            base = member.expiry_date if member.expiry_date else datetime.date.today()
            months = round(payment.package.duration_days / 30)
            m = base.month - 1 + months
            new_expiry = base.replace(year=base.year + m // 12, month=m % 12 + 1)
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

        sent, detail = send_whatsapp_slip(payment)

        if sent:
            payment.slip_sent = True
            payment.save(update_fields=['slip_sent'])
            return Response({'message': 'Slip sent via WhatsApp'})
        return Response({'message': f'Failed to send WhatsApp message: {detail}'},
                        status=status.HTTP_502_BAD_GATEWAY)

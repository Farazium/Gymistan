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
        serializer.save(gym=self.request.user.gym, collected_by=self.request.user)


class PaymentDetailView(generics.RetrieveUpdateAPIView):
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
            payment = Payment.objects.select_related('member', 'gym').get(
                pk=pk, gym=request.user.gym
            )
        except Payment.DoesNotExist:
            return Response({'message': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        sent = send_whatsapp_slip(
            phone=payment.member.phone,
            member_name=payment.member.name,
            gym_name=payment.gym.name,
            amount=payment.amount_paid,
            status=payment.status,
        )

        if sent:
            payment.slip_sent = True
            payment.save(update_fields=['slip_sent'])
            return Response({'message': 'Slip sent via WhatsApp'})
        return Response({'message': 'Failed to send WhatsApp message'}, status=status.HTTP_502_BAD_GATEWAY)

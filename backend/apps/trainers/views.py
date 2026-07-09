import datetime
from decimal import Decimal, InvalidOperation
from rest_framework import generics, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from apps.accounts.permissions import IsGymMember
from apps.expenses.models import Expense
from .models import Trainer, SalaryPayment
from .serializers import (
    TrainerSerializer, TrainerDetailSerializer, SalaryPaymentSerializer, salary_status_for, _due_date,
)


class TrainerListCreateView(generics.ListCreateAPIView):
    serializer_class = TrainerSerializer
    permission_classes = [IsAuthenticated, IsGymMember]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'phone']
    ordering_fields = ['name', 'join_date', 'monthly_salary']
    ordering = ['name']

    def get_queryset(self):
        qs = Trainer.objects.filter(gym=self.request.user.gym)
        active = self.request.query_params.get('is_active')
        if active in ('true', 'false'):
            qs = qs.filter(is_active=(active == 'true'))
        return qs

    def perform_create(self, serializer):
        serializer.save(gym=self.request.user.gym)


class TrainerDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return Trainer.objects.filter(gym=self.request.user.gym)

    def get_serializer_class(self):
        return TrainerDetailSerializer if self.request.method == 'GET' else TrainerSerializer


class PaySalaryView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def post(self, request, pk):
        try:
            trainer = Trainer.objects.get(pk=pk, gym=request.user.gym)
        except Trainer.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            base = Decimal(str(request.data.get('base_salary', trainer.monthly_salary or 0)))
            commission = Decimal(str(request.data.get('commission') or 0))
        except (InvalidOperation, TypeError):
            return Response({'detail': 'Invalid amount'}, status=status.HTTP_400_BAD_REQUEST)

        if base < 0 or commission < 0:
            return Response({'detail': 'Amounts cannot be negative'}, status=status.HTTP_400_BAD_REQUEST)

        total = base + commission
        if total <= 0:
            return Response({'detail': 'Total must be greater than 0'}, status=status.HTTP_400_BAD_REQUEST)

        today = datetime.date.today()

        # The salary month is derived from the payment date — no separate field.
        date_str = request.data.get('payment_date')
        try:
            payment_date = datetime.date.fromisoformat(date_str) if date_str else today
        except (ValueError, TypeError):
            payment_date = today
        month = payment_date.strftime('%Y-%m')

        # Salary can't be paid before its due date: the trainer's join day within
        # the paid month. Until that day arrives the salary hasn't accrued.
        join_day = trainer.join_date.day if trainer.join_date else 1
        due_date = _due_date(payment_date.year, payment_date.month, join_day)
        if today < due_date:
            return Response(
                {'detail': f"Salary for {due_date.strftime('%B %Y')} isn't due yet — "
                           f"it can be paid on or after {due_date.strftime('%d %b %Y')}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        note = request.data.get('note', '')
        desc = f'Salary for {month}'
        if commission > 0:
            desc += f' (incl. commission PKR {commission:,.0f})'

        with transaction.atomic():
            # Lock the trainer row so two near-simultaneous "Pay" clicks can't both
            # slip past the already-paid check and each record an expense.
            Trainer.objects.select_for_update().get(pk=trainer.pk)

            # One salary payment per trainer per month — block duplicates outright.
            if SalaryPayment.objects.filter(trainer=trainer, month=month).exists():
                return Response(
                    {'detail': f"Salary for {due_date.strftime('%B %Y')} has already been paid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            expense = Expense.objects.create(
                gym=trainer.gym,
                added_by=request.user,
                trainer=trainer,
                title=f'Salary — {trainer.name}',
                amount=total,
                category='SALARIES',
                date=payment_date,
                description=desc,
            )
            payment = SalaryPayment.objects.create(
                gym=trainer.gym,
                trainer=trainer,
                month=month,
                base_salary=base,
                commission=commission,
                amount=total,
                payment_date=payment_date,
                note=note,
                expense=expense,
                paid_by=request.user,
            )

        return Response({
            'payment': SalaryPaymentSerializer(payment).data,
            'salary_status': salary_status_for(trainer),
        }, status=status.HTTP_201_CREATED)

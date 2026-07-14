from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum
from django.utils import timezone
from .models import Gym, GymPayment, WhatsAppBill
from .serializers import GymSerializer, CreateGymSerializer, GymPaymentSerializer, WhatsAppBillSerializer
from . import billing
from apps.members.queries import active_q, expired_q, expiring_soon_q
from apps.common.dates import renew_from
from apps.accounts.permissions import IsSuperAdmin
from apps.members.models import Member
from apps.payments.models import Payment
from apps.expenses.models import Expense
from apps.inventory.models import Product, StockLog


class GymListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        gyms = Gym.objects.prefetch_related('members', 'users').all()
        serializer = GymSerializer(gyms, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CreateGymSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gym = serializer.save()
        return Response(GymSerializer(gym).data, status=status.HTTP_201_CREATED)


class GymDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_gym(self, request, pk=None):
        if request.user.role == 'SUPERADMIN':
            return Gym.objects.get(pk=pk)
        return request.user.gym

    def get(self, request, pk=None):
        gym = self.get_gym(request, pk)
        return Response(GymSerializer(gym).data)

    def patch(self, request, pk=None):
        gym = self.get_gym(request, pk)
        serializer = GymSerializer(gym, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ToggleGymStatusView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        gym = Gym.objects.get(pk=pk)
        gym.is_active = not gym.is_active
        gym.save()
        return Response({'is_active': gym.is_active})


class GymStatsView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request, pk):
        gym = Gym.objects.get(pk=pk)
        today = timezone.localdate()
        month_start = today.replace(day=1)

        members = Member.objects.filter(gym=gym, is_deleted=False)
        payments = Payment.objects.filter(gym=gym)
        revenue = payments.filter(payment_date__gte=month_start).aggregate(t=Sum('amount_paid'))['t'] or 0
        expenses = Expense.objects.filter(gym=gym, date__gte=month_start).aggregate(t=Sum('amount'))['t'] or 0

        admin = gym.users.filter(role='GYM_ADMIN').first()

        products = list(Product.objects.filter(gym=gym, is_active=True))
        low_stock_count = sum(1 for p in products if p.is_low_stock)
        stock_value = sum(float(p.sell_price) * p.quantity for p in products)
        sales = StockLog.objects.filter(product__gym=gym, action='SELL', created_at__date__gte=month_start).select_related('product')
        inventory_revenue = sum(float(l.product.sell_price) * l.quantity for l in sales)
        inventory_profit = sum((float(l.product.sell_price) - float(l.product.cost_price)) * l.quantity for l in sales)

        return Response({
            'gym': GymSerializer(gym).data,
            'admin': {'id': admin.id, 'name': admin.name, 'email': admin.email} if admin else None,
            'stats': {
                'total_members': members.count(),
                'active_members': members.filter(active_q(today)).count(),
                'expired_members': members.filter(expired_q(today)).count(),
                'expiring_soon': members.filter(expiring_soon_q(7, today)).count(),
                'revenue_this_month': float(revenue),
                'expenses_this_month': float(expenses),
                # Cash basis: member fees + inventory sales − all expenses (stock
                # purchases are already booked as INVENTORY expenses).
                'net_profit': float(revenue) + inventory_revenue - float(expenses),
                'inventory_products': len(products),
                'inventory_low_stock': low_stock_count,
                'inventory_stock_value': round(stock_value, 2),
                'inventory_revenue': round(inventory_revenue, 2),
                'inventory_profit': round(inventory_profit, 2),
            },
        })


class RenewGymView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        gym = Gym.objects.get(pk=pk)
        months = int(request.data.get('months', 1))
        gym.expiry_date = renew_from(gym.expiry_date, months)
        gym.save(update_fields=['expiry_date'])
        return Response({'expiry_date': gym.expiry_date})


class GymPaymentListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        qs = GymPayment.objects.select_related('gym').all()
        gym_id = request.query_params.get('gym')
        if gym_id:
            qs = qs.filter(gym_id=gym_id)
        serializer = GymPaymentSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = GymPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()

        gym = payment.gym
        gym.expiry_date = renew_from(gym.expiry_date, payment.months)
        gym.save(update_fields=['expiry_date'])

        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GymPaymentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def delete(self, request, pk):
        payment = GymPayment.objects.get(pk=pk)
        payment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _serialize_period(gym, period):
    """Shape a live current-period dict for the API (mirrors WhatsAppBillSerializer)."""
    return {
        'gym': gym.id,
        'gym_name': gym.name,
        'period_start': period['period_start'],
        'period_end': period['period_end'],
        'message_count': period['message_count'],
        'rate': period['rate'],
        'amount': period['amount'],
    }


class WhatsAppBillingView(APIView):
    """Gym admin: their own WhatsApp usage — live current period + past bills."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        gym = request.user.gym
        if not gym:
            return Response({'current_period': None, 'bills': []})
        billing.ensure_bills(gym)
        bills = WhatsAppBill.objects.filter(gym=gym)
        return Response({
            'current_period': _serialize_period(gym, billing.current_period(gym)),
            'bills': WhatsAppBillSerializer(bills, many=True).data,
        })


class WhatsAppBillListView(APIView):
    """Superadmin: all gyms' WhatsApp bills + live current-period running totals."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        gym_id = request.query_params.get('gym')
        gyms = Gym.objects.all()
        if gym_id:
            gyms = gyms.filter(id=gym_id)
        current = []
        for gym in gyms:
            billing.ensure_bills(gym)
            period = billing.current_period(gym)
            if period['message_count']:
                current.append(_serialize_period(gym, period))
        bills = WhatsAppBill.objects.select_related('gym')
        if gym_id:
            bills = bills.filter(gym_id=gym_id)
        return Response({
            'bills': WhatsAppBillSerializer(bills, many=True).data,
            'current': current,
        })


class WhatsAppBillMarkPaidView(APIView):
    """Superadmin: toggle a bill between PENDING and PAID."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        bill = WhatsAppBill.objects.get(pk=pk)
        target = request.data.get('status')
        if target not in (WhatsAppBill.Status.PAID, WhatsAppBill.Status.PENDING):
            # No explicit target -> toggle
            target = (WhatsAppBill.Status.PAID if bill.status == WhatsAppBill.Status.PENDING
                      else WhatsAppBill.Status.PENDING)
        bill.status = target
        bill.paid_at = timezone.now() if target == WhatsAppBill.Status.PAID else None
        bill.save(update_fields=['status', 'paid_at'])
        return Response(WhatsAppBillSerializer(bill).data)


class ResetGymAdminPasswordView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        gym = Gym.objects.get(pk=pk)
        admin = gym.users.filter(role='GYM_ADMIN').first()
        if not admin:
            return Response({'error': 'No admin found for this gym'}, status=status.HTTP_404_NOT_FOUND)
        name = request.data.get('name', '').strip()
        new_password = request.data.get('new_password', '').strip()
        if name:
            admin.name = name
        if new_password:
            if len(new_password) < 6:
                return Response({'error': 'Password must be at least 6 characters'}, status=status.HTTP_400_BAD_REQUEST)
            admin.set_password(new_password)
        admin.save()
        return Response({'name': admin.name, 'email': admin.email})

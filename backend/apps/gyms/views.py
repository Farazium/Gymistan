from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum
from django.utils import timezone
from .models import Gym, GymPayment, WhatsAppTopup, WA_TIERS, TierInfo
from .serializers import (
    GymSerializer, CreateGymSerializer, GymPaymentSerializer,
    WhatsAppTopupSerializer, CreateTopupSerializer, TierInfoSerializer,
)
from . import credits
from apps.members.queries import active_q, expired_q, expiring_soon_q
from apps.common.dates import renew_gym_from
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
        gym.expiry_date = renew_gym_from(gym.expiry_date, months)
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
        gym.expiry_date = renew_gym_from(gym.expiry_date, payment.months)
        gym.save(update_fields=['expiry_date'])

        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GymPaymentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def delete(self, request, pk):
        payment = GymPayment.objects.get(pk=pk)
        payment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _credit_state(gym):
    """The balance shape both the gym's own view and the superadmin's share."""
    return {
        'gym': gym.id,
        'gym_name': gym.name,
        'allowance': gym.wa_allowance,
        'used': gym.wa_used,
        'remaining': gym.wa_remaining,
        'percent_used': gym.wa_percent_used,
        'alert_level': credits.alert_level(gym),
        'exhausted': gym.wa_exhausted,
        'rate': gym.whatsapp_rate,
    }


class WhatsAppBillingView(APIView):
    """Gym admin: their own prepaid message balance + top-up history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        gym = request.user.gym
        if not gym:
            return Response({'credits': None, 'topups': []})
        topups = WhatsAppTopup.objects.filter(gym=gym)
        return Response({
            'credits': _credit_state(gym),
            'topups': WhatsAppTopupSerializer(topups, many=True).data,
        })


class WhatsAppCreditListView(APIView):
    """Superadmin: every WhatsApp-tier gym's balance, plus top-up history."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        gym_id = request.query_params.get('gym')
        gyms = Gym.objects.filter(tier__in=WA_TIERS)
        topups = WhatsAppTopup.objects.select_related('gym', 'created_by')
        if gym_id:
            gyms = gyms.filter(id=gym_id)
            topups = topups.filter(gym_id=gym_id)
        return Response({
            'credits': [_credit_state(g) for g in gyms],
            'topups': WhatsAppTopupSerializer(topups, many=True).data,
        })


class WhatsAppTopupView(APIView):
    """Superadmin: sell a gym a pack of messages from its profile."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        try:
            gym = Gym.objects.get(pk=pk)
        except Gym.DoesNotExist:
            return Response({'message': 'Gym not found'}, status=status.HTTP_404_NOT_FOUND)
        if gym.tier not in WA_TIERS:
            return Response({'message': "This gym's plan doesn't include WhatsApp"},
                            status=status.HTTP_400_BAD_REQUEST)
        s = CreateTopupSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        topup = credits.topup(
            gym,
            messages=s.validated_data['messages'],
            amount=s.validated_data.get('amount'),
            notes=s.validated_data.get('notes', ''),
            user=request.user,
        )
        gym.refresh_from_db()
        return Response({
            'topup': WhatsAppTopupSerializer(topup).data,
            'credits': _credit_state(gym),
        }, status=status.HTTP_201_CREATED)


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


# The four ids that drive feature gating and gym assignment — never deletable.
BUILTIN_TIERS = {'TIER1', 'TIER2_WA', 'TIER2_AT', 'TIER3'}


class TierInfoListView(APIView):
    """Read the editable plan copy (any signed-in user — the gym dashboard reads
    the same source the superadmin edits). POST adds a display-only custom tier."""

    def get_permissions(self):
        return [IsAuthenticated(), IsSuperAdmin()] if self.request.method == 'POST' else [IsAuthenticated()]

    def get(self, request):
        return Response(TierInfoSerializer(TierInfo.objects.all(), many=True).data)

    def post(self, request):
        # Custom tiers get an auto id (CUSTOM1, CUSTOM2, …) so the built-in ids stay
        # reserved for feature gating.
        n = 1
        while TierInfo.objects.filter(tier_id=f'CUSTOM{n}').exists():
            n += 1
        last = TierInfo.objects.order_by('-sort_order').first()
        ser = TierInfoSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(tier_id=f'CUSTOM{n}', sort_order=(last.sort_order + 1 if last else 0))
        return Response(ser.data, status=status.HTTP_201_CREATED)


class TierInfoDetailView(APIView):
    """Superadmin: edit a tier's wording, or delete a custom (non-built-in) one."""
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def patch(self, request, tier_id):
        try:
            tier = TierInfo.objects.get(tier_id=tier_id)
        except TierInfo.DoesNotExist:
            return Response({'detail': 'Tier not found'}, status=status.HTTP_404_NOT_FOUND)
        ser = TierInfoSerializer(tier, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, tier_id):
        if tier_id in BUILTIN_TIERS:
            return Response({'detail': 'Built-in tiers cannot be deleted'}, status=status.HTTP_400_BAD_REQUEST)
        TierInfo.objects.filter(tier_id=tier_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum
from django.utils import timezone
from datetime import timedelta
from .models import Gym, GymPayment
from .serializers import GymSerializer, CreateGymSerializer, GymPaymentSerializer
from apps.accounts.permissions import IsSuperAdmin, IsGymAdminOrAbove
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
        today = timezone.now().date()
        month_start = today.replace(day=1)

        members = Member.objects.filter(gym=gym)
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
                'active_members': members.filter(status='ACTIVE').count(),
                'expired_members': members.filter(status='EXPIRED').count(),
                'expiring_soon': members.filter(status='ACTIVE', expiry_date__lte=today + timedelta(days=7), expiry_date__gte=today).count(),
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
        import datetime
        gym = Gym.objects.get(pk=pk)
        months = int(request.data.get('months', 1))
        base = gym.expiry_date or datetime.date.today()
        m = base.month - 1 + months
        new_expiry = base.replace(year=base.year + m // 12, month=m % 12 + 1)
        gym.expiry_date = new_expiry
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
        import datetime
        serializer = GymPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()

        gym = payment.gym
        months = payment.months
        base = gym.expiry_date if gym.expiry_date and gym.expiry_date >= datetime.date.today() else datetime.date.today()
        m = base.month - 1 + months
        gym.expiry_date = base.replace(year=base.year + m // 12, month=m % 12 + 1)
        gym.save(update_fields=['expiry_date'])

        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GymPaymentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def delete(self, request, pk):
        payment = GymPayment.objects.get(pk=pk)
        payment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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

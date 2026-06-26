from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta
from apps.members.models import Member
from apps.payments.models import Payment
from apps.expenses.models import Expense
from apps.inventory.models import Product, StockLog
from apps.gyms.models import Gym
from apps.accounts.permissions import IsGymMember, IsSuperAdmin


class DashboardView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        gym = request.user.gym
        today = timezone.now().date()
        month_start = today.replace(day=1)
        last_month_start = (month_start - timedelta(days=1)).replace(day=1)

        members = Member.objects.filter(gym=gym)
        active_members = members.filter(status='ACTIVE').count()
        expired_members = members.filter(status='EXPIRED').count()
        expiring_soon = members.filter(
            status='ACTIVE', expiry_date__lte=today + timedelta(days=7), expiry_date__gte=today
        ).count()
        new_members_this_month = members.filter(join_date__gte=month_start).count()

        payments = Payment.objects.filter(gym=gym)
        revenue_this_month = payments.filter(
            payment_date__gte=month_start
        ).aggregate(total=Sum('amount_paid'))['total'] or 0

        revenue_last_month = payments.filter(
            payment_date__gte=last_month_start, payment_date__lt=month_start
        ).aggregate(total=Sum('amount_paid'))['total'] or 0

        pending_payments = payments.filter(status='PENDING').aggregate(
            total=Sum('amount'), count=Count('id')
        )

        expenses_this_month = Expense.objects.filter(
            gym=gym, date__gte=month_start
        ).aggregate(total=Sum('amount'))['total'] or 0

        net_profit = float(revenue_this_month) - float(expenses_this_month)

        recent_payments = payments.select_related('member', 'package').order_by('-created_at')[:5]
        recent_payments_data = [
            {
                'id': p.id,
                'member_name': p.member.name if p.member else '—',
                'amount_paid': float(p.amount_paid),
                'status': p.status,
                'payment_date': p.payment_date,
            }
            for p in recent_payments
        ]

        members_expiring = members.filter(
            status='ACTIVE', expiry_date__lte=today + timedelta(days=7), expiry_date__gte=today
        ).values('id', 'name', 'phone', 'expiry_date')[:10]

        products = list(Product.objects.filter(gym=gym, is_active=True))
        total_products = len(products)
        low_stock_count = sum(1 for p in products if p.is_low_stock)
        inventory_sell_value = sum(float(p.sell_price) * p.quantity for p in products)

        sales_this_month = StockLog.objects.filter(
            product__gym=gym,
            action='SELL',
            created_at__date__gte=month_start,
        ).select_related('product')
        inventory_revenue_this_month = sum(
            float(log.product.sell_price) * log.quantity for log in sales_this_month
        )
        inventory_profit_this_month = sum(
            (float(log.product.sell_price) - float(log.product.cost_price)) * log.quantity
            for log in sales_this_month
        )

        return Response({
            'members': {
                'active': active_members,
                'expired': expired_members,
                'expiring_soon': expiring_soon,
                'new_this_month': new_members_this_month,
                'total': members.count(),
            },
            'revenue': {
                'this_month': float(revenue_this_month),
                'last_month': float(revenue_last_month),
                'growth': round(
                    ((float(revenue_this_month) - float(revenue_last_month)) / float(revenue_last_month) * 100)
                    if revenue_last_month else 0, 1
                ),
            },
            'expenses': {
                'this_month': float(expenses_this_month),
            },
            'net_profit': net_profit,
            'inventory': {
                'total_products': total_products,
                'low_stock_count': low_stock_count,
                'stock_value': round(inventory_sell_value, 2),
                'revenue_this_month': round(inventory_revenue_this_month, 2),
                'profit_this_month': round(inventory_profit_this_month, 2),
            },
            'recent_payments': recent_payments_data,
            'members_expiring_soon': list(members_expiring),
        })


class SuperAdminDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        today = timezone.now().date()
        month_start = today.replace(day=1)

        gyms = Gym.objects.all()
        total_gyms = gyms.count()
        active_gyms = gyms.filter(is_active=True).count()
        inactive_gyms = total_gyms - active_gyms

        total_members = Member.objects.count()
        active_members = Member.objects.filter(status='ACTIVE').count()
        new_this_month = Member.objects.filter(join_date__gte=month_start).count()

        revenue = Payment.objects.filter(payment_date__gte=month_start).aggregate(t=Sum('amount_paid'))['t'] or 0
        expenses = Expense.objects.filter(date__gte=month_start).aggregate(t=Sum('amount'))['t'] or 0

        top_gyms = (
            gyms.annotate(member_count=Count('members'))
            .order_by('-member_count')
            .values('id', 'name', 'is_active', 'member_count')[:5]
        )

        return Response({
            'gyms': {'total': total_gyms, 'active': active_gyms, 'inactive': inactive_gyms},
            'members': {'total': total_members, 'active': active_members, 'new_this_month': new_this_month},
            'revenue_this_month': float(revenue),
            'expenses_this_month': float(expenses),
            'net_profit': float(revenue) - float(expenses),
            'top_gyms': list(top_gyms),
        })

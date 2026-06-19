from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta
from apps.members.models import Member
from apps.payments.models import Payment
from apps.expenses.models import Expense
from apps.accounts.permissions import IsGymMember


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
                'member_name': p.member.name,
                'amount_paid': float(p.amount_paid),
                'status': p.status,
                'payment_date': p.payment_date,
            }
            for p in recent_payments
        ]

        members_expiring = members.filter(
            status='ACTIVE', expiry_date__lte=today + timedelta(days=7), expiry_date__gte=today
        ).values('id', 'name', 'phone', 'expiry_date')[:10]

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
            'pending_payments': {
                'total': float(pending_payments['total'] or 0),
                'count': pending_payments['count'] or 0,
            },
            'recent_payments': recent_payments_data,
            'members_expiring_soon': list(members_expiring),
        })

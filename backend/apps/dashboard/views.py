import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.utils.timezone import localdate
from datetime import timedelta
from apps.members.models import Member
from apps.payments.models import Payment
from apps.expenses.models import Expense
from apps.inventory.models import Product, StockLog
from apps.gyms.models import Gym, GymPayment
from apps.accounts.permissions import IsGymMember, IsSuperAdmin


class DashboardView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        gym = request.user.gym
        today = localdate()
        month_start = today.replace(day=1)
        last_month_start = (month_start - timedelta(days=1)).replace(day=1)

        members = Member.objects.filter(gym=gym, is_deleted=False)
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

        expenses_this_month = Expense.objects.filter(
            gym=gym, date__gte=month_start
        ).aggregate(total=Sum('amount'))['total'] or 0

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

        sales_last_month = StockLog.objects.filter(
            product__gym=gym,
            action='SELL',
            created_at__date__gte=last_month_start,
            created_at__date__lt=month_start,
        ).select_related('product')
        inventory_revenue_last_month = sum(
            float(log.product.sell_price) * log.quantity for log in sales_last_month
        )

        total_revenue_this_month = float(revenue_this_month) + inventory_revenue_this_month
        total_revenue_last_month = float(revenue_last_month) + inventory_revenue_last_month
        # Cash basis: total money in − all expenses (stock purchases are booked as
        # INVENTORY expenses, so cost of goods is captured there, not subtracted twice).
        net_profit = total_revenue_this_month - float(expenses_this_month)

        return Response({
            'members': {
                'active': active_members,
                'expired': expired_members,
                'expiring_soon': expiring_soon,
                'new_this_month': new_members_this_month,
                'total': members.count(),
            },
            'revenue': {
                'this_month': round(total_revenue_this_month, 2),
                'last_month': round(total_revenue_last_month, 2),
                'growth': round(
                    ((total_revenue_this_month - total_revenue_last_month) / total_revenue_last_month * 100)
                    if total_revenue_last_month else 0, 1
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
        today = localdate()
        month_start = today.replace(day=1)

        gyms = Gym.objects.all()
        total_gyms = gyms.count()
        active_gyms = gyms.filter(is_active=True).count()
        inactive_gyms = total_gyms - active_gyms

        subscription_revenue_month = GymPayment.objects.filter(
            payment_date__gte=month_start
        ).aggregate(t=Sum('amount'))['t'] or 0
        subscription_revenue_total = GymPayment.objects.aggregate(t=Sum('amount'))['t'] or 0

        gyms_expiring_soon = gyms.filter(
            is_active=True,
            expiry_date__lte=today + timedelta(days=7),
            expiry_date__gte=today,
        ).count()

        top_gyms = (
            gyms.annotate(member_count=Count('members', filter=Q(members__is_deleted=False)))
            .order_by('-member_count')
            .values('id', 'name', 'is_active', 'member_count')[:5]
        )

        recent_gym_payments = list(
            GymPayment.objects.select_related('gym')
            .order_by('-payment_date', '-created_at')[:5]
            .values('id', 'gym__name', 'amount', 'payment_date', 'payment_method', 'notes')
        )

        return Response({
            'gyms': {
                'total': total_gyms, 'active': active_gyms, 'inactive': inactive_gyms,
                'expiring_soon': gyms_expiring_soon,
            },
            'subscription_revenue_month': float(subscription_revenue_month),
            'subscription_revenue_total': float(subscription_revenue_total),
            'top_gyms': list(top_gyms),
            'recent_gym_payments': recent_gym_payments,
        })


class FinanceLedgerView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        gym = request.user.gym
        today = datetime.date.today()
        five_years_ago = today.replace(year=today.year - 5)

        start_str = request.query_params.get('start')
        end_str = request.query_params.get('end')

        try:
            start = datetime.date.fromisoformat(start_str) if start_str else today.replace(day=1)
            end = datetime.date.fromisoformat(end_str) if end_str else today
        except ValueError:
            start = today.replace(day=1)
            end = today

        start = max(start, five_years_ago)
        end = min(end, today)

        entries = []

        for p in Payment.objects.filter(gym=gym, payment_date__range=[start, end]).select_related('member'):
            is_admission = p.notes and p.notes.lower() == 'admission fee'
            entries.append({
                'date': p.payment_date.isoformat(),
                'description': p.member.name if p.member else 'Unknown Member',
                'category': 'Admission Fee' if is_admission else 'Member Fee',
                'type': 'IN',
                'amount': float(p.amount_paid),
            })

        for s in StockLog.objects.filter(
            product__gym=gym, action='SELL', created_at__date__range=[start, end]
        ).select_related('product'):
            entries.append({
                'date': s.created_at.date().isoformat(),
                'description': s.product.name,
                'category': 'Inventory Sale',
                'type': 'IN',
                'amount': round(float(s.quantity * s.product.sell_price), 2),
            })

        for e in Expense.objects.filter(gym=gym, date__range=[start, end]):
            entries.append({
                'date': e.date.isoformat(),
                'description': e.title,
                'category': e.get_category_display(),
                'type': 'OUT',
                'amount': float(e.amount),
            })

        entries.sort(key=lambda x: x['date'], reverse=True)
        total_in = sum(e['amount'] for e in entries if e['type'] == 'IN')
        total_out = sum(e['amount'] for e in entries if e['type'] == 'OUT')

        return Response({
            'entries': entries,
            'total_in': round(total_in, 2),
            'total_out': round(total_out, 2),
            'net': round(total_in - total_out, 2),
        })


class FinanceIncomeStatementView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        gym = request.user.gym
        today = datetime.date.today()

        try:
            year = int(request.query_params.get('year', today.year))
        except ValueError:
            year = today.year
        year = max(year, today.year - 5)

        try:
            month = int(request.query_params.get('month')) if request.query_params.get('month') else None
        except ValueError:
            month = None

        if month:
            start = datetime.date(year, month, 1)
            end = datetime.date(year, month + 1, 1) - datetime.timedelta(days=1) if month < 12 else datetime.date(year, 12, 31)
        else:
            start = datetime.date(year, 1, 1)
            end = datetime.date(year, 12, 31)

        end = min(end, today)

        member_revenue = float(
            Payment.objects.filter(gym=gym, payment_date__range=[start, end], status='PAID')
            .aggregate(t=Sum('amount_paid'))['t'] or 0
        )
        inventory_revenue = sum(
            float(s.quantity * s.product.sell_price)
            for s in StockLog.objects.filter(
                product__gym=gym, action='SELL', created_at__date__range=[start, end]
            ).select_related('product')
        )
        total_revenue = member_revenue + inventory_revenue

        expense_cats = {}
        for e in Expense.objects.filter(gym=gym, date__range=[start, end]):
            cat = e.get_category_display()
            expense_cats[cat] = expense_cats.get(cat, 0) + float(e.amount)
        total_expenses = sum(expense_cats.values())

        return Response({
            'period': {'start': start.isoformat(), 'end': end.isoformat(), 'year': year, 'month': month},
            'revenue': {
                'member_fees': round(member_revenue, 2),
                'inventory_sales': round(inventory_revenue, 2),
                'total': round(total_revenue, 2),
            },
            'expenses': {
                'by_category': [{'name': k, 'amount': round(v, 2)} for k, v in sorted(expense_cats.items(), key=lambda x: -x[1])],
                'total': round(total_expenses, 2),
            },
            'net_profit': round(total_revenue - total_expenses, 2),
        })


class FinanceExpenseCategoriesView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        gym = request.user.gym
        today = datetime.date.today()
        five_years_ago = today.replace(year=today.year - 5)

        start_str = request.query_params.get('start')
        end_str = request.query_params.get('end')

        try:
            start = datetime.date.fromisoformat(start_str) if start_str else today.replace(day=1)
            end = datetime.date.fromisoformat(end_str) if end_str else today
        except ValueError:
            start = today.replace(day=1)
            end = today

        start = max(start, five_years_ago)
        end = min(end, today)

        categories = {}
        for e in Expense.objects.filter(gym=gym, date__range=[start, end]).order_by('-date'):
            cat = e.get_category_display()
            if cat not in categories:
                categories[cat] = {'total': 0, 'count': 0, 'entries': []}
            categories[cat]['total'] += float(e.amount)
            categories[cat]['count'] += 1
            categories[cat]['entries'].append({
                'date': e.date.isoformat(),
                'title': e.title,
                'amount': float(e.amount),
            })

        total = sum(c['total'] for c in categories.values())
        result = sorted(
            [{'category': k, 'pct': round(v['total'] / total * 100, 1) if total else 0, **v}
             for k, v in categories.items()],
            key=lambda x: -x['total']
        )

        return Response({'categories': result, 'total': round(total, 2)})


class DailyCollectionView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        gym = request.user.gym
        today = datetime.date.today()
        five_years_ago = today.replace(year=today.year - 5)

        date_str = request.query_params.get('date')
        try:
            date = datetime.date.fromisoformat(date_str) if date_str else today
        except ValueError:
            date = today
        date = max(min(date, today), five_years_ago)

        member_fees = []
        admission_fees = []
        for p in Payment.objects.filter(gym=gym, payment_date=date).select_related('member', 'package'):
            is_admission = p.notes and p.notes.lower() == 'admission fee'
            entry = {
                'member': p.member.name if p.member else 'Unknown',
                'package': p.package.name if p.package else '—',
                'amount': float(p.amount_paid),
            }
            if is_admission:
                admission_fees.append(entry)
            else:
                member_fees.append(entry)

        inventory_sales = []
        for s in StockLog.objects.filter(
            product__gym=gym, action='SELL', created_at__date=date
        ).select_related('product'):
            inventory_sales.append({
                'product': s.product.name,
                'quantity': s.quantity,
                'amount': round(float(s.quantity * s.product.sell_price), 2),
            })

        expenses = []
        for e in Expense.objects.filter(gym=gym, date=date):
            expenses.append({
                'title': e.title,
                'category': e.get_category_display(),
                'amount': float(e.amount),
            })

        total_member = sum(x['amount'] for x in member_fees)
        total_admission = sum(x['amount'] for x in admission_fees)
        total_inventory = sum(x['amount'] for x in inventory_sales)
        total_in = total_member + total_admission + total_inventory
        total_expenses = sum(x['amount'] for x in expenses)

        return Response({
            'date': date.isoformat(),
            'member_fees': member_fees,
            'admission_fees': admission_fees,
            'inventory_sales': inventory_sales,
            'expenses': expenses,
            'totals': {
                'member_fees': round(total_member, 2),
                'admission_fees': round(total_admission, 2),
                'inventory_sales': round(total_inventory, 2),
                'total_in': round(total_in, 2),
                'total_expenses': round(total_expenses, 2),
                'net': round(total_in - total_expenses, 2),
            },
        })

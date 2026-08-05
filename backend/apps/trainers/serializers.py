import calendar
import datetime
from rest_framework import serializers
from django.db.models import Sum
from .models import Trainer, SalaryPayment
from apps.common.phone import normalize_pk_mobile
from django.utils import timezone


def _due_date(year, month, join_day):
    """Salary due date for a calendar month, anchored to the trainer's join day
    (clamped for short months, e.g. join day 31 -> 28/30)."""
    last = calendar.monthrange(year, month)[1]
    return datetime.date(year, month, min(join_day, last))


def salary_status_for(trainer, month=None):
    """This-month (or given month) salary standing for a trainer, with the
    salary due date derived from the trainer's join date."""
    today = timezone.localdate()
    month = month or today.strftime('%Y-%m')
    agg = SalaryPayment.objects.filter(trainer=trainer, month=month).aggregate(
        base=Sum('base_salary'), total=Sum('amount')
    )
    paid_base = float(agg['base'] or 0)
    total_paid = float(agg['total'] or 0)
    expected = float(trainer.monthly_salary or 0)
    pending = max(expected - paid_base, 0)
    if expected > 0 and paid_base >= expected:
        status = 'PAID'
    elif paid_base > 0:
        status = 'PARTIAL'
    else:
        status = 'PENDING'

    # Due date = join day of this month; next due rolls to next month once paid
    join_day = trainer.join_date.day if trainer.join_date else 1
    y, m = int(month[:4]), int(month[5:7])
    due_date = _due_date(y, m, join_day)
    if status == 'PAID':
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        next_due = _due_date(ny, nm, join_day)
    else:
        next_due = due_date
    is_overdue = status != 'PAID' and today > due_date

    return {
        'month': month,
        'expected': round(expected, 2),
        'paid': round(total_paid, 2),
        'paid_base': round(paid_base, 2),
        'pending': round(pending, 2),
        'status': status,
        'due_date': due_date.isoformat(),
        'next_due': next_due.isoformat(),
        'is_overdue': is_overdue,
    }


class TrainerSerializer(serializers.ModelSerializer):
    members_count = serializers.SerializerMethodField()
    salary_status = serializers.SerializerMethodField()

    class Meta:
        model = Trainer
        fields = [
            'id', 'name', 'phone', 'cnic', 'join_date', 'monthly_salary',
            'photo', 'is_active', 'notes', 'members_count', 'salary_status',
            'device_user_id', 'has_fingerprint', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'has_fingerprint']

    def validate_phone(self, value):
        # Typed either way — with the leading 0 or without — but stored one way.
        # The field is optional on a trainer, so blank stays blank.
        if not (value or '').strip():
            return ''
        phone = normalize_pk_mobile(value)
        if not phone:
            raise serializers.ValidationError(
                'Enter a valid mobile number — 03xxxxxxxxx or 3xxxxxxxxx.'
            )
        return phone

    def validate_monthly_salary(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('Salary cannot be negative')
        return value

    def get_members_count(self, obj):
        return obj.members.filter(is_deleted=False).count()

    def get_salary_status(self, obj):
        return salary_status_for(obj)


class SalaryPaymentSerializer(serializers.ModelSerializer):
    paid_by_name = serializers.CharField(source='paid_by.name', read_only=True)

    class Meta:
        model = SalaryPayment
        fields = [
            'id', 'month', 'base_salary', 'commission', 'amount',
            'payment_date', 'note', 'paid_by_name', 'created_at',
        ]


class TrainerDetailSerializer(TrainerSerializer):
    assigned_members = serializers.SerializerMethodField()
    salary_history = serializers.SerializerMethodField()

    class Meta(TrainerSerializer.Meta):
        fields = TrainerSerializer.Meta.fields + ['assigned_members', 'salary_history']

    def get_assigned_members(self, obj):
        members = obj.members.filter(is_deleted=False).select_related('package').order_by('name')
        return [
            {
                'id': m.id,
                'member_id': m.member_id,
                'name': m.name,
                'phone': m.phone,
                'package_name': m.package.name if m.package else None,
                'expiry_date': m.expiry_date,
            }
            for m in members
        ]

    def get_salary_history(self, obj):
        payments = obj.salary_payments.select_related('paid_by')[:24]
        return SalaryPaymentSerializer(payments, many=True).data

"""WhatsApp usage billing: cycle math + lazy monthly-bill generation.

Each gym's billing cycle is anchored to the day-of-month it was created by the
superadmin (gym.created_at). A gym created on the 14th is billed 14th → 13th.
Bills are generated lazily whenever billing data is read, so no scheduler is
required (a management command is also provided for cron setups).
"""
import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import WhatsAppBill, WhatsAppUsage


def _clamp(year, month, day):
    """A valid date for (year, month, day), clamping day to the month's length
    so an anchor of 31 still works in February, April, etc."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def _next_month(year, month):
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _prev_month(year, month):
    return (year - 1, 12) if month == 1 else (year, month - 1)


def period_bounds(anchor_day, ref):
    """Return (start, end) of the billing cycle that contains `ref` (a date),
    for a gym whose cycles start on `anchor_day` each month. `end` is inclusive."""
    start = _clamp(ref.year, ref.month, anchor_day)
    if ref < start:
        y, m = _prev_month(ref.year, ref.month)
        start = _clamp(y, m, anchor_day)
    ny, nm = _next_month(start.year, start.month)
    next_start = _clamp(ny, nm, anchor_day)
    return start, next_start - timedelta(days=1)


def _anchor(gym):
    return timezone.localdate(gym.created_at).day


def _period_dict(gym, start, end):
    count = WhatsAppUsage.objects.filter(
        gym=gym, bill__isnull=True,
        sent_at__date__gte=start, sent_at__date__lte=end,
    ).count()
    rate = gym.whatsapp_rate or Decimal('0')
    return {
        'period_start': start,
        'period_end': end,
        'message_count': count,
        'rate': rate,
        'amount': (rate * count).quantize(Decimal('0.01')),
    }


def current_period(gym):
    """The open (in-progress) cycle for `gym` with its live running total."""
    start, end = period_bounds(_anchor(gym), timezone.localdate())
    return _period_dict(gym, start, end)


@transaction.atomic
def ensure_bills(gym):
    """Generate a WhatsAppBill for every completed cycle since the gym was created
    that doesn't have one yet (skipping cycles with zero messages). Idempotent."""
    anchor = _anchor(gym)
    created = timezone.localdate(gym.created_at)
    today = timezone.localdate()
    current_start, _ = period_bounds(anchor, today)

    start, end = period_bounds(anchor, created)
    while start < current_start:
        usages = WhatsAppUsage.objects.select_for_update().filter(
            gym=gym, bill__isnull=True,
            sent_at__date__gte=start, sent_at__date__lte=end,
        )
        count = usages.count()
        exists = WhatsAppBill.objects.filter(gym=gym, period_start=start).exists()
        if count and not exists:
            rate = gym.whatsapp_rate or Decimal('0')
            bill = WhatsAppBill.objects.create(
                gym=gym, period_start=start, period_end=end,
                message_count=count, rate=rate,
                amount=(rate * count).quantize(Decimal('0.01')),
            )
            usages.update(bill=bill)
        start, end = period_bounds(anchor, end + timedelta(days=1))

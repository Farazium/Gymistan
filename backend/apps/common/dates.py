"""Shared date arithmetic for membership / subscription renewals.

Kept in one place so every renewal path (member payments, gym subscription,
gym renew) behaves identically instead of each re-implementing month math.
"""
import calendar
import datetime
from django.utils.timezone import localdate


def add_months(base, months, anchor_day=None):
    """Add `months` calendar months to `base`, clamping the day to the target
    month's length so e.g. 31 Jan + 1 month -> 28/29 Feb instead of raising
    ValueError('day is out of range for month').

    `anchor_day` restores a day that a previous clamp shortened: a 31st membership
    sitting on 28 Feb should renew to 31 Mar, not 28 Mar. It is only honoured when
    `base` is the last day of its own month — the only way a clamp can show up — so
    a deliberately-set mid-month expiry (say the 10th) is never pulled off its day.
    """
    total = base.month - 1 + months
    year = base.year + total // 12
    month = total % 12 + 1
    day = base.day
    if anchor_day and base.day == calendar.monthrange(base.year, base.month)[1]:
        day = max(day, anchor_day)
    return datetime.date(year, month, min(day, calendar.monthrange(year, month)[1]))


def renew_from(current_expiry, months, today=None, anchor_day=None):
    """New expiry date when renewing for `months` months.

    Always extends from the CURRENT expiry so the membership keeps its day-of-month
    anchor (the joining day): a member who joined on the 16th stays a 16th-of-month
    member no matter which day of the month they actually pay.

    A long-lapsed membership is stepped forward whole periods at a time — never
    rebased onto today — so 16 Feb + lapsed months still lands on a 16th.

    Pass `anchor_day` (the joining day) so a membership that had to be clamped by a
    short month recovers afterwards: 31 Jan -> 28 Feb -> 31 Mar -> 30 Apr -> 31 May.
    Without it the clamp is permanent and every later renewal sits on the 28th."""
    today = today or localdate()
    if not current_expiry:
        return add_months(today, months, anchor_day)
    periods = 1
    new_expiry = add_months(current_expiry, months, anchor_day)
    # Bounded: a decade of stepping is far more than any real lapse.
    while new_expiry <= today and periods < 120:
        periods += 1
        new_expiry = add_months(current_expiry, months * periods, anchor_day)
    return new_expiry


def renew_gym_from(current_expiry, months, today=None):
    """Gym-subscription renewal: extend from the CURRENT expiry, even if it has
    already lapsed, so a gym that pays a few days late loses those days instead of
    getting a fresh full month from the payment date.

    Guard: if extending from a long-lapsed expiry would still land on or before
    today, fall back to starting from today (otherwise the gym would remain expired
    even after paying). Members keep the more lenient `renew_from` behaviour."""
    today = today or localdate()
    if not current_expiry:
        return add_months(today, months)
    new_expiry = add_months(current_expiry, months)
    if new_expiry <= today:
        new_expiry = add_months(today, months)
    return new_expiry

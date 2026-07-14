"""Shared date arithmetic for membership / subscription renewals.

Kept in one place so every renewal path (member payments, gym subscription,
gym renew) behaves identically instead of each re-implementing month math.
"""
import calendar
import datetime
from django.utils.timezone import localdate


def add_months(base, months):
    """Add `months` calendar months to `base`, clamping the day to the target
    month's length so e.g. 31 Jan + 1 month -> 28/29 Feb instead of raising
    ValueError('day is out of range for month')."""
    total = base.month - 1 + months
    year = base.year + total // 12
    month = total % 12 + 1
    day = min(base.day, calendar.monthrange(year, month)[1])
    return datetime.date(year, month, day)


def renew_from(current_expiry, months, today=None):
    """New expiry date when renewing for `months` months.

    Extends from the later of today or the current expiry, so an already-lapsed
    membership starts fresh from today rather than from a stale past date (which
    could leave the new expiry still in the past)."""
    today = today or localdate()
    base = current_expiry if current_expiry and current_expiry >= today else today
    return add_months(base, months)


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

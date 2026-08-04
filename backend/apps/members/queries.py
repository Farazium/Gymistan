"""Single source of truth for member "active vs expired" logic.

A member's live status is derived from `expiry_date` versus today — the stored
`Member.status` field is NOT reliable (it is only ever set to ACTIVE on payment
and never flipped back to EXPIRED). Every place that counts or filters members by
status must use these helpers so the members list and the dashboard always agree.

Rule (matches `serializers.compute_status`): expiry on/before today = EXPIRED;
a future expiry, or no expiry set at all, = ACTIVE.
"""
import datetime
from django.db.models import Q
from django.utils.timezone import localdate


def active_q(today=None):
    """Membership still valid: future expiry, or no expiry date set."""
    today = today or localdate()
    return Q(expiry_date__gt=today) | Q(expiry_date__isnull=True)


def expired_q(today=None):
    """Membership lapsed: expiry on or before today."""
    today = today or localdate()
    return Q(expiry_date__lte=today)


def partial_q(today=None):
    """Membership still valid but part of the fee is unpaid."""
    return active_q(today) & Q(dues__gt=0)


def fully_paid_active_q(today=None):
    """Running membership with nothing outstanding — the plain ACTIVE badge."""
    return active_q(today) & Q(dues__lte=0)


def expiring_soon_q(days, today=None):
    """Still-active members whose expiry falls within the next `days` days."""
    today = today or localdate()
    return Q(expiry_date__gt=today, expiry_date__lte=today + datetime.timedelta(days=days))

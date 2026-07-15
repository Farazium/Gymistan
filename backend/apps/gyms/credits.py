"""Prepaid WhatsApp message credits.

A gym buys a pack of messages up front and the superadmin records the top-up. The
balance lives as two counters on Gym (wa_allowance / wa_used) so spending a credit
is one indexed UPDATE, with the WhatsAppTopup ledger as the audit trail behind them.

Unused credits roll over: a top-up sets the allowance to (what was left + what was
bought) and resets used to 0. So 490/500 + 400 bought becomes 0/410, and 500/500 +
400 becomes 0/400.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import F

from .models import Gym, WhatsAppTopup

# Percent-of-pack used at which the UI escalates its warning.
ALERT_LEVELS = ((95, 'critical'), (90, 'high'), (80, 'low'))


def alert_level(gym):
    """None until 80% of the pack is spent, then low -> high -> critical -> exhausted."""
    if gym.wa_exhausted:
        return 'exhausted'
    pct = gym.wa_percent_used
    for threshold, level in ALERT_LEVELS:
        if pct >= threshold:
            return level
    return None


def quote(gym, messages):
    """What `messages` costs this gym at its current rate."""
    rate = gym.whatsapp_rate or Decimal('0')
    return (rate * messages).quantize(Decimal('0.01'))


@transaction.atomic
def topup(gym, messages, amount=None, notes='', user=None):
    """Record a bought pack and roll any unused credits into it. Returns the ledger row."""
    locked = Gym.objects.select_for_update().get(pk=gym.pk)
    carried = locked.wa_remaining
    locked.wa_allowance = carried + messages
    locked.wa_used = 0
    locked.save(update_fields=['wa_allowance', 'wa_used'])
    return WhatsAppTopup.objects.create(
        gym=locked,
        messages=messages,
        carried_over=carried,
        allowance_after=locked.wa_allowance,
        rate=locked.whatsapp_rate or Decimal('0'),
        amount=quote(locked, messages) if amount is None else amount,
        notes=notes,
        created_by=user,
    )


def reserve_wa_credit(gym):
    """Claim one credit up front, before we spend money at Meta. Atomic, so two
    sends racing at 499/500 can't both get through. False = the gym is out."""
    if not gym:
        return False
    claimed = Gym.objects.filter(
        pk=gym.pk, wa_used__lt=F('wa_allowance'),
    ).update(wa_used=F('wa_used') + 1)
    return claimed == 1


def refund_wa_credit(gym):
    """Hand a reserved credit back when the send didn't land."""
    if not gym:
        return
    Gym.objects.filter(pk=gym.pk, wa_used__gt=0).update(wa_used=F('wa_used') - 1)

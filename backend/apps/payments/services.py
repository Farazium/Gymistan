"""What a recorded payment does to the member it belongs to.

Every route that creates a payment (the payment modal, and the joining payment
taken while a member is added or restored) goes through `apply_payment`, so the
status on the payment, the member's expiry and their outstanding dues can never
be worked out three different ways.

The rules, in one place:

* A payment is PAID when nothing is left over after the discount, PARTIAL when
  the member paid less than that. The client never gets to choose — the numbers
  decide.
* A member who owes money can't renew around it: their balance is folded into the
  renewal (`dues_amount`), so the desk collects one figure and the books show one
  record instead of a renewal sitting next to a forgotten balance.
* A part-payment still buys the cycle: the expiry moves exactly as it would on a
  full payment, and whatever is left over is carried on the member as `dues`.
* A payment with no package buys no time — it only draws the balance down.
* A daily-member payment has no member at all: it lands in the books and touches
  nothing else.
* Deleting a payment undoes all of that (`revert_payment`) — a record that is
  gone from the books must not leave the month it bought behind on the member.
"""
from decimal import Decimal
from apps.common.dates import renew_from


def _d(value):
    return Decimal(value or 0)


def apply_payment(payment):
    """Settle a freshly-created payment against its member. Saves both."""
    member = payment.member
    if member is None:
        # A daily member has no membership to settle — no expiry to move, no balance
        # to carry. All that's left is to stamp the status the amounts imply, so the
        # record doesn't sit on the model default and claim PAID regardless.
        payment.status = 'PARTIAL' if payment.remaining > 0 else 'PAID'
        payment.save(update_fields=['status'])
        return payment

    carried = _d(payment.dues_amount)
    payment.status = 'PARTIAL' if payment.remaining > 0 else 'PAID'
    payment.is_dues_payment = carried > 0 and payment.package is None

    # The balance this payment took on is cleared; whatever it left unpaid becomes
    # the new balance. Both halves in one line so they can't drift apart.
    member.dues = max(_d(member.dues) - carried, Decimal('0')) + _d(payment.remaining)

    fields = ['dues']
    if payment.package and not payment.is_joining:
        # A renewal: roll the expiry forward whether the fee was paid in full or
        # in part — a part-paid member is a member.
        new_expiry = renew_from(
            member.expiry_date, payment.package.duration_months,
            anchor_day=member.join_date.day if member.join_date else None,
        )
        payment.prev_expiry = member.expiry_date
        payment.new_expiry = new_expiry
        member.expiry_date = new_expiry
        member.status = 'ACTIVE'
        fields += ['expiry_date', 'status']
    elif payment.is_joining:
        # The member was just created (or restored) with the expiry their joining
        # date and package imply — record it on the slip rather than moving it again.
        payment.new_expiry = member.expiry_date

    payment.save(update_fields=['status', 'is_dues_payment', 'prev_expiry', 'new_expiry'])
    member.save(update_fields=fields)
    return payment


def revert_payment(payment):
    """Undo what `apply_payment` did to this payment's member.

    Called just before a payment is soft-deleted. Without it a deleted payment
    leaves its month sitting on the member's expiry and its shortfall sitting in
    their dues — money that was never taken, buying time that was never bought.

    Only ever safe on the member's most recent live payment (the delete view
    enforces that), because the expiry is rolled back to the one figure this
    payment recorded on its way in: `prev_expiry`.
    """
    member = payment.member
    if member is None:
        return payment

    # Mirror of apply_payment's one-liner: give back the balance this payment
    # cleared, take back the shortfall it created.
    member.dues = max(_d(member.dues) - _d(payment.remaining), Decimal('0')) + _d(payment.dues_amount)

    fields = ['dues']
    moved_expiry = payment.package and not payment.is_joining
    # The equality check is a safety catch: if the member's expiry is no longer
    # what this payment set it to, something else has moved it since and rolling
    # back would be a guess. Leave it alone rather than corrupt it.
    if moved_expiry and member.expiry_date == payment.new_expiry:
        member.expiry_date = payment.prev_expiry
        fields.append('expiry_date')

    # Status is re-derived rather than assumed: rolling the expiry back can land
    # the member in any of the three states.
    from apps.members.serializers import compute_status
    member.status = compute_status(member)
    fields.append('status')

    member.save(update_fields=fields)
    return payment

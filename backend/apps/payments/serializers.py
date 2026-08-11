from django.utils import timezone
from rest_framework import serializers
from .models import Payment
from apps.gyms.models import FEATURE_DAILY_MEMBER


class PaymentSerializer(serializers.ModelSerializer):
    # Who paid, whether or not there is a membership behind them. A daily member has
    # no Member row, so the name they gave stands in — that way the payments list,
    # the dashboard and the Excel export all keep reading one field.
    member_name = serializers.SerializerMethodField()
    member_phone = serializers.SerializerMethodField()
    is_walkin = serializers.BooleanField(read_only=True)
    # Optional at the field level so a daily-member entry can leave it out — it is
    # always the full amount, and validate() fills it in. A membership payment
    # still has to send it; validate() enforces that.
    amount_paid = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    package_name = serializers.CharField(source='package.name', read_only=True)
    collected_by_name = serializers.CharField(source='collected_by.name', read_only=True)
    # True only within the 24h grace window; the UI hides delete once it's permanent.
    deletable = serializers.SerializerMethodField()
    # What this payment still leaves owed — drives the "Remaining" line on the slip.
    remaining = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = '__all__'
        # `status` and `is_dues_payment` are derived from the amounts (see
        # services.apply_payment), never taken from the client.
        read_only_fields = ['gym', 'collected_by', 'status', 'is_dues_payment']

    def get_member_name(self, obj):
        return obj.member.name if obj.member else (obj.walkin_name or None)

    def get_member_phone(self, obj):
        return obj.member.phone if obj.member else (obj.walkin_phone or None)

    def get_deletable(self, obj):
        return obj.within_delete_window()

    def get_remaining(self, obj):
        return obj.remaining

    def _gym(self):
        request = self.context.get('request')
        return getattr(getattr(request, 'user', None), 'gym', None)

    def _validate_walkin(self, data, name):
        """A daily-member payment: a name, a date and an amount, and nothing else.

        It buys no membership, so every field that only means something against one
        is refused rather than quietly ignored — a discount or a package arriving
        here means the caller thinks this is a normal payment, and swallowing it
        would put a figure in the books that nobody entered.
        """
        gym = self._gym()
        if gym is None or not gym.has_feature(FEATURE_DAILY_MEMBER):
            raise serializers.ValidationError(
                {'walkin_name': 'Daily member payments are not enabled for this gym.'}
            )
        if data.get('member') or getattr(self.instance, 'member_id', None):
            raise serializers.ValidationError(
                {'walkin_name': 'A daily member payment cannot also belong to a member.'}
            )
        if data.get('package'):
            raise serializers.ValidationError(
                {'package': 'A daily member payment buys no package.'}
            )
        if data.get('discount') or data.get('dues_amount'):
            raise serializers.ValidationError(
                {'discount': 'A daily member payment takes no discount or dues.'}
            )

        amount = data.get('amount') or 0
        if amount <= 0:
            raise serializers.ValidationError({'amount': 'Enter the amount paid.'})
        # One visit, paid on the spot — there is no membership to carry a balance,
        # so the amount charged and the amount taken are the same figure.
        data['amount_paid'] = amount

        date = data.get('payment_date')
        if date and date > timezone.localdate():
            raise serializers.ValidationError(
                {'payment_date': 'The date cannot be in the future.'}
            )
        data['walkin_name'] = name
        data['walkin_phone'] = (data.get('walkin_phone') or '').strip()
        return data

    def validate(self, data):
        walkin_name = (data.get('walkin_name') or '').strip()
        if walkin_name:
            return self._validate_walkin(data, walkin_name)

        # Everything below is a membership payment. Its date is the day it was
        # entered, never the client's — see Payment.payment_date.
        data.pop('payment_date', None)

        if 'amount_paid' not in data and self.instance is None:
            raise serializers.ValidationError({'amount_paid': 'This field is required.'})

        amount = data.get('amount', getattr(self.instance, 'amount', 0)) or 0
        discount = data.get('discount', getattr(self.instance, 'discount', 0)) or 0
        amount_paid = data.get('amount_paid', getattr(self.instance, 'amount_paid', 0)) or 0
        if amount < 0:
            raise serializers.ValidationError({'amount': 'Amount cannot be negative'})
        if discount < 0:
            raise serializers.ValidationError({'discount': 'Discount cannot be negative'})
        if discount > amount:
            raise serializers.ValidationError({'discount': 'Discount cannot exceed the amount'})
        if amount_paid < 0:
            raise serializers.ValidationError({'amount_paid': 'Amount paid cannot be negative'})
        # Overpayment is always a typo — a member can't hand over more than is owed.
        if amount_paid > amount - discount:
            raise serializers.ValidationError(
                {'amount_paid': 'Amount paid cannot exceed the payable amount'}
            )
        member = data.get('member', getattr(self.instance, 'member', None))
        # Without a member and without a walk-in name there is nobody to attribute
        # the money to, and the payment would sit in the books unreadable.
        if member is None:
            raise serializers.ValidationError({'member': 'Select a member.'})
        carried = data.get('dues_amount', getattr(self.instance, 'dues_amount', 0)) or 0
        if carried < 0:
            raise serializers.ValidationError({'dues_amount': 'Outstanding dues cannot be negative'})
        if carried:
            dues = (member.dues if member else 0) or 0
            if carried > dues:
                raise serializers.ValidationError(
                    {'dues_amount': 'That is more than this member owes'}
                )
            if carried > amount:
                raise serializers.ValidationError(
                    {'dues_amount': 'The dues cannot exceed the amount charged'}
                )
            # A balance was already charged once — a discount can only come off
            # what is being charged now.
            if discount > amount - carried:
                raise serializers.ValidationError(
                    {'discount': 'Discount cannot be applied to outstanding dues'}
                )
        return data

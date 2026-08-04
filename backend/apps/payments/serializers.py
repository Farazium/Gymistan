from rest_framework import serializers
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.name', read_only=True)
    member_phone = serializers.CharField(source='member.phone', read_only=True)
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

    def get_deletable(self, obj):
        return obj.within_delete_window()

    def get_remaining(self, obj):
        return obj.remaining

    def validate(self, data):
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

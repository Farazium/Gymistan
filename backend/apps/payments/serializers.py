from rest_framework import serializers
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.name', read_only=True)
    member_phone = serializers.CharField(source='member.phone', read_only=True)
    package_name = serializers.CharField(source='package.name', read_only=True)
    collected_by_name = serializers.CharField(source='collected_by.name', read_only=True)
    # True only within the 24h grace window; the UI hides delete once it's permanent.
    deletable = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['gym', 'collected_by']

    def get_deletable(self, obj):
        return obj.within_delete_window()

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
        return data

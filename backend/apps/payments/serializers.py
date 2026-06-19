from rest_framework import serializers
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.name', read_only=True)
    member_phone = serializers.CharField(source='member.phone', read_only=True)
    package_name = serializers.CharField(source='package.name', read_only=True)
    collected_by_name = serializers.CharField(source='collected_by.name', read_only=True)

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['gym', 'collected_by']

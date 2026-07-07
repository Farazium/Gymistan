import datetime
from rest_framework import serializers
from .models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    added_by_name = serializers.CharField(source='added_by.name', read_only=True)

    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ['gym', 'added_by']

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Amount must be greater than 0')
        return value

    def validate_date(self, value):
        if value and value > datetime.date.today():
            raise serializers.ValidationError('Date cannot be in the future')
        return value

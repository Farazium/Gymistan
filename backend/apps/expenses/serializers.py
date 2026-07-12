import datetime
from rest_framework import serializers
from .models import Expense
from django.utils import timezone


class ExpenseSerializer(serializers.ModelSerializer):
    added_by_name = serializers.CharField(source='added_by.name', read_only=True)
    # True only within the 24h grace window; the UI hides delete once it's permanent.
    deletable = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ['gym', 'added_by']

    def get_deletable(self, obj):
        return obj.within_delete_window()

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Amount must be greater than 0')
        return value

    def validate_date(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError('Date cannot be in the future')
        return value

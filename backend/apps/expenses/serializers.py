from rest_framework import serializers
from .models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    added_by_name = serializers.CharField(source='added_by.name', read_only=True)

    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ['gym', 'added_by']

from rest_framework import serializers
from .models import Product, StockLog


class ProductSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ['gym']


class StockLogSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)

    class Meta:
        model = StockLog
        fields = ['id', 'action', 'quantity', 'note', 'created_by_name', 'created_at']

from rest_framework import serializers
from .models import Package


class PackageSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = '__all__'
        read_only_fields = ['gym']

    def get_member_count(self, obj):
        return obj.members.filter(is_deleted=False).count()

    def validate_price(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Price must be greater than 0')
        return value

    def validate_duration_months(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Duration must be at least 1 month')
        return value

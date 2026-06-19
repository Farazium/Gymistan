from rest_framework import serializers
from .models import Package


class PackageSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = '__all__'
        read_only_fields = ['gym']

    def get_member_count(self, obj):
        return obj.members.count()

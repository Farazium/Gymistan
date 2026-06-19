from rest_framework import serializers
from .models import Member
from apps.packages.serializers import PackageSerializer


class MemberSerializer(serializers.ModelSerializer):
    package_detail = PackageSerializer(source='package', read_only=True)

    class Meta:
        model = Member
        fields = '__all__'
        read_only_fields = ['gym']


class MemberListSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True)

    class Meta:
        model = Member
        fields = ['id', 'name', 'phone', 'package_name', 'status', 'expiry_date', 'join_date']

import datetime
from rest_framework import serializers
from .models import Member
from apps.packages.serializers import PackageSerializer


def compute_status(member):
    if member.expiry_date and member.expiry_date <= datetime.date.today():
        return 'EXPIRED'
    return 'ACTIVE'


class MemberSerializer(serializers.ModelSerializer):
    package_detail = PackageSerializer(source='package', read_only=True)
    trainer_name = serializers.CharField(source='trainer.name', read_only=True)
    status = serializers.SerializerMethodField()

    def get_status(self, obj):
        return compute_status(obj)

    class Meta:
        model = Member
        fields = '__all__'
        read_only_fields = ['gym']


class MemberListSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True)
    trainer_name = serializers.CharField(source='trainer.name', read_only=True)
    status = serializers.SerializerMethodField()

    def get_status(self, obj):
        return compute_status(obj)

    class Meta:
        model = Member
        fields = ['id', 'member_id', 'name', 'phone', 'gender', 'father_name', 'package', 'package_name', 'trainer', 'trainer_name', 'status', 'expiry_date', 'join_date', 'address', 'notes']

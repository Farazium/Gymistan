from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Gym

User = get_user_model()


class GymSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Gym
        fields = '__all__'

    def get_member_count(self, obj):
        return obj.members.count()

    def get_user_count(self, obj):
        return obj.users.count()


class CreateGymSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    address = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    admin_name = serializers.CharField(max_length=150)
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(min_length=6, write_only=True)

    def validate_admin_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already exists')
        return value

    def create(self, validated_data):
        gym = Gym.objects.create(
            name=validated_data['name'],
            address=validated_data.get('address', ''),
            phone=validated_data.get('phone', ''),
        )
        User.objects.create_user(
            name=validated_data['admin_name'],
            email=validated_data['admin_email'],
            password=validated_data['admin_password'],
            role='GYM_ADMIN',
            gym=gym,
        )
        return gym

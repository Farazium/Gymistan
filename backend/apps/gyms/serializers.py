from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Gym, GymPayment

User = get_user_model()


class GymPaymentSerializer(serializers.ModelSerializer):
    gym_name = serializers.CharField(source='gym.name', read_only=True)

    class Meta:
        model = GymPayment
        fields = ['id', 'gym', 'gym_name', 'amount', 'months', 'payment_date', 'payment_method', 'notes', 'created_at']
        read_only_fields = ['id', 'gym_name', 'created_at']

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Amount must be greater than 0')
        return value

    def validate_payment_date(self, value):
        import datetime
        if value and value > datetime.date.today():
            raise serializers.ValidationError('Payment date cannot be in the future')
        return value


class GymSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Gym
        fields = ['id', 'name', 'address', 'phone', 'logo', 'is_active', 'joining_date', 'expiry_date', 'subscription_amount', 'tier', 'created_at', 'updated_at', 'member_count', 'user_count']

    def get_member_count(self, obj):
        return obj.members.filter(is_deleted=False).count()

    def get_user_count(self, obj):
        return obj.users.count()


class CreateGymSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    address = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    trial_days = serializers.IntegerField(required=False, default=30, min_value=0)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    subscription_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=Decimal('0'))
    tier = serializers.ChoiceField(choices=['TIER1', 'TIER2_WA', 'TIER2_AT', 'TIER3'], required=False, default='TIER1')
    admin_name = serializers.CharField(max_length=150)
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(min_length=6, write_only=True)

    def validate_admin_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already exists')
        return value

    def create(self, validated_data):
        import datetime
        today = datetime.date.today()
        trial_days = validated_data.get('trial_days', 30)
        expiry_date = validated_data.get('expiry_date') or (today + datetime.timedelta(days=trial_days))
        gym = Gym.objects.create(
            name=validated_data['name'],
            address=validated_data.get('address', ''),
            phone=validated_data.get('phone', ''),
            joining_date=today,
            expiry_date=expiry_date,
            subscription_amount=validated_data.get('subscription_amount'),
            tier=validated_data.get('tier', 'TIER1'),
        )
        User.objects.create_user(
            name=validated_data['admin_name'],
            email=validated_data['admin_email'],
            password=validated_data['admin_password'],
            role='GYM_ADMIN',
            gym=gym,
        )
        return gym

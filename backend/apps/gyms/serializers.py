from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Gym, GymPayment, WhatsAppTopup, TierInfo
from django.utils import timezone

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
        if value and value > timezone.localdate():
            raise serializers.ValidationError('Payment date cannot be in the future')
        return value


class WhatsAppTopupSerializer(serializers.ModelSerializer):
    gym_name = serializers.CharField(source='gym.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)

    class Meta:
        model = WhatsAppTopup
        fields = ['id', 'gym', 'gym_name', 'messages', 'carried_over', 'allowance_after',
                  'rate', 'amount', 'notes', 'created_by_name', 'created_at']
        read_only_fields = fields


class CreateTopupSerializer(serializers.Serializer):
    """Superadmin input for a top-up. `amount` is optional — it defaults to
    messages × the gym's rate, but stays editable for discounts/round figures."""
    messages = serializers.IntegerField(min_value=1, max_value=100000)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2,
                                      required=False, allow_null=True,
                                      min_value=Decimal('0'))
    notes = serializers.CharField(required=False, allow_blank=True)


class TierInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TierInfo
        fields = ['tier_id', 'name', 'label', 'color', 'description', 'features', 'locked', 'recommended', 'sort_order']
        read_only_fields = ['tier_id']


class GymSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()
    wa_remaining = serializers.IntegerField(read_only=True)
    wa_percent_used = serializers.IntegerField(read_only=True)

    class Meta:
        model = Gym
        fields = ['id', 'name', 'address', 'phone', 'owner_phone', 'logo', 'is_active', 'joining_date', 'expiry_date', 'subscription_amount', 'tier', 'whatsapp_rate', 'theme_color', 'card_color', 'background_mode', 'background_image', 'created_at', 'updated_at', 'member_count', 'user_count', 'wa_allowance', 'wa_used', 'wa_remaining', 'wa_percent_used']
        # Credits move only through top-ups and sends, never a gym PATCH.
        read_only_fields = ['wa_allowance', 'wa_used']

    # What a gym is sold, as opposed to how it looks. A gym admin PATCHes this same
    # endpoint from Settings (name, logo, colours), so without this they could hand
    # themselves a tier — and with it WhatsApp and attendance — for free.
    SUPERADMIN_ONLY = {'tier', 'whatsapp_rate', 'is_active',
                       'expiry_date', 'subscription_amount'}

    def validate(self, data):
        request = self.context.get('request')
        role = getattr(getattr(request, 'user', None), 'role', None)
        # No request in context means an internal caller, not the API — trusted.
        if request is not None and role != 'SUPERADMIN':
            blocked = sorted(self.SUPERADMIN_ONLY & set(data))
            if blocked:
                raise serializers.ValidationError(
                    {f: 'Only a superadmin can change this.' for f in blocked}
                )
        return data

    def get_member_count(self, obj):
        return obj.members.filter(is_deleted=False).count()

    def get_user_count(self, obj):
        return obj.users.count()


class CreateGymSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    address = serializers.CharField(required=False, allow_blank=True)
    # The superadmin's private contact for the gym owner (not the slip phone).
    owner_phone = serializers.CharField(required=False, allow_blank=True)
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
        today = timezone.localdate()
        trial_days = validated_data.get('trial_days', 30)
        expiry_date = validated_data.get('expiry_date') or (today + datetime.timedelta(days=trial_days))
        gym = Gym.objects.create(
            name=validated_data['name'],
            address=validated_data.get('address', ''),
            owner_phone=validated_data.get('owner_phone', ''),
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

from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User

# Roles a gym admin is allowed to assign to staff. SUPERADMIN can only ever be
# granted by another SUPERADMIN — otherwise a gym admin could escalate to full
# cross-gym access by editing (or creating) a user with that role.
GYM_ADMIN_ASSIGNABLE_ROLES = ('GYM_ADMIN', 'ACCOUNTANT')


def guard_assignable_role(serializer, role):
    request = serializer.context.get('request')
    requester = getattr(request, 'user', None)
    if role and requester and requester.role != 'SUPERADMIN' and role not in GYM_ADMIN_ASSIGNABLE_ROLES:
        raise serializers.ValidationError('You are not allowed to assign this role.')
    return role


class UserSerializer(serializers.ModelSerializer):
    gym_name = serializers.CharField(source='gym.name', read_only=True)
    gym_phone = serializers.CharField(source='gym.phone', read_only=True)
    gym_address = serializers.CharField(source='gym.address', read_only=True)
    gym_logo = serializers.ImageField(source='gym.logo', read_only=True)
    gym_tier = serializers.CharField(source='gym.tier', read_only=True)
    gym_theme = serializers.CharField(source='gym.theme_color', read_only=True)
    gym_card = serializers.CharField(source='gym.card_color', read_only=True)
    gym_background_mode = serializers.CharField(source='gym.background_mode', read_only=True)
    gym_background_image = serializers.ImageField(source='gym.background_image', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'role', 'is_active', 'gym', 'gym_name', 'gym_phone', 'gym_address', 'gym_logo', 'gym_tier', 'gym_theme', 'gym_card', 'gym_background_mode', 'gym_background_image', 'created_at']


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(email=data['email'], password=data['password'])
        if not user:
            raise serializers.ValidationError('Invalid credentials')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled')
        if user.gym and not user.gym.is_active:
            raise serializers.ValidationError('This gym has been deactivated. Contact support.')
        data['user'] = user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect')
        return value


class CreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ['name', 'email', 'password', 'role', 'gym']

    def validate_role(self, value):
        return guard_assignable_role(self, value)

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class StaffUserUpdateSerializer(serializers.ModelSerializer):
    """Editing an existing staff member. `gym` is intentionally not writable so a
    user can't be moved across tenants, and `role` is guarded so a gym admin can't
    escalate anyone to SUPERADMIN."""
    class Meta:
        model = User
        fields = ['name', 'role', 'is_active']

    def validate_role(self, value):
        return guard_assignable_role(self, value)

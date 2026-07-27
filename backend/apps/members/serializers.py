from rest_framework import serializers
from django.utils.timezone import localdate
from .models import Member
from apps.packages.serializers import PackageSerializer


def compute_status(member):
    if member.expiry_date and member.expiry_date <= localdate():
        return 'EXPIRED'
    return 'ACTIVE'


def blacklist_is_active(member):
    # Blacklisted and either indefinite (no end date) or the end date hasn't passed.
    if not member.blacklisted:
        return False
    return member.blacklist_until is None or member.blacklist_until >= localdate()


class MemberSerializer(serializers.ModelSerializer):
    package_detail = PackageSerializer(source='package', read_only=True)
    trainer_name = serializers.CharField(source='trainer.name', read_only=True)
    status = serializers.SerializerMethodField()
    blacklist_active = serializers.SerializerMethodField()
    # The model lets a member have no device id (`blank=True`) — most gyms never
    # touch a biometric device. But DRF marks every field named in a unique
    # constraint as required, and the model carries a conditional one on
    # (gym, device_user_id); with `fields = '__all__'` pulling `gym` in, that
    # made an ordinary add fail with "device_user_id: This field is required"
    # on any gym whose plan hides the Device ID box. Uniqueness is still
    # enforced by the database, which the view turns into a field error.
    device_user_id = serializers.CharField(required=False, allow_blank=True, max_length=32)

    def get_status(self, obj):
        return compute_status(obj)

    def get_blacklist_active(self, obj):
        return blacklist_is_active(obj)

    def validate(self, attrs):
        # A package that includes a trainer must have one assigned. Fall back to
        # the existing values on PATCH so partial updates are validated too.
        package = attrs.get('package', getattr(self.instance, 'package', None))
        trainer = attrs.get('trainer', getattr(self.instance, 'trainer', None))
        if package and package.has_trainer and not trainer:
            raise serializers.ValidationError(
                {'trainer': 'This package includes a trainer — please select one.'}
            )
        return attrs

    class Meta:
        model = Member
        fields = '__all__'
        read_only_fields = ['gym', 'has_fingerprint']


class MemberListSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True)
    trainer_name = serializers.CharField(source='trainer.name', read_only=True)
    status = serializers.SerializerMethodField()
    blacklist_active = serializers.SerializerMethodField()

    def get_status(self, obj):
        return compute_status(obj)

    def get_blacklist_active(self, obj):
        return blacklist_is_active(obj)

    class Meta:
        model = Member
        fields = ['id', 'member_id', 'name', 'phone', 'gender', 'father_name', 'package', 'package_name', 'trainer', 'trainer_name', 'status', 'expiry_date', 'join_date', 'address', 'notes', 'device_user_id', 'blacklisted', 'blacklist_active', 'blacklist_reason', 'blacklist_until', 'deleted_at']

from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'SUPERADMIN'


class IsGymAdminOrAbove(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('SUPERADMIN', 'GYM_ADMIN')


class IsGymMember(BasePermission):
    """Ensures user belongs to the gym they're accessing."""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.role == 'SUPERADMIN':
            return True
        return request.user.gym is not None


class HasAttendance(BasePermission):
    """Gym's plan must include the attendance feature (TIER2_AT or TIER3).

    Mirrors the frontend gating so the API can't be hit directly by plans that
    don't include attendance.
    """
    ATTENDANCE_TIERS = ('TIER2_AT', 'TIER3')
    message = 'Attendance is not enabled for your plan.'

    def has_permission(self, request, view):
        gym = getattr(request.user, 'gym', None)
        return gym is not None and gym.tier in self.ATTENDANCE_TIERS

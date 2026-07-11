from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import (
    LoginSerializer, UserSerializer, ChangePasswordSerializer,
    CreateUserSerializer, StaffUserUpdateSerializer,
)
from .models import User
from .permissions import IsSuperAdmin


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        user = request.user
        if 'name' in request.data:
            user.name = request.data['name']
            user.save(update_fields=['name'])
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        return Response({'message': 'Password changed successfully'})


class StaffUserListCreateView(generics.ListCreateAPIView):
    # Gym accounts are provisioned by the superadmin only — a gym is one login and
    # cannot create additional users, so these endpoints are superadmin-only.
    serializer_class = CreateUserSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get_queryset(self):
        return User.objects.filter(gym_id=self.kwargs.get('gym_id'))


class StaffUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get_serializer_class(self):
        # Reads return the full profile; writes go through the guarded serializer
        # (no gym reassignment, no self-escalation to SUPERADMIN).
        if self.request.method in ('PUT', 'PATCH'):
            return StaffUserUpdateSerializer
        return UserSerializer

    def get_queryset(self):
        return User.objects.all()

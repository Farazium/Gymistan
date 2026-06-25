from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import LoginSerializer, UserSerializer, ChangePasswordSerializer, CreateUserSerializer
from .models import User
from .permissions import IsSuperAdmin, IsGymAdminOrAbove


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
    serializer_class = CreateUserSerializer
    permission_classes = [IsAuthenticated, IsGymAdminOrAbove]

    def get_queryset(self):
        if self.request.user.role == 'SUPERADMIN':
            return User.objects.filter(gym_id=self.kwargs.get('gym_id'))
        return User.objects.filter(gym=self.request.user.gym)

    def perform_create(self, serializer):
        gym = self.request.user.gym if self.request.user.role != 'SUPERADMIN' else None
        serializer.save(gym=gym)


class StaffUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsGymAdminOrAbove]

    def get_queryset(self):
        if self.request.user.role == 'SUPERADMIN':
            return User.objects.all()
        return User.objects.filter(gym=self.request.user.gym)

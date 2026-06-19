from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Gym
from .serializers import GymSerializer, CreateGymSerializer
from apps.accounts.permissions import IsSuperAdmin, IsGymAdminOrAbove


class GymListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        gyms = Gym.objects.prefetch_related('members', 'users').all()
        serializer = GymSerializer(gyms, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CreateGymSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gym = serializer.save()
        return Response(GymSerializer(gym).data, status=status.HTTP_201_CREATED)


class GymDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_gym(self, request, pk=None):
        if request.user.role == 'SUPERADMIN':
            return Gym.objects.get(pk=pk)
        return request.user.gym

    def get(self, request, pk=None):
        gym = self.get_gym(request, pk)
        return Response(GymSerializer(gym).data)

    def patch(self, request, pk=None):
        gym = self.get_gym(request, pk)
        serializer = GymSerializer(gym, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ToggleGymStatusView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        gym = Gym.objects.get(pk=pk)
        gym.is_active = not gym.is_active
        gym.save()
        return Response({'is_active': gym.is_active})

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import Package
from .serializers import PackageSerializer
from apps.accounts.permissions import IsGymMember


class PackageListCreateView(generics.ListCreateAPIView):
    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return Package.objects.filter(gym=self.request.user.gym)

    def perform_create(self, serializer):
        serializer.save(gym=self.request.user.gym)


class PackageDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return Package.objects.filter(gym=self.request.user.gym)

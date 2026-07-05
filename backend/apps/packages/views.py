from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
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

    def destroy(self, request, *args, **kwargs):
        package = self.get_object()
        enrolled = package.members.filter(is_deleted=False).count()
        if enrolled:
            return Response(
                {'detail': f'Cannot delete this package — {enrolled} member(s) are enrolled in it.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

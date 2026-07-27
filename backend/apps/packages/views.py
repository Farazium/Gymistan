from django.db.models import Count, Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Package
from .serializers import PackageSerializer
from apps.accounts.permissions import IsGymMember


def with_member_count(qs):
    """Attach each package's enrolled-member count in the same query, so the
    list can be ordered by it and the serializer doesn't count per package."""
    return qs.annotate(
        enrolled_count=Count('members', filter=Q(members__is_deleted=False))
    )


class PackageListCreateView(generics.ListCreateAPIView):
    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        # Busiest package first. Without an explicit order the database is free
        # to hand rows back in any order, and an edited row came back last —
        # so editing a package appeared to move it to the end of the page.
        return with_member_count(
            Package.objects.filter(gym=self.request.user.gym)
        ).order_by('-enrolled_count', 'name')

    def perform_create(self, serializer):
        serializer.save(gym=self.request.user.gym)


class PackageDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return with_member_count(Package.objects.filter(gym=self.request.user.gym))

    def destroy(self, request, *args, **kwargs):
        package = self.get_object()
        enrolled = package.members.filter(is_deleted=False).count()
        if enrolled:
            return Response(
                {'detail': f'Cannot delete this package — {enrolled} member(s) are enrolled in it.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

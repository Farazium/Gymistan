from rest_framework import generics, filters, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Expense
from .serializers import ExpenseSerializer
from apps.accounts.permissions import IsGymMember


class ExpenseListCreateView(generics.ListCreateAPIView):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, IsGymMember]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category']
    search_fields = ['title', 'description']
    ordering_fields = ['date', 'amount']
    ordering = ['-date']

    def get_queryset(self):
        qs = Expense.objects.filter(gym=self.request.user.gym)
        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')
        if month:
            qs = qs.filter(date__month=month)
        if year:
            qs = qs.filter(date__year=year)
        return qs

    def perform_create(self, serializer):
        serializer.save(gym=self.request.user.gym, added_by=self.request.user)


class ExpenseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return Expense.objects.filter(gym=self.request.user.gym)

    def destroy(self, request, *args, **kwargs):
        expense = self.get_object()
        # Deletable (soft) only within 24h of entry; permanent afterwards.
        if not expense.within_delete_window():
            return Response(
                {'detail': 'This expense is more than 24 hours old and is now a permanent record; it can no longer be deleted.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        expense.soft_delete(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

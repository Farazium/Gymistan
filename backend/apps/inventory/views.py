from rest_framework import generics, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from decimal import Decimal, InvalidOperation
import datetime
from .models import Product, StockLog
from .serializers import ProductSerializer, StockLogSerializer
from apps.accounts.permissions import IsGymMember
from apps.expenses.models import Expense
from django.utils import timezone


def _record_stock_expense(product, qty, user, kind):
    """Record the purchase cost of incoming stock as an INVENTORY expense.
    No-op when there's nothing to cost (cost price or quantity is zero)."""
    cost = product.cost_price or Decimal('0')
    if cost <= 0 or qty <= 0:
        return
    total = cost * qty
    Expense.objects.create(
        gym=product.gym,
        added_by=user,
        title=f'Stock purchase — {product.name}',
        amount=total,
        category='INVENTORY',
        date=timezone.localdate(),
        description=f'{kind}: {qty} × PKR {cost:,.0f}',
    )


class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsGymMember]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name']

    def get_queryset(self):
        return Product.objects.filter(gym=self.request.user.gym)

    def perform_create(self, serializer):
        product = serializer.save(gym=self.request.user.gym)
        # Initial stock bought in is a purchase cost — book it as an expense.
        _record_stock_expense(product, product.quantity, self.request.user, 'Initial stock')


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return Product.objects.filter(gym=self.request.user.gym)


class StockAdjustView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def post(self, request, pk):
        try:
            product = Product.objects.get(pk=pk, gym=request.user.gym)
        except Product.DoesNotExist:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action')
        try:
            qty = int(request.data.get('quantity', 0))
        except (ValueError, TypeError):
            return Response({'detail': 'Quantity must be a whole number'}, status=status.HTTP_400_BAD_REQUEST)
        note = request.data.get('note', '')

        # ADJUSTMENT may set stock to 0 (clearing it); SELL/RESTOCK need a positive amount.
        if qty < 0:
            return Response({'detail': 'Quantity cannot be negative'}, status=status.HTTP_400_BAD_REQUEST)
        if qty == 0 and action != 'ADJUSTMENT':
            return Response({'detail': 'Quantity must be greater than 0'}, status=status.HTTP_400_BAD_REQUEST)

        if action == 'SELL':
            if product.quantity < qty:
                return Response({'detail': 'Not enough stock'}, status=status.HTTP_400_BAD_REQUEST)
            product.quantity -= qty
        elif action == 'RESTOCK':
            product.quantity += qty
            _record_stock_expense(product, qty, request.user, 'Restock')
        elif action == 'ADJUSTMENT':
            product.quantity = qty
        else:
            return Response({'detail': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)

        product.save(update_fields=['quantity'])
        StockLog.objects.create(
            product=product,
            action=action,
            quantity=qty,
            note=note,
            created_by=request.user,
        )
        return Response(ProductSerializer(product).data)


class StockLogListView(generics.ListAPIView):
    serializer_class = StockLogSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return StockLog.objects.filter(
            product__gym=self.request.user.gym,
            product_id=self.kwargs['pk']
        )

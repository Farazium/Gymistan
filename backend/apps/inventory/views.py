from rest_framework import generics, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Product, StockLog
from .serializers import ProductSerializer, StockLogSerializer
from apps.accounts.permissions import IsGymMember


class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, IsGymMember]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name']

    def get_queryset(self):
        return Product.objects.filter(gym=self.request.user.gym)

    def perform_create(self, serializer):
        serializer.save(gym=self.request.user.gym)


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

from django.urls import path
from .views import (ProductListCreateView, ProductDetailView, StockAdjustView,
                    StockLogListView, SalesListView, SaleDeleteView)

urlpatterns = [
    path('', ProductListCreateView.as_view()),
    path('sales/', SalesListView.as_view()),
    path('sales/<int:pk>/', SaleDeleteView.as_view()),
    path('<int:pk>/', ProductDetailView.as_view()),
    path('<int:pk>/adjust/', StockAdjustView.as_view()),
    path('<int:pk>/logs/', StockLogListView.as_view()),
]

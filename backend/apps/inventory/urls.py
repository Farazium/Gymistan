from django.urls import path
from .views import ProductListCreateView, ProductDetailView, StockAdjustView, StockLogListView

urlpatterns = [
    path('', ProductListCreateView.as_view()),
    path('<int:pk>/', ProductDetailView.as_view()),
    path('<int:pk>/adjust/', StockAdjustView.as_view()),
    path('<int:pk>/logs/', StockLogListView.as_view()),
]

from django.urls import path
from .views import PaymentListCreateView, PaymentDetailView, DownloadSlipView, SendWhatsAppSlipView

urlpatterns = [
    path('', PaymentListCreateView.as_view(), name='payment_list_create'),
    path('<int:pk>/', PaymentDetailView.as_view(), name='payment_detail'),
    path('<int:pk>/slip/', DownloadSlipView.as_view(), name='download_slip'),
    path('<int:pk>/whatsapp/', SendWhatsAppSlipView.as_view(), name='send_whatsapp'),
]

from django.urls import path
from .views import (
    GymListCreateView, GymDetailView, ToggleGymStatusView, GymStatsView,
    ResetGymAdminPasswordView, RenewGymView,
    GymPaymentListCreateView, GymPaymentDetailView,
    WhatsAppBillingView, WhatsAppBillListView, WhatsAppBillMarkPaidView,
)

urlpatterns = [
    path('', GymListCreateView.as_view(), name='gym_list_create'),
    path('<int:pk>/', GymDetailView.as_view(), name='gym_detail'),
    path('<int:pk>/toggle/', ToggleGymStatusView.as_view(), name='gym_toggle'),
    path('<int:pk>/stats/', GymStatsView.as_view(), name='gym_stats'),
    path('<int:pk>/reset-admin-password/', ResetGymAdminPasswordView.as_view(), name='gym_reset_password'),
    path('<int:pk>/renew/', RenewGymView.as_view(), name='gym_renew'),
    path('gym-payments/', GymPaymentListCreateView.as_view(), name='gym_payment_list_create'),
    path('gym-payments/<int:pk>/', GymPaymentDetailView.as_view(), name='gym_payment_detail'),
    path('whatsapp-billing/', WhatsAppBillingView.as_view(), name='wa_billing'),
    path('whatsapp-bills/', WhatsAppBillListView.as_view(), name='wa_bill_list'),
    path('whatsapp-bills/<int:pk>/mark-paid/', WhatsAppBillMarkPaidView.as_view(), name='wa_bill_mark_paid'),
]

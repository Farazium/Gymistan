from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/gyms/', include('apps.gyms.urls')),
    path('api/members/', include('apps.members.urls')),
    path('api/packages/', include('apps.packages.urls')),
    path('api/payments/', include('apps.payments.urls')),
    path('api/expenses/', include('apps.expenses.urls')),
    path('api/dashboard/', include('apps.dashboard.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

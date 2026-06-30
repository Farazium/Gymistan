from django.urls import path
from .views import DashboardView, SuperAdminDashboardView, FinanceLedgerView, FinanceIncomeStatementView, FinanceExpenseCategoriesView

urlpatterns = [
    path('', DashboardView.as_view(), name='dashboard'),
    path('superadmin/', SuperAdminDashboardView.as_view(), name='superadmin_dashboard'),
    path('finance/ledger/', FinanceLedgerView.as_view()),
    path('finance/income-statement/', FinanceIncomeStatementView.as_view()),
    path('finance/expense-categories/', FinanceExpenseCategoriesView.as_view()),
]

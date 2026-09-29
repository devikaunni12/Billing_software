from django.urls import include, path
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("products", views.ProductViewSet, basename="product")
router.register("suppliers", views.SupplierViewSet, basename="supplier")
router.register("transactions", views.SaleViewSet, basename="transaction")

urlpatterns = [
    path("csrf/", views.csrf_token, name="csrf"),
    path("auth/login/", views.login_view, name="login"),
    path("auth/logout/", views.logout_view, name="logout"),
    path("auth/me/", views.current_user, name="current-user"),
    path("staff/", views.staff_list_create, name="staff-list-create"),
    path("staff/<int:user_id>/", views.staff_detail, name="staff-detail"),
    path("checkout/", views.checkout, name="checkout"),
    path("returns/", views.returns, name="returns"),
    path("reports/", views.reports, name="reports"),
    path("ledger/", views.ledger, name="ledger"),
    path("", include(router.urls)),
]

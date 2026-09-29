"""URL routes for the API and the separately maintained frontend."""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from pos.frontend import billing_page, frontend_page, mobile_admin_page

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include("pos.urls")),
    path("billing/", billing_page, name="billing"),
    path("mobile-admin/", mobile_admin_page, name="mobile-admin"),
    path("", frontend_page, name="home"),
]

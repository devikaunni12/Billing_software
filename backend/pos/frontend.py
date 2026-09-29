"""Serve the plain HTML application while keeping its source in ../frontend."""
from pathlib import Path
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def _serve_app(request):
    page = Path(settings.PROJECT_ROOT) / "frontend" / "index.html"
    return HttpResponse(page.read_text(encoding="utf-8"))


def frontend_page(request):
    return _serve_app(request)


def billing_page(request):
    return _serve_app(request)


def mobile_admin_page(request):
    return _serve_app(request)

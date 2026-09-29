"""Small permission helpers for the two POS roles."""
from rest_framework.permissions import BasePermission


class IsAdminUserRole(BasePermission):
    """Only users explicitly marked as Django staff can manage the shop."""
    message = "Admin access is required for this action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)

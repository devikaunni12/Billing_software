"""REST API endpoints for authentication and the core retail workflows."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal, InvalidOperation
import secrets

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import transaction
from django.db.models import Count, F, Sum
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import LedgerEntry, Product, ReturnItem, ReturnRecord, Sale, SaleItem, Supplier
from .permissions import IsAdminUserRole
from .serializers import LedgerEntrySerializer, ProductSerializer, ReturnRecordSerializer, SaleSerializer, SupplierSerializer

User = get_user_model()


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token(request):
    """Set the CSRF cookie before the browser sends a login or write request."""
    return Response({"detail": "CSRF cookie set"})


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    user = authenticate(request, username=request.data.get("username", ""), password=request.data.get("password", ""))
    if user is None or not user.is_active:
        return Response({"detail": "Incorrect username or password."}, status=status.HTTP_400_BAD_REQUEST)
    login(request, user)
    return Response({"id": user.id, "username": user.username, "is_admin": user.is_staff})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({"detail": "Logged out."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):
    return Response({"id": request.user.id, "username": request.user.username, "email": request.user.email, "first_name": request.user.first_name, "last_name": request.user.last_name, "is_admin": request.user.is_staff})


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer

    def get_queryset(self):
        products = Product.objects.select_related("supplier").order_by("name")
        if not self.request.user.is_staff:
            products = products.filter(is_active=True)
        return products

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAdminUserRole()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        if product.sale_items.exists():
            return Response(
                {"detail": "This product is used in completed transactions and cannot be deleted. Historical receipts must remain intact."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.order_by("name")
    serializer_class = SupplierSerializer
    permission_classes = [IsAdminUserRole]


class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SaleSerializer

    def get_queryset(self):
        sales = Sale.objects.select_related("cashier").prefetch_related("items")
        if not self.request.user.is_staff:
            sales = sales.filter(cashier=self.request.user)
        return sales


@api_view(["GET", "POST"])
@permission_classes([IsAdminUserRole])
def staff_list_create(request):
    if request.method == "GET":
        users = User.objects.order_by("username")
        return Response([staff_data(user) for user in users])

    username = str(request.data.get("username", "")).strip()
    password = request.data.get("password", "")
    if not username or len(password) < 8:
        return Response({"detail": "Username is required and password must be at least 8 characters."}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({"detail": "That username is already in use."}, status=400)
    user = User.objects.create_user(
        username=username,
        password=password,
        email=request.data.get("email", ""),
        first_name=request.data.get("first_name", ""),
        last_name=request.data.get("last_name", ""),
        is_staff=request.data.get("role") == "admin",
    )
    return Response(staff_data(user), status=201)


def staff_data(user):
    return {"id": user.id, "username": user.username, "email": user.email, "first_name": user.first_name, "last_name": user.last_name, "role": "admin" if user.is_staff else "staff", "is_active": user.is_active}


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAdminUserRole])
def staff_detail(request, user_id):
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "Staff member not found."}, status=404)
    if user == request.user:
        return Response({"detail": "You cannot deactivate your own account."}, status=400)
    if request.method == "DELETE":
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response(status=204)
    for field in ["email", "first_name", "last_name"]:
        if field in request.data:
            setattr(user, field, request.data[field])
    if "role" in request.data:
        user.is_staff = request.data["role"] == "admin"
    if "is_active" in request.data:
        user.is_active = bool(request.data["is_active"])
    user.save()
    return Response(staff_data(user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checkout(request):
    """Create a sale and decrement stock atomically so partial bills cannot be saved."""
    items = request.data.get("items", [])
    if not isinstance(items, list) or not items:
        return Response({"detail": "Add at least one product to the bill."}, status=400)
    quantities = defaultdict(int)
    try:
        for line in items:
            product_id = int(line["product_id"])
            quantity = int(line["quantity"])
            if quantity <= 0:
                raise ValueError
            quantities[product_id] += quantity
        discount = Decimal(str(request.data.get("discount", "0")))
        amount_paid = Decimal(str(request.data.get("amount_paid", "0")))
    except (KeyError, TypeError, ValueError, InvalidOperation):
        return Response({"detail": "Check product quantities, discount, and amount paid."}, status=400)
    payment_method = request.data.get("payment_method", "cash")
    valid_methods = {choice[0] for choice in Sale.PAYMENT_METHODS}
    if payment_method not in valid_methods:
        return Response({"detail": "Choose a valid payment method."}, status=400)

    try:
        with transaction.atomic():
            products = {}
            for product_id, quantity in quantities.items():
                product = Product.objects.select_for_update().get(pk=product_id, is_active=True)
                if product.stock < quantity:
                    return Response({"detail": f"Not enough stock for {product.name}. Available: {product.stock}."}, status=400)
                products[product_id] = (product, quantity)
            subtotal = sum((product.price * quantity for product, quantity in products.values()), Decimal("0.00"))
            if discount < 0 or discount > subtotal:
                return Response({"detail": "Discount must be between zero and the subtotal."}, status=400)
            total = subtotal - discount
            if amount_paid < total:
                return Response({"detail": "Amount paid must cover the bill total."}, status=400)
            sale = Sale.objects.create(
                receipt_number=f"R-{timezone.now():%Y%m%d}-{secrets.token_hex(3).upper()}",
                cashier=request.user,
                customer_name=str(request.data.get("customer_name", ""))[:120],
                subtotal=subtotal,
                discount=discount,
                tax=Decimal("0.00"),
                total=total,
                payment_method=payment_method,
                amount_paid=amount_paid,
                change_due=amount_paid - total,
            )
            for product, quantity in products.values():
                SaleItem.objects.create(sale=sale, product=product, product_name=product.name, sku=product.sku, quantity=quantity, unit_price=product.price, line_total=product.price * quantity)
                product.stock -= quantity
                product.save(update_fields=["stock"])
            LedgerEntry.objects.create(entry_type="sale", amount=total, note=f"Sale {sale.receipt_number}", sale=sale)
    except Product.DoesNotExist:
        return Response({"detail": "A product in the bill is unavailable."}, status=400)
    return Response(SaleSerializer(sale).data, status=201)


@api_view(["GET", "POST"])
@permission_classes([IsAdminUserRole])
def returns(request):
    if request.method == "GET":
        data = ReturnRecord.objects.select_related("sale", "processed_by").prefetch_related("items").all()
        return Response(ReturnRecordSerializer(data, many=True).data)

    try:
        sale_item = SaleItem.objects.select_related("sale", "product").get(pk=request.data.get("sale_item_id"))
        quantity = int(request.data.get("quantity", 0))
    except (SaleItem.DoesNotExist, TypeError, ValueError):
        return Response({"detail": "Select a valid item from a completed transaction."}, status=400)
    if quantity <= 0:
        return Response({"detail": "Return quantity must be at least one."}, status=400)

    with transaction.atomic():
        previously_returned = ReturnItem.objects.filter(sale_item=sale_item).aggregate(total=Sum("quantity"))["total"] or 0
        available_to_return = sale_item.quantity - previously_returned
        if quantity > available_to_return:
            return Response({"detail": f"Only {available_to_return} item(s) remain returnable."}, status=400)
        refund = sale_item.unit_price * quantity
        record = ReturnRecord.objects.create(sale=sale_item.sale, processed_by=request.user, reason=str(request.data.get("reason", ""))[:240], total_refund=refund)
        ReturnItem.objects.create(return_record=record, sale_item=sale_item, product=sale_item.product, quantity=quantity, unit_price=sale_item.unit_price, refund_amount=refund)
        sale_item.product.stock = F("stock") + quantity
        sale_item.product.save(update_fields=["stock"])
        LedgerEntry.objects.create(entry_type="refund", amount=-refund, note=f"Refund for {sale_item.sale.receipt_number}", sale=sale_item.sale, return_record=record)
    record.refresh_from_db()
    return Response(ReturnRecordSerializer(record).data, status=201)


@api_view(["GET"])
@permission_classes([IsAdminUserRole])
def reports(request):
    today = timezone.localdate()
    first_day = today - timedelta(days=6)
    daily_sales = Sale.objects.filter(created_at__date__gte=first_day, created_at__date__lte=today).values("created_at__date").annotate(total=Sum("total"), count=Count("id"))
    daily_refunds = ReturnRecord.objects.filter(created_at__date__gte=first_day, created_at__date__lte=today).values("created_at__date").annotate(total=Sum("total_refund"))
    sales_by_day = {row["created_at__date"]: row for row in daily_sales}
    refunds_by_day = {row["created_at__date"]: row["total"] or Decimal("0.00") for row in daily_refunds}
    today_sales = Sale.objects.filter(created_at__date=today)
    refunds_today = ReturnRecord.objects.filter(created_at__date=today).aggregate(total=Sum("total_refund"))["total"] or Decimal("0.00")
    recent_sales = Sale.objects.select_related("cashier").order_by("-created_at")[:6]
    return Response({
        "sales_today": today_sales.count(),
        "revenue_today": (today_sales.aggregate(total=Sum("total"))["total"] or Decimal("0.00")) - refunds_today,
        "low_stock": Product.objects.filter(is_active=True, stock__lte=5).count(),
        "products": Product.objects.filter(is_active=True).count(),
        "staff": User.objects.filter(is_active=True, is_staff=False).count(),
        "week": [
            {
                "date": (first_day + timedelta(days=offset)).isoformat(),
                "total": (sales_by_day.get(first_day + timedelta(days=offset), {}).get("total") or Decimal("0.00")) - refunds_by_day.get(first_day + timedelta(days=offset), Decimal("0.00")),
                "count": sales_by_day.get(first_day + timedelta(days=offset), {}).get("count", 0),
            }
            for offset in range(7)
        ],
        "recent_sales": SaleSerializer(recent_sales, many=True).data,
    })


@api_view(["GET"])
@permission_classes([IsAdminUserRole])
def ledger(request):
    entries = LedgerEntry.objects.select_related("sale").all()[:200]
    return Response(LedgerEntrySerializer(entries, many=True).data)

"""Database tables for products, sales, returns, suppliers, and the ledger."""
from django.conf import settings
from django.db import models


class Supplier(models.Model):
    name = models.CharField(max_length=120)
    contact_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Product(models.Model):
    sku = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=140)
    category = models.CharField(max_length=80, blank=True)
    size = models.CharField(max_length=40, blank=True)
    color = models.CharField(max_length=40, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    stock = models.PositiveIntegerField(default=0)
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name="products")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sku} - {self.name}"


class Sale(models.Model):
    PAYMENT_METHODS = [("cash", "Cash"), ("card", "Card"), ("mobile", "Mobile payment"), ("bank", "Bank transfer")]
    receipt_number = models.CharField(max_length=24, unique=True)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales")
    customer_name = models.CharField(max_length=120, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=12, choices=PAYMENT_METHODS)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2)
    change_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.receipt_number


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sale_items")
    product_name = models.CharField(max_length=140)
    sku = models.CharField(max_length=40)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)


class ReturnRecord(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns")
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="processed_returns")
    reason = models.CharField(max_length=240, blank=True)
    total_refund = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ReturnItem(models.Model):
    return_record = models.ForeignKey(ReturnRecord, on_delete=models.CASCADE, related_name="items")
    sale_item = models.ForeignKey(SaleItem, on_delete=models.PROTECT, related_name="return_items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="return_items")
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2)


class LedgerEntry(models.Model):
    ENTRY_TYPES = [("sale", "Sale"), ("refund", "Refund"), ("adjustment", "Adjustment")]
    entry_type = models.CharField(max_length=12, choices=ENTRY_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.CharField(max_length=240)
    sale = models.ForeignKey(Sale, null=True, blank=True, on_delete=models.SET_NULL, related_name="ledger_entries")
    return_record = models.ForeignKey(ReturnRecord, null=True, blank=True, on_delete=models.SET_NULL, related_name="ledger_entries")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

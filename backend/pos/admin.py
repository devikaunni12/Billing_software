from django.contrib import admin
from .models import LedgerEntry, Product, ReturnItem, ReturnRecord, Sale, SaleItem, Supplier


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    readonly_fields = ["product_name", "sku", "quantity", "unit_price", "line_total"]


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ["receipt_number", "cashier", "total", "payment_method", "created_at"]
    search_fields = ["receipt_number", "customer_name", "cashier__username"]
    inlines = [SaleItemInline]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["sku", "name", "category", "price", "stock", "is_active"]
    search_fields = ["sku", "name", "category"]
    list_filter = ["category", "is_active"]


admin.site.register([Supplier, ReturnRecord, ReturnItem, LedgerEntry])

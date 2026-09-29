"""Convert POS models to and from JSON for the REST API."""
from rest_framework import serializers
from .models import LedgerEntry, Product, ReturnRecord, Sale, SaleItem, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"
        read_only_fields = ["created_at"]


class ProductSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default="")

    class Meta:
        model = Product
        fields = "__all__"
        read_only_fields = ["created_at"]
        extra_kwargs = {"price": {"min_value": 0}, "cost": {"min_value": 0}}


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = ["id", "product", "product_name", "sku", "quantity", "unit_price", "line_total"]


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    cashier_name = serializers.CharField(source="cashier.username", read_only=True)

    class Meta:
        model = Sale
        fields = "__all__"
        read_only_fields = ["id", "receipt_number", "cashier", "customer_name", "subtotal", "discount", "tax", "total", "payment_method", "amount_paid", "change_due", "created_at"]


class ReturnItemSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="sale_item.id")
    product_name = serializers.CharField(source="sale_item.product_name")
    sku = serializers.CharField(source="sale_item.sku")
    quantity = serializers.IntegerField()
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    refund_amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class ReturnRecordSerializer(serializers.ModelSerializer):
    items = ReturnItemSerializer(many=True, read_only=True)
    processed_by_name = serializers.CharField(source="processed_by.username", read_only=True)
    receipt_number = serializers.CharField(source="sale.receipt_number", read_only=True)

    class Meta:
        model = ReturnRecord
        fields = ["id", "sale", "receipt_number", "processed_by", "processed_by_name", "reason", "total_refund", "created_at", "items"]
        read_only_fields = fields


class LedgerEntrySerializer(serializers.ModelSerializer):
    receipt_number = serializers.CharField(source="sale.receipt_number", read_only=True, default="")

    class Meta:
        model = LedgerEntry
        fields = "__all__"
        read_only_fields = ["id", "entry_type", "amount", "note", "sale", "return_record", "created_at"]

"""Behavior tests for checkout safety, returns, and staff access."""
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from .models import LedgerEntry, Product, ReturnRecord, Sale, SaleItem, Supplier


class PosWorkflowTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user("manager", password="TestPassword123!", is_staff=True)
        self.staff = user_model.objects.create_user("clerk", password="TestPassword123!")
        supplier = Supplier.objects.create(name="Test Textiles")
        self.product = Product.objects.create(sku="TEST-01", name="Cotton Shirt", price="20.00", cost="8.00", stock=5, supplier=supplier)

    def test_checkout_deducts_stock_and_records_ledger(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(reverse("checkout"), {"items": [{"product_id": self.product.id, "quantity": 2}], "payment_method": "cash", "amount_paid": "50.00"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)
        self.assertEqual(response.data["total"], "40.00")
        self.assertEqual(response.data["change_due"], "10.00")
        self.assertEqual(LedgerEntry.objects.get().amount, Decimal("40.00"))

    def test_checkout_rejects_insufficient_stock_without_partial_sale(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(reverse("checkout"), {"items": [{"product_id": self.product.id, "quantity": 6}], "amount_paid": "200.00"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)

    def test_admin_return_restocks_and_cannot_exceed_sold_quantity(self):
        sale = Sale.objects.create(receipt_number="R-TEST-001", cashier=self.staff, subtotal="40.00", total="40.00", payment_method="cash", amount_paid="40.00")
        sale_item = SaleItem.objects.create(sale=sale, product=self.product, product_name=self.product.name, sku=self.product.sku, quantity=2, unit_price="20.00", line_total="40.00")
        self.product.stock = 3
        self.product.save(update_fields=["stock"])
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse("returns"), {"sale_item_id": sale_item.id, "quantity": 1, "reason": "Wrong size"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 4)
        self.assertEqual(LedgerEntry.objects.get(entry_type="refund").amount, Decimal("-20.00"))
        over_return = self.client.post(reverse("returns"), {"sale_item_id": sale_item.id, "quantity": 2}, format="json")
        self.assertEqual(over_return.status_code, 400)
        self.assertEqual(self.client.get(reverse("returns")).status_code, 200)
        ledger_response = self.client.get(reverse("ledger"))
        self.assertEqual(ledger_response.status_code, 200)
        self.assertEqual(ledger_response.data[0]["entry_type"], "refund")

    def test_staff_cannot_manage_products_or_returns(self):
        self.client.force_authenticate(self.staff)
        product_response = self.client.post(reverse("product-list"), {"sku": "BAD", "name": "No", "price": "1.00", "cost": "1.00", "stock": 1}, format="json")
        returns_response = self.client.get(reverse("returns"))
        self.assertEqual(product_response.status_code, 403)
        self.assertEqual(returns_response.status_code, 403)

    def test_admin_can_permanently_delete_product_without_sales_history(self):
        self.client.force_authenticate(self.admin)
        response = self.client.delete(reverse("product-detail", args=[self.product.id]))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Product.objects.filter(pk=self.product.id).exists())

    def test_admin_cannot_delete_product_used_in_a_transaction(self):
        sale = Sale.objects.create(receipt_number="R-KEEP-001", cashier=self.staff, subtotal="20.00", total="20.00", payment_method="cash", amount_paid="20.00")
        SaleItem.objects.create(sale=sale, product=self.product, product_name=self.product.name, sku=self.product.sku, quantity=1, unit_price="20.00", line_total="20.00")
        self.client.force_authenticate(self.admin)
        response = self.client.delete(reverse("product-detail", args=[self.product.id]))
        self.assertEqual(response.status_code, 400)
        self.assertIn("completed transactions", response.data["detail"])
        self.assertTrue(Product.objects.filter(pk=self.product.id).exists())

    def test_admin_can_delete_supplier_without_deleting_its_products(self):
        supplier_id = self.product.supplier_id
        self.client.force_authenticate(self.admin)
        response = self.client.delete(reverse("supplier-detail", args=[supplier_id]))
        self.assertEqual(response.status_code, 204)
        self.product.refresh_from_db()
        self.assertIsNone(self.product.supplier)
        self.assertTrue(Product.objects.filter(pk=self.product.id).exists())

    def test_dashboard_metrics_show_net_revenue_and_correct_active_counts(self):
        sale = Sale.objects.create(receipt_number="R-REPORT-001", cashier=self.staff, subtotal="100.00", total="100.00", payment_method="cash", amount_paid="100.00")
        ReturnRecord.objects.create(sale=sale, processed_by=self.admin, reason="Partial refund", total_refund="25.00")
        Product.objects.create(sku="INACTIVE-01", name="Inactive item", price="1.00", stock=2, is_active=False)
        inactive_staff = get_user_model().objects.create_user("former-clerk", password="TestPassword123!")
        inactive_staff.is_active = False
        inactive_staff.save(update_fields=["is_active"])
        self.client.force_authenticate(self.admin)

        response = self.client.get(reverse("reports"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["revenue_today"], Decimal("75.00"))
        self.assertEqual(response.data["sales_today"], 1)
        self.assertEqual(response.data["products"], 1)
        self.assertEqual(response.data["staff"], 1)
        today_row = next(row for row in response.data["week"] if row["date"] == timezone.localdate().isoformat())
        self.assertEqual(today_row["total"], Decimal("75.00"))
        self.assertEqual(today_row["count"], 1)

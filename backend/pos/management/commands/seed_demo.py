"""Create deterministic demo accounts and a small textile catalog."""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from pos.models import Product, Supplier


class Command(BaseCommand):
    help = "Create demo admin/staff users and sample inventory."

    def handle(self, *args, **options):
        user_model = get_user_model()
        admin, _ = user_model.objects.get_or_create(username="admin", defaults={"email": "admin@example.com", "is_staff": True})
        admin.is_staff = True
        admin.is_active = True
        admin.set_password("Admin123!")
        admin.save()
        staff, _ = user_model.objects.get_or_create(username="cashier", defaults={"email": "cashier@example.com"})
        staff.is_staff = False
        staff.is_active = True
        staff.set_password("Staff123!")
        staff.save()

        supplier, _ = Supplier.objects.get_or_create(name="Loom & Thread Supply", defaults={"contact_name": "Maya Patel", "phone": "+1 555 010 2233", "email": "orders@example.com"})
        sample_products = [
            ("TX-001", "Linen Blend Shirt", "Apparel", "M", "Sage", "48.00", "22.00", 18),
            ("TX-002", "Cotton Poplin Yardage", "Fabric", "1 yd", "Ivory", "12.50", "5.25", 42),
            ("TX-003", "Woven Tote Bag", "Accessories", "One size", "Rust", "24.00", "9.00", 7),
            ("TX-004", "Merino Scarf", "Accessories", "One size", "Charcoal", "36.00", "15.00", 4),
            ("TX-005", "Denim Work Apron", "Apparel", "L", "Indigo", "54.00", "26.00", 11),
        ]
        for sku, name, category, size, color, price, cost, stock in sample_products:
            Product.objects.update_or_create(sku=sku, defaults={"name": name, "category": category, "size": size, "color": color, "price": price, "cost": cost, "stock": stock, "supplier": supplier, "is_active": True})
        self.stdout.write(self.style.SUCCESS("Demo data is ready. Admin: admin / Admin123!  Staff: cashier / Staff123!"))

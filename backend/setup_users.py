import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

# Admin Account
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'Admin123!')
    print("Admin user created successfully")

# Cashier Account
if not User.objects.filter(username='cashier').exists():
    User.objects.create_user('cashier', 'cashier@example.com', 'Staff123!')
    print("Cashier user created successfully")
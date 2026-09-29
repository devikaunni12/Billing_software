# Takeline POS

A beginner-friendly point-of-sale and inventory demo for a small textile or retail shop. The Django REST API and SQLite database live in `backend/`; the responsive HTML, CSS, and vanilla JavaScript application lives in `frontend/`.

## Features

- Admin overview with daily sales metrics, a seven-day chart, low-stock count, and recent bills.
- Product and supplier create, edit, and archive/manage screens.
- Admin/staff account creation, role changes, and access activation.
- Staff billing with a searchable product catalog, stock-aware cart, discounts, payment methods, change calculation, and printable receipts.
- Admin transaction history and receipt reprinting.
- Returns tied to original sale lines, limited to the quantity purchased; returned goods are put back into stock and refunds are recorded as negative ledger entries.
- Ledger view and CSV export.
- Mobile app-style admin interface at `/mobile-admin/`. Every admin page is available through its mobile navigation.
- Session login protected by Django CSRF middleware and server-side admin/staff permissions.

## Requirements

- Python 3.10 or newer
- pip
- No Node.js or frontend build tools are required.

## Run locally (Windows PowerShell)

From the project root:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r backend\requirements.txt
py backend\manage.py migrate
py backend\manage.py seed_demo
py backend\manage.py runserver
```

Open the demo at `http://127.0.0.1:8000/`. The admin portal is at `/`, the dedicated phone-layout admin portal is at `/mobile-admin/`, and the cashier billing portal is at `/billing/`.

On macOS or Linux, replace the virtual-environment activation command with `source .venv/bin/activate`; the remaining commands are the same.

## Demo credentials

- Admin: `admin` / `Admin123!`
- Staff cashier: `cashier` / `Staff123!`

The `seed_demo` command can be rerun safely to restore these demo passwords and sample catalog records. Do not use these public demo credentials for a real shop.

## Tests and Django admin

Run the API workflow tests:

```powershell
py backend\manage.py test pos
```

Run Django's system checks:

```powershell
py backend\manage.py check
```

The built-in Django admin is available at `/django-admin/`; the demo account is an application admin but is not a Django superuser. Shop management is provided in the custom admin portal.

## API overview

- `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`
- `GET/POST/PUT/PATCH/DELETE /api/products/` (admin writes; staff can view active stock)
- `GET/POST/PUT/PATCH/DELETE /api/suppliers/` (admin only)
- `GET/POST/PATCH /api/staff/` (admin only)
- `POST /api/checkout/` (authenticated staff or admin)
- `GET/POST /api/returns/`, `GET /api/ledger/`, `GET /api/reports/` (admin only)
- `GET /api/transactions/` (admins see all; staff see their own)

## Assumptions and limitations

- Amounts use USD for the demo and tax is currently zero; change the currency formatting and checkout tax policy to match the target country before real use.
- This is a local interview demo, not a production deployment. Before deployment, set a private `SECRET_KEY`, turn off `DEBUG`, configure allowed hosts and HTTPS/cookie settings, add database backups, and use real access policies and password reset processes.
- SQLite is suitable for local evaluation and light single-store use. For concurrent tills or multiple locations, migrate to PostgreSQL and add a deployment-grade stock locking strategy.
- Product removal is an archive operation so historical sale records stay intact. Returns are linked to sold quantities and issue a ledger refund at the original sale price.
- No live URL or public repository is configured in this workspace. The local test URLs and credentials above work after setup.

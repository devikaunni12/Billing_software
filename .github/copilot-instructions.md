# POS Billing project notes

- Backend source and Python commands live in `backend/`; use Django REST Framework and SQLite.
- Frontend source lives in `frontend/`; keep it plain HTML, CSS, and vanilla JavaScript.
- Run backend commands from the workspace root as `python backend/manage.py <command>` after installing `backend/requirements.txt`.
- Keep checkout and return stock changes inside database transactions and preserve role-based permissions.

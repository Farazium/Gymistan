# GymPro — Gym Management SaaS

## Stack
- **Backend:** Django 5 + Django REST Framework + PostgreSQL
- **Frontend:** React + Vite + Tailwind CSS
- **Auth:** JWT (SimpleJWT)
- **PDF Slips:** ReportLab
- **WhatsApp:** Meta WhatsApp Cloud API

---

## Setup

### Backend

1. Create a virtual environment and install dependencies:
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

2. Copy `.env.example` to `.env` and fill in your values:
```
DB_NAME=gym_saas
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432
SECRET_KEY=your-secret-key
```

3. Run migrations and create superadmin:
```bash
python manage.py migrate
python prisma/seed.py
```

4. Start the server:
```bash
python manage.py runserver
```

Default superadmin: `admin@gymsaas.com` / `Admin@1234`

---

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`

---

## Roles

| Role | Access |
|------|--------|
| SUPERADMIN | Create/manage gyms, see all |
| GYM_ADMIN | Full access to their gym |
| ACCOUNTANT | Members, payments, expenses |

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| POST /api/auth/login/ | Login |
| GET /api/dashboard/ | Dashboard stats |
| GET/POST /api/members/ | Members |
| GET/POST /api/packages/ | Packages |
| GET/POST /api/payments/ | Payments |
| GET /api/payments/{id}/slip/ | Download PDF slip |
| POST /api/payments/{id}/whatsapp/ | Send slip via WhatsApp |
| GET/POST /api/expenses/ | Expenses |
| GET/POST /api/gyms/ | Gyms (superadmin only) |

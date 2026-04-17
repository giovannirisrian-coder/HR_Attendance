# Berau Coal – Digital Attendance, Approval & Reporting System (DAARS)

A modern, role-based web application that replaces fragmented manual attendance processes with a seamless digital workflow.

---

## Architecture

```
HR_Attendance/
├── backend/          Node.js + Express REST API
│   ├── src/
│   │   ├── config/   database.js  |  schema.sql
│   │   ├── controllers/
│   │   ├── middleware/
│   │   └── routes/
│   ├── uploads/      document storage
│   ├── .env
│   └── index.js
└── frontend/         Vue 3 + Vite SPA
    └── src/
        ├── router/
        ├── utils/    api.js  |  auth.js
        ├── views/
        │   ├── layouts/AppLayout.vue
        │   ├── LoginView.vue
        │   ├── ls/
        │   ├── supervisor/
        │   └── vendor/
        └── style.css
```

---

## Tech Stack

| Layer     | Technology                    |
|-----------|-------------------------------|
| Frontend  | Vue 3, Vite 5, Vue Router 4   |
| Backend   | Node.js, Express 4            |
| Database  | MySQL 8                       |
| Auth      | JWT (jsonwebtoken + bcryptjs) |
| Files     | Multer (local disk)           |
| Geo       | Browser Geolocation API + Nominatim reverse-geocode |

---

## Roles

| Role            | Capabilities                                               |
|-----------------|------------------------------------------------------------|
| **LS**          | Create clock-in/out with geotag · View own attendance list |
| **LS Supervisor** | Review team attendance · Approve / Reject records        |
| **Vendor**      | Monthly summary grid · Submit recap report with documents  |

---

## Quick Start

### 1. Database Setup

```sql
-- Run the schema file in your MySQL client:
SOURCE backend/src/config/schema.sql;
```

### 2. Backend

```powershell
cd backend
# Edit .env – set DB_USER, DB_PASSWORD
npm start
# API runs on http://localhost:3000
```

### 3. Frontend

```powershell
cd frontend
npm run dev
# App runs on http://localhost:5173
```

---

## Demo Accounts

| Role        | Email                       | Password   |
|-------------|----------------------------|------------|
| LS Employee | ls1@beraucoal.com           | password   |
| LS Employee | ls2@beraucoal.com           | password   |
| Supervisor  | supervisor1@beraucoal.com   | password   |
| Vendor      | vendor1@beraucoal.com       | password   |

> **Note:** The seed data uses a bcrypt hash of `password`. To use a different password, generate a new hash with `bcrypt.hash('yourpassword', 10)` and update the schema.

---

## API Endpoints

### Auth
| Method | Endpoint         | Description    |
|--------|------------------|----------------|
| POST   | /api/auth/login  | Login          |
| GET    | /api/auth/profile| Get profile    |

### Attendance (LS)
| Method | Endpoint                   | Description        |
|--------|----------------------------|--------------------|
| POST   | /api/attendance            | Create clock-in/out|
| GET    | /api/attendance/my         | My records         |

### Attendance (Supervisor)
| Method | Endpoint                         | Description      |
|--------|----------------------------------|------------------|
| GET    | /api/attendance/team             | Team records     |
| PUT    | /api/attendance/:id/approval     | Approve / Reject |

### Reports (Vendor)
| Method | Endpoint                             | Description         |
|--------|--------------------------------------|---------------------|
| GET    | /api/reports                         | Monthly summary grid|
| GET    | /api/reports/:userId/:month/:year    | Detail + attendance |
| POST   | /api/reports/:userId/:month/:year    | Submit recap report |

---

## Environment Variables (backend/.env)

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=beraucoal_attendance
JWT_SECRET=change_this_to_a_strong_secret
JWT_EXPIRES_IN=24h
FRONTEND_URL=http://localhost:5173
```

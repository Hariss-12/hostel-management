# Hostel Management System

React + Node/Express + MongoDB. The backend uses MongoDB's native Node.js driver and the Atlas database `hostel_management` by default. REST endpoints and frontend contracts remain unchanged.

## Requirements

- Node.js 18 or newer
- MongoDB Atlas (or a local MongoDB replica set for transaction support)

The application does not connect to MongoDB until you start the backend or run a backend script. No database connection is performed as part of this repository setup.

## Backend setup

```powershell
cd backend
Copy-Item .env.example .env
npm install
```

Set these values in `backend/.env` using your own MongoDB connection details. Never commit `.env` or paste credentials into source files:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas URI (store privately; do not share it) |
| `MONGODB_DB` | Database name; defaults to `hostel_management` |
| `JWT_SECRET` | Long random signing secret |
| `CLIENT_URL` | Allowed frontend origin(s), comma separated |

Use the provided URI placeholder in `.env.example` as a format example only. Create the empty Atlas database named `hostel_management` (or use the default) and make sure its network access list and database user permissions are configured. The backend creates its collections on first write and ensures indexes during startup; no schema import or manual initialization is required. `npm run init-db` can be used to connect and create/check indexes.

Indexes include unique normalized user email, role + username, student roll number, room number per hostel, bed number per room, active allocation per bed/student, attendance per student/date, weekly meal entries, and meal opt-outs. Numeric API IDs are generated with an atomic MongoDB counter. Multi-document operations use MongoDB transactions; use an Atlas cluster or a transaction-capable MongoDB replica set.

Create the initial admin using environment variables, then start the server:

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "<set-a-private-password>"
npm run create-admin
npm run dev
```

For staff ID login, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` privately and run `npm run set-admin-credentials`. `npm run set-staff-credentials` sets the same username/password for the sole warden and sole maintenance account; each credential script refuses to make changes unless exactly one account per required role exists. Passwords are hashed before storage and are not printed.

Optional local showcase scripts require `DEMO_PASSWORD` to be set in the environment. `npm run seed-demo` seeds showcase records; `npm run create-demo-student` creates the demo student. Do not use demo accounts in production.

Health check: `http://localhost:5000/api/health`.

## Frontend setup

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

## Application overview

Roles: admin, warden, student, and maintenance. Modules include staff and student accounts, hostels/rooms/beds, allocations and transfers, fees/payments, attendance, leaves, mess menu and meal opt-outs, complaints, notifications, dashboards, and CSV reports. The REST API is under `/api`; all routes require a bearer token except `POST /api/auth/login`.

## Deployment

The Render blueprint deploys the API and frontend. Configure `MONGODB_URI` and `MONGODB_DB` in the backend service's private environment settings, and set `CLIENT_URL` to the frontend URL. MongoDB Atlas remains an external managed dependency; `render.yaml` does not provision a PostgreSQL database or include database credentials. Initialize indexes and create the first admin by running the documented backend scripts in an environment configured with the private connection variables.

## Notes

- `backend/.env` is intentionally local and is not included in this repository. Provide your own `MONGODB_URI`; do not use or disclose a URI from chat history.
- PostgreSQL schema/setup files have been retired. There is no automatic PostgreSQL data migration; this deployment targets a new empty MongoDB database.

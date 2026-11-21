# Hostel Management System (HMS)

React + Node/Express + PostgreSQL. Four roles (admin, warden, student, maintenance staff), each with its own dashboard and sidebar.

```
hostel-management-system/
├── backend/
│   ├── database/schema.sql      <- complete, repeatable database schema/upgrade
│   ├── scripts/createAdmin.js   <- creates the first admin
│   ├── scripts/seedDemoData.js  <- inserts showcase data for all dashboards
│   ├── src/
│   │   ├── config/db.js         <- PostgreSQL connection (pg Pool, reads .env)
│   │   ├── middleware/          <- JWT auth, role checks, validation, errors
│   │   ├── routes/              <- one file per module
│   │   └── utils/
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/client.js        <- Axios instance (adds the JWT token)
    │   ├── components/          <- DataTable, Modal, form controls, layout, receipt...
    │   ├── context/             <- auth + toast/confirm providers
    │   ├── hooks/               <- useFetch, useForm
    │   ├── pages/               <- one page per module (+ pages/dashboards/)
    │   └── styles/index.css
    ├── .env.example
    └── package.json
```

## Student registration rules
- Public sign-up creates student accounts only. Admin, warden and maintenance accounts are created by an administrator.
- Student year of study is restricted to 1st–4th year.
- Guardian name and guardian phone are optional in registration, profile updates and staff-managed student records.

## Requirements
- Node.js 18 or newer
- PostgreSQL (already installed on your machine)

Nothing in this project connects to your database until **you** run the steps below.

## 1. Create the database (you do this)

Using pgAdmin 4 (recommended for Windows):

1. Expand **Servers → PostgreSQL → Databases**.
2. Create a database named `hostel_management` if it does not already exist.
3. Right-click `hostel_management` and choose **Query Tool**.
4. Open `backend/database/schema.sql` in VS Code, copy the entire file from the first line to the last line, paste it into Query Tool, press **Ctrl+A**, then press **F5**.
5. Confirm the Messages tab says the query completed successfully, then refresh **Schemas → public → Tables**.

The script is transactional and non-destructive: it creates all HMS tables and upgrades columns on an older partial `students` table. It does not drop tables or delete existing records. Do not execute only the final index lines.

Alternatively, use `psql` (adjust the user name if yours is not `postgres`):

```bash
# create an empty database
psql -U postgres -c "CREATE DATABASE hostel_management;"

# create all tables (run from the project root)
psql -U postgres -d hostel_management -f backend/database/schema.sql
```

You can do the same in pgAdmin: create a database named `hostel_management`, open the Query Tool, paste the contents of `backend/database/schema.sql` and run it.

> `schema.sql` is non-destructive and transactional: it creates missing tables and adjusts student rules without dropping tables or deleting records. It is safe to re-run. It also makes guardian fields nullable and restricts new/updated student years to 1–4.

## 2. Configure the backend

```bash
cd backend
cp .env.example .env        # on Windows: copy .env.example .env
npm install
```

Open `backend/.env` and fill in:

| Variable | Meaning |
| --- | --- |
| `DB_HOST`, `DB_PORT` | Usually `localhost` and `5432` |
| `DB_USER`, `DB_PASSWORD` | Your PostgreSQL login |
| `DB_NAME` | `hostel_management` (or the name you chose) |
| `JWT_SECRET` | A long random string. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Your first admin account |

Instead of the `DB_*` values you can set a single `DATABASE_URL=postgresql://user:password@localhost:5432/hostel_management`.

## 3. Create the first admin and start the API

```bash
cd backend
npm run create-admin   # inserts the admin from ADMIN_* in .env (safe to re-run)
npm run dev            # starts http://localhost:5000  (or: npm start)
```

The console prints the connected database name and checks for all required HMS tables. If tables are missing, it lists them and tells you to apply `backend/database/schema.sql`. Health check: http://localhost:5000/api/health

## 4. Start the frontend

```bash
cd frontend
cp .env.example .env     # only needed if your API is not on http://localhost:5000/api
npm install
npm run dev              # http://localhost:5173
```

Sign in with the admin email and password from your `.env`.

## 5. Add showcase/demo data (optional)

After applying the full schema and creating the admin account, run this from the `backend` folder:

```bash
npm run seed-demo
```

This creates or refreshes dedicated demo accounts and adds linked sample rooms, bed allocations, fee invoices, payments, attendance, leave requests, a weekly mess menu, complaints and notifications. It does not delete existing records or change the administrator account. The demo user passwords are reset each time the script is run, so use these only for a local showcase:

| Role | Email | Password |
| --- | --- | --- |
| Student 1 | `student1@demo.com` | `Demo@1234` |
| Student 2 | `student2@demo.com` | `Demo@1234` |
| Warden | `warden@demo.com` | `Warden@1234` |
| Maintenance | `maintenance@demo.com` | `Maint@1234` |

The demo student roll numbers are `STU001` and `STU002`. Use the Student role selector on the login page for student accounts. Do not use demo passwords outside a local demonstration.

## 6. First-time setup order (in the app)

1. **Staff** (admin): add wardens and maintenance staff.
2. **Hostels & rooms**: add a hostel (assign a warden), then add rooms. Each room creates one bed per place.
3. **Students**: register students (you set a temporary password; they can change it under Profile).
4. **Allocations**: allocate beds. Transfers and vacating are on the same page.
5. **Fees & payments**: bill one student, a hostel, or everyone; record payments and print receipts.
6. **Mess**: fill in the weekly menu. Students can then skip meals and you see the daily headcount.

## What each role can do

| Module | Admin | Warden | Student | Maintenance |
| --- | --- | --- | --- | --- |
| Dashboard (role-specific) | yes | yes | yes | yes |
| Staff accounts | manage | - | - | - |
| Students | manage (incl. delete) | register / edit | own profile | - |
| Hostels | manage | view | - | - |
| Rooms and beds | manage | manage | own room view | - |
| Allocations / transfers | manage | manage | view own | - |
| Fees, payments, receipts | manage | manage | view own, print receipts | - |
| Attendance | mark / view | mark / view | view own | - |
| Leave | decide | decide | apply / cancel | - |
| Mess menu and headcount | manage | manage | view, skip meals | - |
| Complaints | assign / update | assign / update | raise, close, reopen | update assigned tasks |
| Reports (CSV export) | yes | yes | - | - |
| Notifications | send + receive | send + receive | receive | receive |

Notes: wardens currently see all hostels (not only the one they are assigned to). Automatic notifications go out for allocations, transfers, fees, payments, leave decisions and complaint updates.

## REST API overview

All routes are under `/api` and need `Authorization: Bearer <token>` except `POST /auth/login`.

`/auth` (login, me, change-password) · `/staff` · `/students` · `/hostels` · `/rooms` · `/beds` · `/allocations` · `/fees` (+ `/fees/payments`) · `/attendance` · `/leaves` · `/mess` · `/complaints` · `/notifications` · `/dashboard` · `/reports/:type`

## Troubleshooting
- **"The database is not reachable"**: check `DB_*` values in `backend/.env` and that PostgreSQL is running.
- **`relation "users" does not exist`**: `schema.sql` has not been fully applied to the database named in `DB_NAME`. Open the entire file from its first line in pgAdmin Query Tool and execute it; the script is safe to re-run.
- **Frontend shows "Cannot reach the server"**: start the backend, and make sure `VITE_API_URL` matches its port. `CLIENT_URL` in the backend `.env` must match the frontend address (default `http://localhost:5173`).
- **`bcrypt` fails to install**: install your platform's C++ build tools, or use Node 18/20/22 LTS where prebuilt binaries are available.

## Production build
```bash
cd frontend && npm run build    # static files in frontend/dist
```

## Deploy to Render with GitHub Actions

1. **Push to GitHub** (`main` branch).
2. **Render > New > Blueprint** > select this repo. It reads `render.yaml` and creates a PostgreSQL database, the `hms-backend` web service and the `hms-frontend` static site.
3. After the first deploy, set these environment variables in the Render dashboard:
   - `hms-backend` > `CLIENT_URL` = your frontend URL (e.g. `https://hms-frontend.onrender.com`)
   - `hms-frontend` > `VITE_API_URL` = your backend URL + `/api` (e.g. `https://hms-backend.onrender.com/api`), then redeploy the frontend (the value is baked in at build time).
4. **Create the tables and the first admin** from your computer, using the database's *External Database URL* from Render:
   ```bash
   cd backend
   DATABASE_URL="<external url>" DB_SSL=true npm run init-db
   DATABASE_URL="<external url>" DB_SSL=true ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='StrongPass123' npm run create-admin
   ```
   (On Windows PowerShell set the variables first: `$env:DATABASE_URL="..."; $env:DB_SSL="true"`.)
5. **Auto-deploy from GitHub Actions**: in each Render service open *Settings > Deploy Hook*, copy the URL, then in GitHub go to *Settings > Secrets and variables > Actions* and add:
   - Secrets: `RENDER_BACKEND_DEPLOY_HOOK`, `RENDER_FRONTEND_DEPLOY_HOOK`
   - (optional) Variable: `VITE_API_URL` (used only for the CI build check)

Every push to `main` now runs `.github/workflows/deploy.yml`: it checks the backend, builds the frontend, then triggers both Render deploys.

BEGIN;

-- =====================================================================
-- Hostel Management System - PostgreSQL schema
-- Apply this file to the hostel_management database using pgAdmin Query Tool.
-- This script is non-destructive and safe to run more than once.
-- It creates missing HMS tables and adjusts the student registration rules.
-- It does NOT drop tables or delete existing records.

-- ---------------------------------------------------------------------
-- Users (all four roles share this table)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,            -- stored in lower case
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'warden', 'student', 'maintenance')),
  phone         VARCHAR(20),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Hostels, rooms and beds
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hostels (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  type       VARCHAR(10)  NOT NULL CHECK (type IN ('boys', 'girls', 'mixed')),
  address    VARCHAR(255),
  warden_id  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  hostel_id   INT           NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
  room_number VARCHAR(20)   NOT NULL,
  floor       INT           NOT NULL DEFAULT 0,
  room_type   VARCHAR(20)   NOT NULL DEFAULT 'double' CHECK (room_type IN ('single', 'double', 'triple', 'dormitory')),
  capacity    INT           NOT NULL CHECK (capacity BETWEEN 1 AND 12),
  monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  UNIQUE (hostel_id, room_number)
);

-- One row per bed. A bed is "occupied" when it has an active allocation.
CREATE TABLE IF NOT EXISTS beds (
  id         SERIAL PRIMARY KEY,
  room_id    INT     NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  bed_number INT     NOT NULL,
  is_usable  BOOLEAN NOT NULL DEFAULT TRUE,               -- FALSE = under maintenance
  UNIQUE (room_id, bed_number)
);

-- ---------------------------------------------------------------------
-- Students and room allocations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id             SERIAL PRIMARY KEY,
  user_id        INT          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  roll_number    VARCHAR(30)  NOT NULL UNIQUE,
  course         VARCHAR(100) NOT NULL,
  year_of_study  INT          NOT NULL CHECK (year_of_study BETWEEN 1 AND 4),
  gender         VARCHAR(10)  NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  date_of_birth  DATE,
  blood_group    VARCHAR(5),
  guardian_name  VARCHAR(100),
  guardian_phone VARCHAR(20),
  address        VARCHAR(255),
  admission_date DATE         NOT NULL DEFAULT CURRENT_DATE,
  status         VARCHAR(10)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'alumni'))
);

CREATE TABLE IF NOT EXISTS allocations (
  id         SERIAL PRIMARY KEY,
  student_id INT         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  bed_id     INT         NOT NULL REFERENCES beds(id),
  start_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  end_date   DATE,
  status     VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'vacated')),
  remarks    VARCHAR(255),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A student can hold only one active bed, and a bed can hold only one active student
CREATE UNIQUE INDEX IF NOT EXISTS one_active_allocation_per_student ON allocations (student_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS one_active_allocation_per_bed     ON allocations (bed_id)     WHERE status = 'active';

-- ---------------------------------------------------------------------
-- Fees, payments and receipts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fees (
  id         SERIAL PRIMARY KEY,
  student_id INT           NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title      VARCHAR(120)  NOT NULL,
  amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  due_date   DATE          NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1001;

CREATE TABLE IF NOT EXISTS payments (
  id           SERIAL PRIMARY KEY,
  fee_id       INT           NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
  receipt_no   VARCHAR(30)   NOT NULL UNIQUE,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  method       VARCHAR(20)   NOT NULL CHECK (method IN ('cash', 'upi', 'card', 'bank_transfer', 'cheque')),
  reference    VARCHAR(100),
  payment_date DATE          NOT NULL DEFAULT CURRENT_DATE,
  received_by  INT REFERENCES users(id) ON DELETE SET NULL,
  remarks      VARCHAR(255),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Attendance and leave
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id              SERIAL PRIMARY KEY,
  student_id      INT         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance_date DATE        NOT NULL,
  status          VARCHAR(10) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'on_leave')),
  remarks         VARCHAR(255),
  marked_by       INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (student_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS leaves (
  id            SERIAL PRIMARY KEY,
  student_id    INT          NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_date     DATE         NOT NULL,
  to_date       DATE         NOT NULL,
  reason        VARCHAR(500) NOT NULL,
  destination   VARCHAR(150) NOT NULL,
  contact_phone VARCHAR(20),
  status        VARCHAR(10)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  warden_remark VARCHAR(255),
  decided_by    INT REFERENCES users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (to_date >= from_date)
);

-- ---------------------------------------------------------------------
-- Mess menu and meal opt-outs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mess_menu (
  id          SERIAL PRIMARY KEY,
  day_of_week INT          NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),   -- 1 = Monday ... 7 = Sunday
  meal_type   VARCHAR(10)  NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'snacks', 'dinner')),
  items       VARCHAR(300) NOT NULL,
  UNIQUE (day_of_week, meal_type)
);

CREATE TABLE IF NOT EXISTS meal_opt_outs (
  id         SERIAL PRIMARY KEY,
  student_id INT         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  meal_date  DATE        NOT NULL,
  meal_type  VARCHAR(10) NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'snacks', 'dinner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, meal_date, meal_type)
);

-- ---------------------------------------------------------------------
-- Complaints / maintenance requests
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaints (
  id              SERIAL PRIMARY KEY,
  student_id      INT          NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category        VARCHAR(20)  NOT NULL CHECK (category IN ('electrical', 'plumbing', 'furniture', 'cleaning', 'internet', 'other')),
  title           VARCHAR(150) NOT NULL,
  description     TEXT         NOT NULL,
  location        VARCHAR(100),
  priority        VARCHAR(10)  NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status          VARCHAR(15)  NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
  assigned_to     INT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note VARCHAR(500),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Notifications (one row per recipient)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(150) NOT NULL,
  message    TEXT         NOT NULL,
  link       VARCHAR(100),
  is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Upgrade columns for databases that were created from an earlier/partial
-- version of the HMS schema. CREATE TABLE IF NOT EXISTS alone does not add
-- columns to a table that already exists.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5);
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(20);
ALTER TABLE students ADD COLUMN IF NOT EXISTS address VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'active';
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure older partial student tables have the relationships and uniqueness
-- expected by the API. These indexes are safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS students_user_id_key ON students (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS students_roll_number_key ON students (roll_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.students'::regclass AND conname = 'students_user_id_fkey'
  ) THEN
    ALTER TABLE students ADD CONSTRAINT students_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- Enforce supported student values for new/updated records without rejecting
-- historical rows during this non-destructive upgrade.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_year_of_study_check;
ALTER TABLE students ADD CONSTRAINT students_year_of_study_check
  CHECK (year_of_study BETWEEN 1 AND 4) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.students'::regclass AND conname = 'students_status_check'
  ) THEN
    ALTER TABLE students ADD CONSTRAINT students_status_check
      CHECK (status IN ('active', 'inactive', 'alumni')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.students'::regclass AND conname = 'students_gender_check'
  ) THEN
    ALTER TABLE students ADD CONSTRAINT students_gender_check
      CHECK (gender IN ('male', 'female', 'other')) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rooms_hostel          ON rooms (hostel_id);
CREATE INDEX IF NOT EXISTS idx_beds_room             ON beds (room_id);
CREATE INDEX IF NOT EXISTS idx_allocations_student   ON allocations (student_id);
CREATE INDEX IF NOT EXISTS idx_fees_student          ON fees (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_fee          ON payments (fee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date       ON attendance (attendance_date);
CREATE INDEX IF NOT EXISTS idx_leaves_student_status ON leaves (student_id, status);
CREATE INDEX IF NOT EXISTS idx_complaints_status     ON complaints (status);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned   ON complaints (assigned_to);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications (user_id, is_read);


-- Guardian information remains optional for student registration.
ALTER TABLE students ALTER COLUMN guardian_name DROP NOT NULL;
ALTER TABLE students ALTER COLUMN guardian_phone DROP NOT NULL;

COMMIT;

-- Run this in pgAdmin Query Tool while connected to hostel_management.
SELECT current_database() AS connected_database;

WITH required(table_name) AS (
  VALUES
    ('users'), ('students'), ('hostels'), ('rooms'), ('beds'), ('allocations'),
    ('fees'), ('payments'), ('attendance'), ('leaves'), ('mess_menu'),
    ('meal_opt_outs'), ('complaints'), ('notifications')
)
SELECT r.table_name,
       CASE WHEN to_regclass('public.' || r.table_name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM required r
ORDER BY r.table_name;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'students')
ORDER BY table_name, ordinal_position;

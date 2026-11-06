# Northstar Clinic workspace

This repository contains a React frontend, an Express API, PostgreSQL, and Redis-backed sessions. Patient registration and appointment reads/writes use the API. The browser no longer stores patient and appointment lists in localStorage.

## Local development

1. Copy `.env.example` to `.env` and replace each placeholder with a unique random secret. Keep `.env` out of Git. `DEMO_LOGIN_ENABLED=true` seeds the two mock accounts in development; set it to `false` if you do not want them.
2. Start the local services from the repository root:

   ```sh
   docker compose up --build -d
   ```

3. The development stack creates these demo accounts automatically:

   | Role | Username | Password |
   | --- | --- | --- |
   | Admin / Doctor | `clinic-admin` | `ClinicAdmin!2026` |
   | Attendant / Secretary | `clinic-attendant` | `ClinicAttendant!2026` |

   Sign in at <http://localhost:5174>. The development login page also has buttons to fill either account. Demo seeding runs only when `NODE_ENV=development` and `DEMO_LOGIN_ENABLED=true`; it does not reset or replace an existing account with the same username.

4. To create a different staff account, use the interactive command below. The password is entered without being echoed or passed in the command line:

   ```sh
   docker compose exec -it backend npm run user:create -- --username clinic-owner --full-name "Clinic Administrator" --role admin_doctor
   ```

   Create an attendant account using the same command with `--role attendant_secretary`, or use the doctor-only `POST /api/admin/users` endpoint.

Choose Doctor or Attendant on the role screen before entering credentials. The API checks the selected account type against the role stored for that username. Patient selection currently shows an unavailable notice because patient accounts are not connected to this workspace. API sessions use HTTP-only cookies stored in Redis. Passwords are hashed with bcrypt. User creation requires a password of at least 12 characters.

## Access rules

- Both roles can register patients, read the patient directory, edit primary patient details through the API, and record triage information.
- Only `admin_doctor` can read completed visit history, diagnoses, prescriptions, and the waiting queue; start or complete visits; create users; and delete patients.
- The API enforces these rules independently of frontend visibility. Attendant Socket.IO connections are rejected, and queue events are sent only to authenticated doctor sessions.

## Database upgrade behavior

The PostgreSQL entrypoint runs `db/init.sql` only for a new volume. On backend startup, the schema initializer detects the previous demo schema and renames its tables to `*_legacy` before creating the visit-based schema. It does not drop those old tables or their data.

## Deployment status

This is not ready for production deployment yet. The existing visit-note and prescription screens still have demo-only in-memory write paths, and the new queue endpoints are not yet wired to the React queue UI. Production also needs a clinic-specific HTTPS setup, `COOKIE_SECURE=true`, verified backups, audit logging, and an operational account recovery process.

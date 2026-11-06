-- Initial schema for the internal clinic application.
-- Docker runs this file only when it creates a new, empty PostgreSQL volume.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin_doctor', 'attendant_secretary');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE allergy_status AS ENUM ('unknown', 'none', 'known');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE IF NOT EXISTS patient_number_seq START WITH 10501;

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_number TEXT NOT NULL UNIQUE DEFAULT ('PT-' || lpad(nextval('patient_number_seq')::text, 5, '0')),
    full_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    sex TEXT NOT NULL CHECK (sex IN ('Female', 'Male', 'Intersex', 'Other', 'Unknown', 'Prefer not to say')),
    contact_number TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    allergy_status allergy_status NOT NULL DEFAULT 'unknown',
    allergies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT patients_allergy_status_matches_details CHECK (
        (allergy_status = 'known' AND cardinality(allergies) > 0)
        OR (allergy_status IN ('none', 'unknown') AND cardinality(allergies) = 0)
    )
);

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    clinician_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT appointments_valid_status CHECK (
        status IN ('scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')
    ),
    CONSTRAINT appointments_positive_duration CHECK (end_time > start_time),
    CONSTRAINT appointments_no_clinician_overlap EXCLUDE USING gist (
        clinician_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'confirmed', 'checked_in'))
);

-- One visit represents the complete attendant-to-doctor encounter.
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    appointment_id UUID UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
    attendant_id UUID REFERENCES users(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'in_triage',

    -- Attendant / triage phase
    blood_pressure TEXT NOT NULL DEFAULT '',
    weight_kg NUMERIC(6, 2),
    temperature_c NUMERIC(4, 1),
    chief_complaint TEXT NOT NULL DEFAULT '',
    initial_notes TEXT NOT NULL DEFAULT '',

    -- Doctor / consultation phase
    diagnosis TEXT NOT NULL DEFAULT '',
    medical_notes TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    queued_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT visits_valid_status CHECK (
        status IN ('in_triage', 'waiting', 'in_progress', 'completed', 'cancelled')
    ),
    CONSTRAINT visits_positive_weight CHECK (weight_kg IS NULL OR weight_kg > 0),
    CONSTRAINT visits_valid_temperature CHECK (temperature_c IS NULL OR temperature_c BETWEEN 25 AND 45),
    CONSTRAINT visits_queue_timestamp CHECK (status NOT IN ('waiting', 'in_progress', 'completed') OR queued_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    medications JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    prescribed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT prescriptions_medications_is_array CHECK (jsonb_typeof(medications) = 'array')
);

-- Doctor-facing timeline source: each completed visit and its prescriptions.
-- API authorization must restrict this view to admin_doctor users.
CREATE OR REPLACE VIEW completed_visit_history AS
SELECT
    v.id AS visit_id,
    v.patient_id,
    v.completed_at AS visit_date,
    v.blood_pressure,
    v.weight_kg,
    v.temperature_c,
    v.chief_complaint,
    v.initial_notes,
    v.diagnosis,
    v.medical_notes,
    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'doctor_id', p.doctor_id,
                'medications', p.medications,
                'notes', p.notes,
                'prescribed_at', p.prescribed_at
            ) ORDER BY p.prescribed_at
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'::jsonb
    ) AS prescriptions
FROM visits AS v
LEFT JOIN prescriptions AS p ON p.visit_id = v.id
WHERE v.status = 'completed'
GROUP BY v.id;

CREATE INDEX IF NOT EXISTS patients_name_idx ON patients (lower(full_name));
CREATE INDEX IF NOT EXISTS visits_patient_timeline_idx ON visits (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS visits_waiting_queue_idx ON visits (queued_at ASC) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS visits_status_created_idx ON visits (status, created_at ASC);
CREATE INDEX IF NOT EXISTS prescriptions_visit_date_idx ON prescriptions (visit_id, prescribed_at DESC);
CREATE INDEX IF NOT EXISTS appointments_patient_start_idx ON appointments (patient_id, start_time);
CREATE INDEX IF NOT EXISTS appointments_clinician_start_idx ON appointments (clinician_id, start_time);

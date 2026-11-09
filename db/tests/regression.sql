-- Run against an isolated PostgreSQL 16 database initialized with db/init.sql:
-- psql -v ON_ERROR_STOP=1 -f db/tests/regression.sql
-- Fixtures and helper functions are rolled back, including on a failed assertion.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL TIME ZONE 'UTC';

CREATE TEMP TABLE regression_results (name TEXT PRIMARY KEY);

CREATE FUNCTION pg_temp.assert_true(actual BOOLEAN, test_name TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF actual IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'FAIL: %', test_name;
    END IF;
    INSERT INTO regression_results VALUES (test_name);
END;
$$;

CREATE FUNCTION pg_temp.expect_error(statement TEXT, expected_state TEXT, test_name TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    actual_state TEXT;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    END;
    IF actual_state IS DISTINCT FROM expected_state THEN
        RAISE EXCEPTION 'FAIL: % (expected SQLSTATE %, received %)',
            test_name, expected_state, COALESCE(actual_state, 'no error');
    END IF;
    INSERT INTO regression_results VALUES (test_name);
END;
$$;

INSERT INTO users (id, username, full_name, password_hash, role) VALUES
    ('10000000-0000-0000-0000-000000000001', '__regression_doctor__', 'Example Doctor', 'synthetic-not-a-password', 'admin_doctor'),
    ('10000000-0000-0000-0000-000000000002', '__regression_other_doctor__', 'Other Doctor', 'synthetic-not-a-password', 'admin_doctor'),
    ('10000000-0000-0000-0000-000000000003', '__regression_attendant__', 'Example Attendant', 'synthetic-not-a-password', 'attendant_secretary');

INSERT INTO patients (id, patient_number, full_name, date_of_birth, sex) VALUES
    ('20000000-0000-0000-0000-000000000001', '__REGRESSION_PT_1__', 'Example Patient', '1990-01-01', 'Female'),
    ('20000000-0000-0000-0000-000000000002', '__REGRESSION_PT_2__', 'Other Patient', '1985-06-15', 'Male');

SELECT pg_temp.assert_true(
    (SELECT is_active AND created_at IS NOT NULL AND updated_at IS NOT NULL
     FROM users WHERE username = '__regression_doctor__'),
    'user defaults include active status and timestamps');
SELECT pg_temp.expect_error($sql$
    INSERT INTO users (username, full_name, password_hash, role)
    VALUES ('__regression_doctor__', 'Duplicate', 'synthetic', 'admin_doctor')
$sql$, '23505', 'usernames are unique');
SELECT pg_temp.expect_error($sql$
    INSERT INTO users (username, full_name, password_hash, role)
    VALUES ('__regression_invalid_role__', 'Invalid', 'synthetic', 'patient')
$sql$, '22P02', 'unsupported user roles are rejected');

SELECT pg_temp.assert_true(
    (SELECT allergy_status = 'unknown' AND allergies = ARRAY[]::TEXT[]
     FROM patients WHERE patient_number = '__REGRESSION_PT_1__'),
    'unassessed allergies default to unknown rather than none');
SELECT pg_temp.expect_error($sql$
    INSERT INTO patients (patient_number, full_name, date_of_birth, sex)
    VALUES ('__REGRESSION_PT_1__', 'Duplicate', '1990-01-01', 'Female')
$sql$, '23505', 'patient numbers are unique');
SELECT pg_temp.expect_error($sql$
    UPDATE patients SET sex = 'invalid'
    WHERE patient_number = '__REGRESSION_PT_1__'
$sql$, '23514', 'unsupported sex values are rejected');
SELECT pg_temp.expect_error($sql$
    UPDATE patients SET allergy_status = 'known', allergies = ARRAY[]::TEXT[]
    WHERE patient_number = '__REGRESSION_PT_1__'
$sql$, '23514', 'known allergies require details');
SELECT pg_temp.expect_error($sql$
    UPDATE patients SET allergy_status = 'none', allergies = ARRAY['Example allergen']
    WHERE patient_number = '__REGRESSION_PT_1__'
$sql$, '23514', 'no-known-allergies cannot include allergen details');
SELECT pg_temp.expect_error($sql$
    UPDATE patients SET allergy_status = 'unknown', allergies = ARRAY['Example allergen']
    WHERE patient_number = '__REGRESSION_PT_1__'
$sql$, '23514', 'unknown allergies cannot include allergen details');
UPDATE patients SET allergy_status = 'known', allergies = ARRAY['Example allergen']
WHERE patient_number = '__REGRESSION_PT_1__';
SELECT pg_temp.assert_true(
    (SELECT allergies = ARRAY['Example allergen'] FROM patients WHERE patient_number = '__REGRESSION_PT_1__'),
    'known allergy details are retained');

INSERT INTO appointments (id, patient_id, clinician_id, start_time, end_time, created_by) VALUES
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01 09:00Z', '2026-01-01 09:30Z', '10000000-0000-0000-0000-000000000003');
SELECT pg_temp.assert_true(
    (SELECT status = 'scheduled' FROM appointments WHERE id = '30000000-0000-0000-0000-000000000001'),
    'appointments default to scheduled');
SELECT pg_temp.expect_error($sql$
    INSERT INTO appointments (patient_id, clinician_id, start_time, end_time)
    VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01 09:15Z', '2026-01-01 09:45Z')
$sql$, '23P01', 'overlapping appointments for one clinician are rejected');
SELECT pg_temp.expect_error($sql$
    INSERT INTO appointments (patient_id, clinician_id, start_time, end_time)
    VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01 08:00Z', '2026-01-01 10:00Z')
$sql$, '23P01', 'appointments enclosing another booking are rejected');
SELECT pg_temp.expect_error($sql$
    INSERT INTO appointments (patient_id, clinician_id, start_time, end_time)
    VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01 08:00Z', '2026-01-01 08:00Z')
$sql$, '23514', 'zero-duration appointments are rejected');
SELECT pg_temp.expect_error($sql$
    INSERT INTO appointments (patient_id, clinician_id, start_time, end_time)
    VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01 08:00Z', '2026-01-01 07:59Z')
$sql$, '23514', 'negative-duration appointments are rejected');
SELECT pg_temp.expect_error($sql$
    UPDATE appointments SET status = 'invalid' WHERE id = '30000000-0000-0000-0000-000000000001'
$sql$, '23514', 'unsupported appointment statuses are rejected');
SELECT pg_temp.expect_error($sql$
    INSERT INTO appointments (patient_id, clinician_id, start_time, end_time)
    VALUES ('20000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', '2026-01-01 07:00Z', '2026-01-01 07:30Z')
$sql$, '23503', 'appointments require an existing patient');
SELECT pg_temp.expect_error($sql$
    INSERT INTO appointments (patient_id, clinician_id, start_time, end_time)
    VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000099', '2026-01-01 07:00Z', '2026-01-01 07:30Z')
$sql$, '23503', 'appointments require an existing clinician');

-- Half-open intervals allow an appointment to begin when the previous one ends.
INSERT INTO appointments (id, patient_id, clinician_id, start_time, end_time, status) VALUES
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2026-01-01 09:30Z', '2026-01-01 10:00Z', 'confirmed'),
    ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2026-01-01 09:00Z', '2026-01-01 09:30Z', 'checked_in'),
    ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01 09:00Z', '2026-01-01 09:30Z', 'cancelled'),
    ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01 09:00Z', '2026-01-01 09:30Z', 'completed'),
    ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01 09:00Z', '2026-01-01 09:30Z', 'no_show');
SELECT pg_temp.assert_true(
    (SELECT count(*) = 6 FROM appointments WHERE id::TEXT LIKE '30000000-0000-0000-0000-%'),
    'adjacent slots, different clinicians, and inactive appointments may overlap');
SELECT pg_temp.expect_error($sql$
    UPDATE appointments SET status = 'scheduled' WHERE id = '30000000-0000-0000-0000-000000000004'
$sql$, '23P01', 'reactivating a conflicting cancelled appointment is rejected');
SELECT pg_temp.expect_error($sql$
    UPDATE appointments SET start_time = '2026-01-01 09:29Z' WHERE id = '30000000-0000-0000-0000-000000000002'
$sql$, '23P01', 'moving a booking into an occupied slot is rejected');

INSERT INTO visits (id, patient_id, appointment_id, attendant_id, doctor_id) VALUES
    ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001'),
    ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', NULL, '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_true(
    (SELECT status = 'in_triage' AND appointment_id IS NULL FROM visits WHERE id = '40000000-0000-0000-0000-000000000002'),
    'walk-ins can enter triage without an appointment');
SELECT pg_temp.expect_error($sql$
    INSERT INTO visits (patient_id, appointment_id)
    VALUES ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001')
$sql$, '23505', 'one appointment cannot create multiple visits');
SELECT pg_temp.expect_error($sql$
    INSERT INTO visits (patient_id, appointment_id)
    VALUES ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002')
$sql$, '23503', 'visits cannot use another patient appointment');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET status = 'invalid' WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'unsupported visit statuses are rejected');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET weight_kg = 0 WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'zero body weight is rejected');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET weight_kg = -1 WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'negative body weight is rejected');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET temperature_c = 24.9 WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'temperature below supported range is rejected');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET temperature_c = 45.1 WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'temperature above supported range is rejected');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET status = 'waiting' WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'waiting visits require a queue timestamp');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET status = 'in_progress', queued_at = '2026-01-01 09:00Z'
    WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'consultations require a start timestamp');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET status = 'completed', queued_at = '2026-01-01 09:00Z', started_at = '2026-01-01 09:05Z'
    WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'completed visits require a completion timestamp');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET status = 'in_progress', queued_at = '2026-01-01 09:00Z', started_at = '2026-01-01 08:59Z'
    WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'consultation cannot start before queueing');
SELECT pg_temp.expect_error($sql$
    UPDATE visits SET status = 'completed', queued_at = '2026-01-01 09:00Z', started_at = '2026-01-01 09:05Z', completed_at = '2026-01-01 09:04Z'
    WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23514', 'completion cannot precede consultation start');

UPDATE visits SET status = 'waiting', queued_at = '2026-01-01 09:00Z', weight_kg = 60, temperature_c = 37,
    chief_complaint = 'Synthetic example complaint', initial_notes = 'Synthetic triage note'
WHERE id = '40000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(
    NOT EXISTS (SELECT 1 FROM completed_visit_history WHERE visit_id = '40000000-0000-0000-0000-000000000001'),
    'active visits are excluded from completed history');
UPDATE visits SET status = 'in_progress', started_at = '2026-01-01 09:05Z'
WHERE id = '40000000-0000-0000-0000-000000000001';

SELECT pg_temp.expect_error($sql$
    INSERT INTO prescriptions (visit_id, doctor_id, medications)
    VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{"name":"Example"}')
$sql$, '23514', 'prescription medications must be an array');
SELECT pg_temp.expect_error($sql$
    INSERT INTO prescriptions (visit_id, doctor_id, medications)
    VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'null')
$sql$, '23514', 'JSON null is not a medication array');
SELECT pg_temp.expect_error($sql$
    INSERT INTO prescriptions (visit_id, doctor_id)
    VALUES ('40000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001')
$sql$, '23503', 'prescriptions require an existing visit');
INSERT INTO prescriptions (id, visit_id, doctor_id, medications, notes, prescribed_at) VALUES
    ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '[{"medication":"Example B","instructions":"Synthetic directions"}]', 'Second note', '2026-01-01 09:15Z'),
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '[{"medication":"Example A","instructions":"Synthetic directions"}]', 'First note', '2026-01-01 09:10Z');

UPDATE visits SET status = 'completed', completed_at = '2026-01-01 09:20Z', diagnosis = 'Synthetic diagnosis', medical_notes = 'Synthetic consultation note'
WHERE id = '40000000-0000-0000-0000-000000000001';
UPDATE visits SET status = 'completed', queued_at = '2026-01-01 10:00Z', started_at = '2026-01-01 10:05Z', completed_at = '2026-01-01 10:20Z'
WHERE id = '40000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true(
    (SELECT visit_date = '2026-01-01 09:20Z'::TIMESTAMPTZ
        AND chief_complaint = 'Synthetic example complaint'
        AND initial_notes = 'Synthetic triage note'
        AND diagnosis = 'Synthetic diagnosis'
        AND medical_notes = 'Synthetic consultation note'
        AND weight_kg = 60 AND temperature_c = 37
     FROM completed_visit_history WHERE visit_id = '40000000-0000-0000-0000-000000000001'),
    'completed history retains triage, consultation and completion time');
SELECT pg_temp.assert_true(
    (SELECT jsonb_array_length(prescriptions) = 2
        AND prescriptions->0->>'id' = '50000000-0000-0000-0000-000000000001'
        AND prescriptions->1->>'id' = '50000000-0000-0000-0000-000000000002'
        AND prescriptions->0->>'notes' = 'First note'
        AND prescriptions->0->'medications'->0->>'medication' = 'Example A'
     FROM completed_visit_history WHERE visit_id = '40000000-0000-0000-0000-000000000001'),
    'history aggregates prescriptions once in prescribed order with their contents');
SELECT pg_temp.assert_true(
    (SELECT prescriptions = '[]'::JSONB FROM completed_visit_history WHERE visit_id = '40000000-0000-0000-0000-000000000002'),
    'completed visits without prescriptions return an empty array');
SELECT pg_temp.expect_error($sql$
    DELETE FROM patients WHERE id = '20000000-0000-0000-0000-000000000001'
$sql$, '23503', 'patients with clinical records cannot be deleted');
SELECT pg_temp.expect_error($sql$
    DELETE FROM visits WHERE id = '40000000-0000-0000-0000-000000000001'
$sql$, '23503', 'visits with prescriptions cannot be deleted');
SELECT pg_temp.expect_error($sql$
    UPDATE appointments SET patient_id = '20000000-0000-0000-0000-000000000002'
    WHERE id = '30000000-0000-0000-0000-000000000001'
$sql$, '23503', 'bookings with a visit cannot be reassigned to another patient');
DELETE FROM appointments WHERE id = '30000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(
    (SELECT appointment_id IS NULL AND patient_id = '20000000-0000-0000-0000-000000000001'
     FROM visits WHERE id = '40000000-0000-0000-0000-000000000001'),
    'removing an appointment retains the visit and its patient');

SELECT name AS passed FROM regression_results ORDER BY name;
SELECT count(*) AS passed_database_checks FROM regression_results;
ROLLBACK;

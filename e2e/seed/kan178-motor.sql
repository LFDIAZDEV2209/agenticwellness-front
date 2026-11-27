\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
    IF current_database() NOT LIKE 'copp_review_kan178%' THEN
        RAISE EXCEPTION 'KAN-178 requiere una base desechable copp_review_kan178*';
    END IF;
    IF NOT EXISTS (SELECT FROM app.patient_profiles WHERE email = 'patient-kan178-motor@example.test') THEN
        RAISE EXCEPTION 'Falta el tercer paciente sintético (Motor 365)';
    END IF;
END $$;

UPDATE app.patient_profiles SET date_of_birth = DATE '1990-01-01'
WHERE email = 'patient-kan178-motor@example.test';

INSERT INTO auth."PaidActivations" ("PaymentId", "Email", "Plan", "Language", "ConfirmedAt",
  "LastEmailRequestedAt", "EmailRevision", "EmailAttempts", "RedeemedAt", "LinkedUserId", "MembershipExpiresAt")
SELECT '17800000-0000-4000-8000-000000000004', email, 'annual', 'es', now(), now(), 0, 0, now(), user_id, now() + INTERVAL '1 year'
FROM app.patient_profiles WHERE email = 'patient-kan178-motor@example.test';

INSERT INTO app.person (patient_id, sex, birth_year, height_cm, initial_weight_kg, initial_waist_cm,
  target_weight_kg, activity_level, goal, pace, vegetarian, lactose_free, fitness_level, start_date, engine_ver, plan_version)
SELECT id, 'Female', 1990, 170, 80, 85, 70, 2, 'LoseWeight', 'Moderate', false, false, 0,
  (now() AT TIME ZONE timezone)::date, '5.2', 1
FROM app.patient_profiles WHERE email = 'patient-kan178-motor@example.test';

INSERT INTO app.screening (person_id, submission_id, par_q_1, par_q_2, par_q_3, par_q_4,
  par_q_5, par_q_6, par_q_7, nqs_1, nqs_2, nqs_3, nqs_4, nqs_5, nqs_6)
SELECT id, '17800000-0000-4000-8000-000000000005', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
FROM app.patient_profiles WHERE email = 'patient-kan178-motor@example.test';

INSERT INTO app.consent (person_id, acceptance_id)
SELECT p.id, a.id FROM app.patient_profiles p JOIN app.legal_document_acceptances a ON a.user_id = p.user_id
WHERE p.email = 'patient-kan178-motor@example.test' AND a.scope IN ('paid-demo-terms-es', 'paid-demo-privacy-es');

COMMIT;

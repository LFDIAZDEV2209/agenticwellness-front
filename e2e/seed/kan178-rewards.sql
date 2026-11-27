\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
    IF current_database() NOT LIKE 'copp_review_kan178%' THEN
        RAISE EXCEPTION 'KAN-178 requiere una base desechable copp_review_kan178*';
    END IF;
END $$;

INSERT INTO app.program_templates (id, code, name, total_weeks, status, streak_min_tasks)
VALUES ('17800000-0000-4000-8000-000000000001', 'kan178-fixture', 'Ejercicio QA KAN-178', 2, 'Active', 2);

INSERT INTO app.weekly_day_templates (template_id, weekday, task_code, points, sort_order)
SELECT '17800000-0000-4000-8000-000000000001', weekday, 'ejercicio', 17, 1
FROM generate_series(1, 7) AS days(weekday);

-- El snapshot legado aún tiene podcast programado. Tras el corte no otorga XP.
INSERT INTO app.weekly_day_templates (template_id, weekday, task_code, points, sort_order)
SELECT '17800000-0000-4000-8000-000000000001', weekday, 'podcast', 23, 2
FROM generate_series(1, 7) AS days(weekday);

INSERT INTO app.xp_rules (code, name, category, base_xp, multiplier, requires_validation, active, valid_from)
VALUES ('TASK_EJERCICIO', 'Ejercicio QA KAN-178', 'adherence', 17, 1, false, true, '2020-01-01');

-- Historial anterior al corte con nivel 7. El flujo actual crea otra inscripción;
-- ambos libros deben seguir visibles sin volver a sumar un balance acumulado.
INSERT INTO app.program_enrollments (id, patient_id, template_id, status, start_local_date, completed_at)
SELECT '17800000-0000-4000-8000-000000000002', id, '17800000-0000-4000-8000-000000000001',
       'Completed', '2025-01-01', '2025-02-01T00:00:00Z'
FROM app.patient_profiles WHERE email = 'patient-kan178@example.test';

INSERT INTO app.xp_ledger (id, enrollment_id, amount, reason, balance_after, awarded_at)
SELECT '17800000-0000-4000-8000-000000000003', id, 12000, 'TaskCompletion', 12000, '2025-01-01T12:00:00Z'
FROM app.program_enrollments WHERE id = '17800000-0000-4000-8000-000000000002';

COMMIT;

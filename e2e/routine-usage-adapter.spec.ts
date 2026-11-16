import { expect, test } from "@playwright/test";
import { parseRoutineUsage } from "../features/wellness/services/exercise-routines-service";

const id = "00000000-0000-4000-8000-000000000851";
const valid = { routineId: id, patientCount: 2, enrollmentCount: 3, activeWeekCount: 4 };
test("2.22 · adaptador conserva los tres conteos y no confunde semanas con pacientes", () => {
  expect(parseRoutineUsage(valid, id)).toEqual(valid);
  expect(parseRoutineUsage({ ...valid, patientCount: 0, enrollmentCount: 0, activeWeekCount: 0 }, id).patientCount).toBe(0);
  expect(parseRoutineUsage({ ...valid, ignoredPatientId: "NO-EXPOSE" }, id)).not.toHaveProperty("ignoredPatientId");
});
for (const value of [undefined, null, [], {}, { ...valid, routineId: "otra-rutina" },
  ...["patientCount", "enrollmentCount", "activeWeekCount"].flatMap(field => [-1, 1.5, "3", null, Number.MAX_SAFE_INTEGER + 1].map(v => ({ ...valid, [field]: v })))]) {
  test(`2.22 · adaptador rechaza ${JSON.stringify(value)}`, () => {
    expect(() => parseRoutineUsage(value, id)).toThrow("ROUTINE_USAGE_INVALID");
  });
}

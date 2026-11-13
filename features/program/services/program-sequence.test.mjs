import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("./program-sequence.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const api = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const ids = Array.from({ length: 42 }, (_, index) => `podcast-${index + 1}`);
const row = (fields = {}) => ({
  id: "row",
  weekday: 1,
  taskCode: "podcast",
  mediaId: ids[0],
  points: 90,
  sortOrder: 3,
  createdAt: "2026-11-13",
  ...fields,
});

test("lectura específica sobre genérica; una celda vacía no recupera el podcast genérico", () => {
  const sequence = api.resolvePodcastSequence([
    row(),
    row({ weekNumber: 2, mediaId: ids[1] }),
    row({ weekNumber: 3, mediaId: null }),
  ]);
  assert.equal(sequence.length, 83);
  assert.equal(sequence[0], ids[0]);
  assert.equal(sequence[7], ids[1]);
  assert.equal(sequence[14], null);
});

test("42 episodios cubren 83 días, repiten 41 y nunca antes de 42 días", () => {
  const sequence = api.autocompletePodcasts(Array(83).fill(null), ids, true);
  assert.equal(sequence[41], ids[41]);
  assert.equal(sequence[42], ids[0]);
  assert.equal(sequence[82], ids[40]);
  assert.deepEqual(api.sequenceStats(sequence, new Set(ids)), {
    gaps: 0,
    assigned: 83,
    repeats: 41,
  });
  for (let day = 0; day < 83; day++)
    assert.ok(
      !sequence.slice(Math.max(0, day - 41), day).includes(sequence[day]),
    );
});

test("autocompleta huecos sin cambiar asignaciones; más episodios reducen repeticiones", () => {
  const sequence = api.autocompletePodcasts(Array(83).fill(null), ids, true);
  const holes = [...sequence];
  holes[23] = null;
  holes[59] = null;
  assert.deepEqual(api.autocompletePodcasts(holes, ids), sequence);
  const many = Array.from({ length: 83 }, (_, index) => String(index));
  assert.equal(
    api.sequenceStats(
      api.autocompletePodcasts(holes, many, true),
      new Set(many),
    ).repeats,
    0,
  );
  assert.equal(api.autocompletePodcasts(holes, ids.slice(0, 41), true), null);
  holes[1] = holes[0];
  assert.equal(api.autocompletePodcasts(holes, ids), null);
});

test("intercambio afecta solo las semanas necesarias; el día 84 nunca se modifica", () => {
  const sequence = api.autocompletePodcasts(Array(83).fill(null), ids, true);
  const swapped = api.swapPodcastDays(sequence, 0, 82);
  assert.equal(swapped[82], sequence[0]);
  assert.deepEqual(api.changedSequenceWeeks(sequence, swapped), [1, 12]);
  assert.equal(api.swapPodcastDays(sequence, 0, 83), sequence);
});

test("payload por semana solo podcast y seis días en la última; conserva puntos y otras clases", () => {
  const rows = [
    row(),
    row({
      id: "routine",
      weekNumber: 12,
      taskCode: "ejercicio",
      routineId: "routine-id",
      mediaId: null,
    }),
  ];
  const sequence = Array(83).fill(null);
  const payload = api.podcastWeekPayload(rows, sequence, 12);
  assert.equal(payload.length, 6);
  assert.equal(payload[0].points, 90);
  assert.ok(
    payload.every((row) => row.taskCode === "podcast" && row.weekday < 7),
  );
  const merged = api.mergeSequenceWeek(
    rows,
    [
      rows[1],
      ...payload.map((item, index) => row({ ...item, id: String(index) })),
    ],
    12,
  );
  assert.equal(
    merged.find((item) => item.id === "routine").routineId,
    "routine-id",
  );
  assert.ok(merged.some((item) => item.weekNumber == null));
  assert.throws(() => api.podcastWeekPayload(rows, sequence, 13));
});

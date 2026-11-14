import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// La comprobación de tipos la hace el build de Next; aquí se prueba la cola sin navegador ni HTTP.
const source = await readFile(
  new URL("./media-bulk-queue.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const queue = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

function fixture() {
  let rows = queue.createMediaBulkRows(
    Array.from(
      { length: 5 },
      (_, index) =>
        new File(["audio"], `episodio_${index + 1}.mp3`, {
          type: "audio/mpeg",
        }),
    ),
  );
  return {
    get rows() {
      return rows;
    },
    apply(row) {
      rows = rows.map((previous) =>
        previous.key === row.key ? row : previous,
      );
    },
  };
}

const fallback = "Respuesta inválida";

test("valida archivos al entrar y permite recuperar un duplicado al quitar el primero", () => {
  const audio = new File(["audio"], "igual.wav", { type: "audio/wav" });
  const rows = queue.createMediaBulkRows([audio, audio, new File(["nota"], "notas.txt", { type: "text/plain" })]);
  assert.equal(rows[0].validationError, null);
  assert.equal(rows[1].validationError, "Archivo duplicado en este lote.");
  assert.equal(rows[2].validationError, "Selecciona archivos de audio para la biblioteca de podcasts.");
  const recovered = queue.validateMediaBulkFiles(rows.slice(1));
  assert.equal(recovered[0].validationError, null);
  assert.equal(recovered[0].state, "pendiente");
});

test("tamaño, vacío y metadatos obligatorios bloquean filas antes de subir", () => {
  const row = fixture().rows[0];
  const huge = queue.validateMediaBulkFiles([{ ...row, file: { name: "grande.wav", size: 200 * 1024 * 1024 + 1, type: "audio/wav" } }])[0];
  assert.equal(queue.mediaBulkRowIssue(huge), "El archivo supera 200 MB.");
  const empty = queue.createMediaBulkRows([new File([], "vacio.wav", { type: "audio/wav" })])[0];
  assert.equal(queue.mediaBulkRowIssue(empty), "El archivo está vacío.");
  assert.equal(queue.mediaBulkRowIssue(row), "El autor es obligatorio.");
  assert.equal(queue.mediaBulkRowIssue({ ...row, author: "Equipo QA" }), "Elige una categoría.");
  assert.equal(queue.mediaBulkRowIssue({ ...row, author: "Equipo QA", categoryChosen: true }), null);
});
const signal = () => new AbortController().signal;

test("resultado parcial y reintento: solo se registra el archivo fallido", async () => {
  const state = fixture();
  const calls = [];
  const run = (fail) =>
    queue.runMediaBulkBatches(
      queue.mediaBulkDraftCandidates(state.rows),
      async (batch) => {
        calls.push(batch.map((row) => row.file.name));
        return queue.applyMediaBulkResults(
          batch,
          batch.map((row, index) => ({
            nombre: row.file.name,
            estado: fail && index === 4 ? "error" : "borrador",
            ...(fail && index === 4
              ? { error: "Error simulado" }
              : { mediaId: `id-${row.file.name}` }),
          })),
          fallback,
        );
      },
      state.apply,
      signal(),
      fallback,
    );
  await run(true);
  assert.equal(state.rows.filter((row) => row.state === "borrador").length, 4);
  assert.equal(queue.mediaBulkResult(state.rows[4]).error, "Error simulado");
  await run(false);
  assert.deepEqual(
    calls.map((batch) => batch.length),
    [5, 1],
  );
  assert.equal(calls[1][0], "episodio_5.mp3");
});

test("publicación fallida conserva id y excluye los resultados correctos", () => {
  const state = fixture();
  const rows = state.rows.map((row, index) => ({
    ...row,
    mediaId: `id-${index}`,
    state: "borrador",
  }));
  const result = queue.applyMediaBulkResults(
    rows,
    rows.map((row, index) => ({
      nombre: row.file.name,
      estado: index === 2 ? "error" : "publicado",
      ...(index === 2 ? { error: "Reintenta" } : { mediaId: row.mediaId }),
    })),
    fallback,
  );
  assert.equal(queue.mediaBulkDraftCandidates(result).length, 0);
  assert.deepEqual(
    queue.mediaBulkPublishCandidates(result).map((row) => row.mediaId),
    ["id-2"],
  );
});

test("100 filas por petición: un fallo HTTP no borra ids ni impide procesar el siguiente lote", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    ...fixture().rows[0],
    key: String(index),
    mediaId: `id-${index}`,
  }));
  const sizes = [];
  const results = [];
  await queue.runMediaBulkBatches(
    rows,
    async (batch) => {
      sizes.push(batch.length);
      if (sizes.length === 1) throw new Error("Sin conexión");
      return batch.map((row) => ({ ...row, state: "publicado" }));
    },
    (row) => results.push(row),
    signal(),
    fallback,
  );
  assert.deepEqual(sizes, [100, 1]);
  assert.equal(results[0].mediaId, "id-0");
  assert.equal(results.filter((row) => row.state === "error").length, 100);
  assert.equal(results[100].state, "publicado");
});

test("nombres repetidos se correlacionan por posición y respuestas incompletas no crean falsos éxitos", () => {
  const rows = queue.createMediaBulkRows([
    new File(["a"], "igual.mp3"),
    new File(["b"], "igual.mp3"),
  ]);
  assert.notEqual(rows[0].key, rows[1].key);
  const result = queue.applyMediaBulkResults(
    rows,
    [
      { nombre: "igual.mp3", estado: "publicado", mediaId: "primero" },
      { nombre: "igual.mp3", estado: "borrador", mediaId: "segundo" },
    ],
    fallback,
  );
  assert.deepEqual(
    result.map((row) => row.mediaId),
    ["primero", "segundo"],
  );
  assert.equal(result[0].state, "publicado");
  for (const response of [
    [],
    [{ nombre: "otro", estado: "borrador", mediaId: "incorrecto" }],
    [{ nombre: "igual.mp3", estado: "borrador" }],
  ]) {
    assert.equal(
      queue.applyMediaBulkResults(rows, response, fallback)[0].state,
      "error",
    );
  }
});

test("cancelar evita procesar el siguiente bloque y aplicar respuestas tardías", async () => {
  const controller = new AbortController();
  let applied = false;
  await assert.rejects(
    queue.runMediaBulkBatches(
      fixture().rows,
      async (batch) => {
        controller.abort();
        return batch;
      },
      () => {
        applied = true;
      },
      controller.signal,
      fallback,
    ),
    { name: "AbortError" },
  );
  assert.equal(applied, false);
});

test("deriva título y permite guardar borradores editados sin repetir los que no cambiaron", () => {
  assert.equal(
    queue.mediaTitleFromFilename("Mi_podcast-final.mp3"),
    "Mi podcast final",
  );
  const row = fixture().rows[0];
  assert.equal(queue.mediaBulkResult(row), null);
  assert.equal(
    queue.mediaBulkDraftCandidates([
      { ...row, mediaId: "id", state: "borrador", dirty: false },
    ]).length,
    0,
  );
  assert.equal(
    queue.mediaBulkDraftCandidates([
      { ...row, mediaId: "id", state: "borrador", dirty: true },
    ]).length,
    1,
  );
});

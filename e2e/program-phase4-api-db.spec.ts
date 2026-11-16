import { test, expect, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readQaPassword } from "./helpers/nutrition-real-credentials.mjs";

const workspace = process.env.COP_WORKSPACE_ROOT ?? path.resolve(__dirname, "../../..");
const metadata = path.join(workspace, ".ai/operations/organizar-experiencia-bienestar/4.11-back-fixture.json");
const fixture = JSON.parse(readFileSync(metadata, "utf8"));
const fixtureFileHash = createHash("sha256").update(readFileSync(metadata)).digest("hex");
const evidence = process.env.COP_411_EVIDENCE ?? path.join(workspace,
  "openspec/changes/organizar-experiencia-bienestar/revision-4.11", new Date().toISOString().replace(/[:.]/g, "-"));
const bridge = path.join(__dirname, "helpers/program-phase4-db.py");
const traffic: { method: string; path: string; http: number; bodySha256: string }[] = [];
type Account = { login: string; credentialTarget: string; application: string; patientId?: string };
type Snapshot = {
  backendSha: string;
  state: {
    patient: {
      completedTests: number;
      enrollments: { id: string; status: string; current_week_number: number }[];
      nutrition: { id: string; is_published: boolean }[];
      recommendations: { nutritionPlan: { id: string }; exerciseRoutine: { id: string }; podcastSequence: { mediaId: string }[] }[];
    };
    unapplied: { weekEqualsBaseline: boolean; applicationAudits: number; weekSha256: string };
  };
  rows: Record<string, { count: number; sha256: string }>;
  protected: Record<string, unknown>;
  podcastCells: number;
  mainWeekStatuses: string[];
  podcasts: { id: string; status: string; blankKey: boolean; demo: boolean }[];
};
let baseline: Snapshot;
let patientApi: APIRequestContext;
let companionApi: APIRequestContext;
let erpApi: APIRequestContext;

function dbSnapshot(): Snapshot {
  return JSON.parse(execFileSync("python", [bridge, "snapshot"], {
    encoding: "utf8", timeout: 30_000, env: { ...process.env, COP_411_EVIDENCE: evidence },
  }));
}
function save(name: string, value: unknown) {
  writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + "\n");
}
async function call(api: APIRequestContext, method: "GET" | "POST", route: string, data?: unknown, expected = 200) {
  if (route.includes("/apply")) throw new Error("4.11 sin acción: está prohibido aplicar sugerencias en este guion.");
  const response = method === "GET"
    ? await api.get(fixture.apiBaseUrl + route)
    : await api.post(fixture.apiBaseUrl + route, { data });
  const raw = await response.body();
  traffic.push({ method, path: route, http: response.status(), bodySha256: createHash("sha256").update(raw).digest("hex") });
  save("traffic.json", traffic);
  expect(response.status(), `${method} ${route}`).toBe(expected);
  return { body: JSON.parse(raw.toString()), headers: response.headers() };
}

test.describe("4.11 · API/BD real; UI pendiente de rediseño", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    mkdirSync(evidence, { recursive: true });
    expect(fixture.owner).toBe("codex-back");
    expect(fixture.synthetic).toBe(true);
    expect(fixture.supportReady).toBe(true);
    for (const url of [fixture.apiBaseUrl, fixture.authBaseUrl]) {
      expect(new URL(url).hostname).toBe("127.0.0.1");
      expect(new URL(url).protocol).toBe("http:");
    }
    baseline = dbSnapshot();
    expect(baseline.backendSha).toBe(fixture.commit);
    save("before.json", baseline);
    async function login(account: Account) {
      const auth = await playwright.request.newContext();
      try {
        const response = await auth.post(fixture.authBaseUrl + "/api/auth/login", { data: {
          email: account.login, password: readQaPassword(account.credentialTarget),
          application: account.application, rememberMe: false,
        } });
        expect(response.status(), "Auth QA local").toBe(200);
        const session = await response.json();
        const token = session.accessToken ?? session.token;
        expect(typeof token).toBe("string");
        return await playwright.request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
      } finally { await auth.dispose(); }
    }
    patientApi = await login(fixture.accounts.patient);
    companionApi = await login(fixture.accounts.aiPatient);
    erpApi = await login(fixture.accounts.generator);
  });

  test.afterAll(async () => {
    try {
      if (baseline) {
        const after = dbSnapshot(); save("after.json", after);
        expect(after.protected).toEqual(baseline.protected);
        expect(after.rows).toEqual(baseline.rows);
        expect(createHash("sha256").update(readFileSync(metadata)).digest("hex")).toBe(fixtureFileHash);
      }
    } finally {
      await Promise.allSettled([patientApi?.dispose(), companionApi?.dispose(), erpApi?.dispose()]);
    }
  });

  test("9/9 tests: plan publicado y propuesta única de rutina/podcasts; replay no duplica", async () => {
    const assignments = (await call(patientApi, "GET", "/api/v1/health-tests/me/assignments?scope=initial")).body;
    expect(assignments.length).toBe(9);
    expect(assignments.every((a: { status: string; isRequired: boolean }) => a.status === "completed" && a.isRequired)).toBe(true);
    expect(assignments.every((a: { patientId: string }) => a.patientId === fixture.accounts.patient.patientId)).toBe(true);
    // BACK ya consumió 8→9. Reenvío con la misma clave; nunca resetear ni fingir un nuevo alta.
    const replay = (await call(patientApi, "POST", `/api/v1/health-tests/me/tests/${fixture.lastTest.assignmentId}/submit`, fixture.lastTest.submitPayload)).body;
    expect(replay.status).toBe("completed");
    expect(replay.id).toBe(fixture.finalEvaluationId);
    const state = dbSnapshot();
    expect(state.state.patient.completedTests).toBe(9);
    expect(state.state.patient.enrollments.length).toBe(1);
    expect(state.state.patient.enrollments[0].status).toBe("PendingAssignment");
    expect(state.state.patient.enrollments[0].current_week_number).toBe(0);
    expect(state.mainWeekStatuses.length).toBe(12);
    expect(state.mainWeekStatuses.every(s => s === "Locked")).toBe(true);
    expect(state.state.patient.recommendations.length).toBe(1);
    const proposal = state.state.patient.recommendations[0];
    expect(Boolean(proposal.nutritionPlan.id && proposal.exerciseRoutine.id)).toBe(true);
    expect(proposal.podcastSequence.length).toBe(7);
    expect(state.podcastCells).toBe(7);
    expect(state.podcasts.every(p => p.status === "Published" && !p.blankKey)).toBe(true);
    const plan = (await call(patientApi, "GET", "/api/v1/me/nutrition-plan")).body;
    expect(plan.days.length).toBe(30);
    expect(state.state.patient.nutrition.some(p => p.is_published)).toBe(true);
    await call(patientApi, "GET", "/api/v1/program/me/snapshot", undefined, 404);
    expect((await call(patientApi, "GET", "/api/v1/program/me/completion")).body.completion).toBeNull();
    expect(state.rows).toEqual(baseline.rows);
    save("post-tests.json", { passed: true, submission: "replay del último test ya completado por BACK", tests: 9,
      enrollments: 1, recommendations: 1, enrollmentStatus: "PendingAssignment", activeWeek: 0, planDays: 30,
      proposalRoutine: true, podcastCells: 7, demoReferences: fixture.podcasts.knownDemoReferences,
      storageBlobsVerified: false, blocker: "1.14", unchangedRows: true });
  });

  test("consultar una sugerencia draft no cambia semana, contenido, XP ni auditoría", async () => {
    const scenario = fixture.aiScenario;
    const weekBefore = (await call(erpApi, "GET", scenario.weekDetailPath)).body;
    let previousId: string | undefined;
    for (let read = 0; read < 2; read++) {
      const { body, headers } = await call(erpApi, "GET", scenario.suggestionsPath + "?language=es");
      expect(body.status).toBe("ok");
      expect(body.draft.id).toBe(scenario.briefId);
      expect(body.draft.model).toBe("postman-weekly-synthetic");
      expect(body.draft.suggestions.length).toBe(5);
      expect(body.draft.suggestions.every((s: { state: string; appliedAt: unknown; appliedBy: unknown }) =>
        s.state === "draft" && s.appliedAt === null && s.appliedBy === null)).toBe(true);
      expect(headers["cache-control"]).toContain("no-store");
      if (previousId) expect(body.draft.id).toBe(previousId);
      previousId = body.draft.id;
    }
    const weekAfter = (await call(erpApi, "GET", scenario.weekDetailPath)).body;
    // Hashes evitan volcar contenido clínico ante una aserción fallida.
    const hash = (body: unknown) => createHash("sha256").update(JSON.stringify(body)).digest("hex");
    expect(hash(weekAfter)).toBe(hash(weekBefore));
    const after = dbSnapshot();
    expect(after.state.unapplied.weekEqualsBaseline).toBe(true);
    expect(after.state.unapplied.applicationAudits).toBe(0);
    expect(after.rows).toEqual(baseline.rows);
    save("unapplied.json", { passed: true, source: scenario.generationSource, briefId: previousId,
      suggestions: 5, applied: 0, applyRequests: 0, generationRequests: 0, weekHashUnchanged: true, applicationAudits: 0 });
  });

  test("HTTP IA503: handlers F4 unavailable, DB intacta y API de producto navegable", async () => {
    const result = JSON.parse(execFileSync("python", [bridge, "outage"], {
      encoding: "utf8", timeout: 160_000, env: { ...process.env, COP_411_EVIDENCE: evidence },
    }));
    expect(result.summary).toBe("unavailable");
    expect(result.weekly).toBe("unavailable");
    expect(result.summaryHttpStatuses.length).toBeGreaterThan(0);
    expect(result.weeklyHttpStatuses.length).toBeGreaterThan(0);
    expect(result.databaseUnchanged).toBe(true);
    expect(result.noApplyCalled).toBe(true);
    expect((await call(patientApi, "GET", "/api/v1/me/nutrition-plan")).body.days.length).toBe(30);
    const snapshot = (await call(companionApi, "GET", "/api/v1/program/me/snapshot")).body;
    expect(snapshot.todayTasks.length).toBeGreaterThan(0);
    const healthy = (await call(erpApi, "GET", fixture.aiScenario.suggestionsPath)).body;
    expect(healthy.draft.id).toBe(fixture.aiScenario.briefId);
    expect(healthy.draft.suggestions.every((s: { state: string }) => s.state === "draft")).toBe(true);
    expect(dbSnapshot().rows).toEqual(baseline.rows);
    save("outage-verified.json", { ...result, passed: true, healthyProductReadsAfterFailure: true,
      sharedAiStopped: false, controllersWithInjectedFailureVerified: false, uiVerified: false });
  });

  test.fixme("UI APP: finalizar batería y mostrar pendiente clínico/plan sin inventar misiones activas", async () => {
    // Adaptar selectores y transiciones al rediseño cerrado, con fixture NUEVA 8/9.
    throw new Error("Pendiente de rediseño: no consumir/resetear la fixture BACK 9/9");
  });
  test.fixme("UI ERP: consultar/cancelar sugerencia conserva plan sin POST apply", async () => {
    throw new Error("Pendiente de adaptar Perfil360/editor y probar teclado/foco");
  });
  test.fixme("UI: omitir IA unavailable y conservar APP/Perfil360/editor manual navegables", async () => {
    // Solo envelopes IA en navegador propio; no interceptar programa, tests o nutrición.
    throw new Error("Pendiente de UI; inyección de envelope no acredita caída de proveedor en backend");
  });
});

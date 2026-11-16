import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, type APIRequestContext } from "@playwright/test";
import en from "../../providers/translations/en.json";

const root = process.env.COP_WORKSPACE_ROOT ?? path.resolve(__dirname, "../../../..");
export const evidence = path.resolve(__dirname, "../../qa-reports/publication-retirement-real");
export type Fixture = Record<string, string>;
export function translate(lang: string, source: string, params: Record<string, string> = {}) {
  let text = lang === "en" ? (en as Record<string, string>)[source] ?? source : source;
  for (const [key, value] of Object.entries(params)) text = text.replaceAll(`{${key}}`, value);
  return text;
}
export type State = { template: [string, number, string | null] | null;
  weeks: [string, number, string, { weekday: number; media_id: string; origin: string }[]][];
  references: [string, number | null, number, string][]; media: [string, string][] };
export function save(name: string, value: unknown) {
  mkdirSync(evidence, { recursive: true });
  writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + "\n", "utf8");
}
export function db(action: string, fixturePath?: string) {
  return JSON.parse(execFileSync("python", [path.join(__dirname, "program-publication-retirement-db.py"), action,
    ...(fixturePath ? [fixturePath] : [])], { encoding: "utf8", timeout: 30_000 }));
}
/** Lee la cuenta de desarrollo local solo en memoria; nunca adjunta auth/cookies a la evidencia. */
export async function login(page: Page) {
  const config = readFileSync(path.join(root, "coppAddresdBack/src/Services/CoppAddresd.Auth/appsettings.json"), "utf8");
  const field = (key: string) => {
    const value = config.match(new RegExp('"' + key + '"\\s*:\\s*"([^"\\r\\n]+)"'))?.[1];
    if (!value) throw new Error("Falta configuración Auth local");
    return value;
  };
  const response = await page.request.post("/api/auth/login", { data: {
    email: field("AdminEmail"), password: field("AdminPassword"), application: "erp", rememberMe: false,
  } });
  expect(response.status(), "Login Auth real a través de Next y gateway").toBe(200);
  const session = await response.json();
  const token = session.accessToken ?? session.token;
  expect(typeof token).toBe("string");
  return { Authorization: `Bearer ${token}` };
}
export async function prepare(mode: "122" | "123", page: Page) {
  const headers = await login(page);
  const preference = await page.request.get("/api/auth/me/preferences", { headers });
  expect(preference.status()).toBe(200);
  const lang = (await preference.json()).lang === "en" ? "en" : "es";
  await page.context().addCookies([{ name: "copp_lang", value: lang, url: "http://localhost:3000" }]);
  const fixturePath = path.join(evidence, mode + "-fixture.json");
  // Recuperación de una preparación interrumpida: solo IDs del manifiesto QA propio.
  if (existsSync(fixturePath)) {
    const previous: Fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const oldState: State = db("state", fixturePath);
    if (oldState.template || oldState.media.length) await cleanup(page.request, { fixture: previous, fixturePath, headers, before: oldState }, false);
  }
  const fixture: Fixture = db("seed" + mode);
  save(mode + "-fixture.json", fixture);
  const before: State = db("state", fixturePath);
  const qa = { fixture, fixturePath, headers, before, lang };
  save(mode + "-before.json", before);
  return qa;
}
export async function cleanup(api: APIRequestContext, qa: { fixture: Fixture; fixturePath: string; headers: { Authorization: string }; before: State }, logout = true) {
  const { fixture: f, fixturePath, headers } = qa;
  db("cleanup", fixturePath);
  const remaining: State = db("state", fixturePath);
  expect(remaining).toEqual({ template: null, weeks: [], references: [], media: [] });
  save(f.mode + "-cleanup.json", { cleaned: true, remaining });
  if (logout) await api.post("/api/auth/logout", { headers, data: { application: "erp" } });
}
/** Solo estados y rutas de negocio: no cuerpos clínicos, cabeceras, tokens ni URLs firmadas. */
export function observe(page: Page, mode: string) {
  const traffic: { method: string; path: string; status: number }[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  page.on("response", response => {
    const url = new URL(response.url());
    if (!/^\/api\/v1\/(program\/templates|media)/.test(url.pathname)) return;
    traffic.push({ method: response.request().method(), path: url.pathname + (url.searchParams.has("preview") ? "?preview=true" : ""), status: response.status() });
    save(mode + "-traffic.json", traffic);
  });
  return { traffic, errors };
}

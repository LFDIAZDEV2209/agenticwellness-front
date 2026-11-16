import { test, expect, type Page } from "@playwright/test";
import { agentId, linkedUserId, linkedPatientId, mockAgentsHttp } from "./agents-http";
import en from "../../../providers/translations/en.json";

const permissions = ["Agents.View", "Agents.Update", "Patients.View"];
async function selectPatient(page: Page, search = "Ana", name = "Ana Vinculada QA") {
  await page.getByRole("button", { name: "Buscar paciente para asignar", exact: true }).click();
  await page.getByRole("group", { name: "Asignar agente a un paciente" }).getByRole("combobox").fill(search);
  await page.getByRole("option", { name, exact: true }).click();
}

test("selecciona por búsqueda existente y asigna exactamente el userId vinculado, consultando antes y después", async ({ page }) => {
  const state = await mockAgentsHttp(page, false, { permissions, activeAgent: true });
  await page.goto(`/agents/${agentId}`);
  await selectPatient(page);
  const assign = page.getByRole("button", { name: "Asignar agente", exact: true });
  await expect(assign).toBeEnabled();
  const readsBeforeAssign = state.instanceReads.length;
  await assign.click();
  await expect(page.getByRole("status")).toContainText("Agente asignado a la cuenta vinculada del paciente.");
  await expect(assign).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toEqual({ path: "/api/v1/agents/instances", method: "POST", body: { userId: linkedUserId, agentTypeId: agentId, metadata: "{}" } });
  expect(state.writes[0].body.userId).not.toBe(linkedPatientId);
  // StrictMode puede duplicar la lectura inicial; el gesto añade preflight y refresh.
  await expect.poll(() => state.instanceReads.length).toBe(readsBeforeAssign + 2);
  expect(state.instanceReads.every((id) => id === linkedUserId)).toBe(true);
  expect(new URLSearchParams(state.patientReads[0]).get("search")).toBe("Ana");
  expect(new URLSearchParams(state.patientReads[0]).get("pageSize")).toBe("10");
  expect(state.instances).toHaveLength(1);
  expect(state.unknowns).toEqual([]);
  expect(state.errors).toEqual([]);
});

for (const [search, name] of [["Bea", "Bea Sin Cuenta QA"], ["Carlos", "Carlos Legado QA"]]) {
  test(`cuenta vinculada ${search === "Bea" ? "null" : "ausente"}: explica y bloquea sin consultas ni POST`, async ({ page }) => {
    const state = await mockAgentsHttp(page, false, { permissions, activeAgent: true });
    await page.goto(`/agents/${agentId}`);
    await selectPatient(page, search, name);
    await expect(page.getByRole("status")).toHaveText("Este paciente no tiene una cuenta de usuario vinculada. Vincula su cuenta antes de asignar el agente.");
    await expect(page.getByRole("button", { name: "Asignar agente", exact: true })).toBeDisabled();
    expect(state.instanceReads).toEqual([]);
    expect(state.writes).toEqual([]);
    expect(state.unknowns).toEqual([]);
  });
}

for (const allowed of [["Agents.View", "Patients.View"], ["Agents.View", "Agents.Update"], ["Agents.View", "Agents.Edit", "Patients.View"]]) {
  test(`sin permisos reales ${allowed.join("+")}: no muestra control ni consulta pacientes`, async ({ page }) => {
    const state = await mockAgentsHttp(page, false, { permissions: allowed, activeAgent: true });
    await page.goto(`/agents/${agentId}`);
    await expect(page.getByRole("heading", { name: "Especialista QA" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Asignar agente a un paciente" })).toHaveCount(0);
    expect(state.patientReads).toEqual([]);
    expect(state.instanceReads).toEqual([]);
    expect(state.writes).toEqual([]);
  });
}

test("permiso de lectura propia conserva búsqueda y asignación explícita", async ({ page }) => {
  const state = await mockAgentsHttp(page, false, { permissions: ["Agents.View", "Agents.Update", "Patients.ViewOwn"], activeAgent: true });
  await page.goto(`/agents/${agentId}`);
  await selectPatient(page);
  await expect(page.getByRole("button", { name: "Asignar agente", exact: true })).toBeEnabled();
  expect(state.instanceReads.every((id) => id === linkedUserId)).toBe(true);
  expect(state.writes).toEqual([]);
});

test("asignación existente se informa y no permite duplicarla", async ({ page }) => {
  const state = await mockAgentsHttp(page, false, { permissions, activeAgent: true, existingAssignment: true });
  await page.goto(`/agents/${agentId}`);
  await selectPatient(page);
  await expect(page.getByRole("status")).toContainText("Este paciente ya tiene una asignación de este agente.");
  await expect(page.getByRole("button", { name: "Asignar agente", exact: true })).toBeDisabled();
  expect(state.writes).toEqual([]);
});

test("403 al asignar conserva selección, explica error y permite reintento sin duplicados", async ({ page }) => {
  const state = await mockAgentsHttp(page, false, { permissions, activeAgent: true, assignmentFailure: 403 });
  await page.goto(`/agents/${agentId}`);
  await selectPatient(page);
  const assign = page.getByRole("button", { name: "Asignar agente", exact: true });
  await expect(assign).toBeEnabled();
  await assign.click();
  await expect(page.getByRole("group", { name: "Asignar agente a un paciente" }).getByRole("alert")).toHaveText("No se pudo asignar el agente. Revisa los permisos o si ya está asignado e inténtalo de nuevo.");
  expect(state.instances).toEqual([]);
  state.transport.assignmentFailure = undefined;
  await assign.click();
  await expect(page.getByRole("status")).toContainText("Agente asignado");
  expect(state.instances).toHaveLength(1);
  expect(state.writes.every((write) => write.body.userId === linkedUserId)).toBe(true);
});

test("consulta de asignación denegada bloquea POST y ofrece reintentar", async ({ page }) => {
  const state = await mockAgentsHttp(page, false, { permissions, activeAgent: true });
  state.transport.lookupFailure = true;
  await page.goto(`/agents/${agentId}`);
  await selectPatient(page);
  await expect(page.getByRole("group", { name: "Asignar agente a un paciente" }).getByRole("alert")).toHaveText("No se pudo consultar la asignación. Reintenta antes de asignar.");
  await expect(page.getByRole("button", { name: "Asignar agente", exact: true })).toBeDisabled();
  state.transport.lookupFailure = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Asignar agente", exact: true })).toBeEnabled();
  expect(state.writes).toEqual([]);
});

test("asignación en inglés a 390 px conserva mensajes y controles dentro del viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockAgentsHttp(page, true, { permissions, activeAgent: true });
  await page.goto(`/agents/${agentId}`);
  const group = page.getByRole("group", { name: en["Asignar agente a un paciente"] });
  await group.getByRole("button", { name: en["Buscar paciente para asignar"], exact: true }).click();
  await group.getByRole("combobox").fill("Ana");
  await group.getByRole("option", { name: "Ana Vinculada QA", exact: true }).click();
  const assign = group.getByRole("button", { name: en["Asignar agente"], exact: true });
  await expect(assign).toBeEnabled();
  await assign.click();
  await expect(group.getByRole("status")).toContainText(en["Agente asignado a la cuenta vinculada del paciente."]);
  expect(await group.evaluate((element) => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
  expect(state.instances).toHaveLength(1);
  expect(state.unknowns).toEqual([]);
  expect(state.errors).toEqual([]);
});

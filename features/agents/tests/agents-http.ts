import type { Page } from "@playwright/test";
import type { AgentInstance, AgentType, AgentTypeRequest } from "../types";
import { mockPatientsHttp } from "../../../e2e/fixtures/patients-http";

export const agentId = "00000000-0000-4000-8000-000000000901";
export const linkedUserId = "00000000-0000-4000-8000-000000000902";
export const linkedPatientId = "00000000-0000-4000-8000-000000000903";

interface AgentHttpOptions {
  withoutOwnBase?: boolean;
  missingCreatedBaseId?: boolean;
  permissions?: string[];
  activeAgent?: boolean;
  existingAssignment?: boolean;
  assignmentFailure?: number;
}

/** Transporte sintético: ninguna petición API desconocida llega a servicios reales. */
export async function mockAgentsHttp(page: Page, english = false, options: AgentHttpOptions = {}) {
  const permissions = options.permissions ?? ["Agents.View", "Agents.Create", "Agents.Update"];
  const base = await mockPatientsHttp(page, { permissions, english });
  const agent: AgentType = {
    id: agentId, name: "Especialista QA", description: "Agente sintético",
    specialty: "Nutrición", iconKey: "Bot", status: options.activeAgent ? "Activo" : "Borrador",
    metadata: JSON.stringify({ slug: "qa", custom: { keep: true }, routing: { topics: ["nutrición"], keywords: ["menú"], channels: ["text"], future: 7 } }),
    activeVersionId: null, activeVersionNumber: null, createdAt: "2026-11-14T12:00:00Z", updatedAt: null,
  };
  const writes: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const errors: string[] = [];
  const instanceReads: string[] = [];
  const patientReads: string[] = [];
  const instances: AgentInstance[] = options.existingAssignment ? [{ id: "instance-qa", userId: linkedUserId, agentTypeId: agentId, agentTypeName: agent.name, status: "Activo", metadata: "{}", createdAt: agent.createdAt, updatedAt: null }] : [];
  const transport = { assignmentFailure: options.assignmentFailure, lookupFailure: false };
  const patients = [
    { id: linkedPatientId, firstName: "Ana", lastName: "Vinculada QA", userId: linkedUserId },
    { id: "00000000-0000-4000-8000-000000000904", firstName: "Bea", lastName: "Sin Cuenta QA", userId: null },
    { id: "00000000-0000-4000-8000-000000000905", firstName: "Carlos", lastName: "Legado QA" },
  ];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/agents**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (method !== "GET") writes.push({ path, method, body: method === "PUT" && path.includes("storage") ? {} : request.postDataJSON() });
    if (path === "/api/v1/agents/instances") {
      if (method === "GET") {
        instanceReads.push(new URL(request.url()).searchParams.get("userId") ?? "");
        if (transport.lookupFailure) return reply({ detail: "Consulta no disponible QA" }, 403);
        return reply(instances.filter((instance) => instance.userId === new URL(request.url()).searchParams.get("userId")));
      }
      if (!permissions.includes("Agents.Update") || transport.assignmentFailure) return reply({ detail: "Asignación rechazada QA" }, transport.assignmentFailure ?? 403);
      const input = request.postDataJSON();
      if (instances.some((instance) => instance.userId === input.userId && instance.agentTypeId === input.agentTypeId)) return reply({ detail: "Asignación duplicada QA" }, 409);
      const instance: AgentInstance = { id: "instance-created-qa", agentTypeName: agent.name, status: "Activo", createdAt: agent.createdAt, updatedAt: null, ...input };
      instances.push(instance);
      return reply(instance, 201);
    }
    if (path === "/api/v1/agents" && method === "GET") return reply({ data: [agent], total: 1, page: 1, pageSize: 12, totalPages: 1 });
    if (path === "/api/v1/agents" && method === "POST") {
      Object.assign(agent, request.postDataJSON() as AgentTypeRequest);
      return reply(agent, 201);
    }
    if (path === `/api/v1/agents/${agentId}`) {
      if (method === "PUT") Object.assign(agent, request.postDataJSON());
      return reply(agent);
    }
    if (path === `/api/v1/agents/${agentId}/versions`) {
      if (method === "POST") return reply({ id: "version-qa", agentTypeId: agentId, versionNumber: 1, isActive: true, ...request.postDataJSON(), createdAt: agent.createdAt }, 201);
      return reply([]);
    }
    if (path === "/api/v1/agents/knowledge-bases" && method === "POST") return reply({
      ...request.postDataJSON(), id: options.missingCreatedBaseId ? "" : "kb-created", documentCount: 0,
    }, 201);
    // La lista sigue desactualizada tras crear: el upload debe usar el ID del POST.
    if (path === "/api/v1/agents/knowledge-bases") return reply([
      { id: "kb-global", name: "Guía global QA", scope: "Global", agentTypeId: null, status: "Activo", documentCount: 1 },
      ...options.withoutOwnBase ? [] : [{ id: "kb-own", name: "Guía propia QA", scope: "Agent", agentTypeId: agentId, status: "Activo", documentCount: 1 }],
    ]);
    if (["/api/v1/agents/knowledge-bases/kb-own/documents", "/api/v1/agents/knowledge-bases/kb-created/documents"].includes(path) && method === "POST") return reply({ id: "doc-qa", status: "Listo", ...request.postDataJSON() }, 201);
    if (path === "/api/v1/agents/executions") return reply({ isAvailable: true, total: 0, items: [] });
    return route.fallback();
  });
  await page.route("**/api/v1/patients?**", (route) => {
    const url = new URL(route.request().url());
    patientReads.push(url.search);
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const data = patients.filter((patient) => `${patient.firstName} ${patient.lastName}`.toLowerCase().includes(search));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data, total: data.length, page: 1, pageSize: 10, totalPages: 1 }) });
  });
  await page.route("**/api/v1/storage/**", (route) => {
    writes.push({ path: new URL(route.request().url()).pathname, method: route.request().method(), body: {} });
    return route.fulfill({ status: 204 });
  });
  return { agent, writes, unknowns: base.unknowns, errors, instanceReads, patientReads, instances, transport };
}

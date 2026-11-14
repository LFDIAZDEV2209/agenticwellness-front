import type { Page } from "@playwright/test";
import type { AgentType, AgentTypeRequest } from "../types";
import { mockPatientsHttp } from "../../../e2e/fixtures/patients-http";

export const agentId = "00000000-0000-4000-8000-000000000901";

/** Transporte sintético: ninguna petición API desconocida llega a servicios reales. */
export async function mockAgentsHttp(page: Page, english = false) {
  const base = await mockPatientsHttp(page, { permissions: ["Agents.View", "Agents.Create", "Agents.Edit"], english });
  const agent: AgentType = {
    id: agentId, name: "Especialista QA", description: "Agente sintético",
    specialty: "Nutrición", iconKey: "Bot", status: "Borrador",
    metadata: JSON.stringify({ slug: "qa", custom: { keep: true }, routing: { topics: ["nutrición"], keywords: ["menú"], channels: ["text"], future: 7 } }),
    activeVersionId: null, activeVersionNumber: null, createdAt: "2026-11-14T12:00:00Z", updatedAt: null,
  };
  const writes: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/agents**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (method !== "GET") writes.push({ path, method, body: method === "PUT" && path.includes("storage") ? {} : request.postDataJSON() });
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
    if (path === "/api/v1/agents/knowledge-bases") return reply([
      { id: "kb-global", name: "Guía global QA", scope: "Global", agentTypeId: null, status: "Activo", documentCount: 1 },
      { id: "kb-own", name: "Guía propia QA", scope: "Agent", agentTypeId: agentId, status: "Activo", documentCount: 1 },
    ]);
    if (path === "/api/v1/agents/knowledge-bases/kb-own/documents" && method === "POST") return reply({ id: "doc-qa", status: "Listo", ...request.postDataJSON() }, 201);
    if (path === "/api/v1/agents/executions") return reply({ isAvailable: true, total: 0, items: [] });
    return route.fallback();
  });
  await page.route("**/api/v1/storage/**", (route) => {
    writes.push({ path: new URL(route.request().url()).pathname, method: route.request().method(), body: {} });
    return route.fulfill({ status: 204 });
  });
  return { agent, writes, unknowns: base.unknowns, errors };
}

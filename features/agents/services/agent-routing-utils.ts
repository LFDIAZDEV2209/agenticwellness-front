export type AgentRoutingChannel = "text" | "voice";

export interface AgentRoutingForm {
  enabled: boolean;
  topics: string;
  keywords: string;
  channels: AgentRoutingChannel[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readMetadata(metadata: string | null): Record<string, unknown> | null {
  try {
    return metadata ? object(JSON.parse(metadata)) : {};
  } catch {
    return null;
  }
}

/** Sin routing se conserva la compatibilidad BACK: ambos canales, sin temas. */
export function parseAgentRouting(metadata: string | null): AgentRoutingForm {
  const routing = object(readMetadata(metadata)?.routing);
  const lines = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join("\n")
    : "";
  return {
    enabled: routing !== null,
    topics: lines(routing?.topics),
    keywords: lines(routing?.keywords),
    channels: routing
      ? ["text", "voice"].filter((channel) => Array.isArray(routing.channels) && routing.channels.includes(channel)) as AgentRoutingChannel[]
      : ["text", "voice"],
  };
}

export function routingValues(text: string): string[] {
  return text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

export function validRoutingValues(text: string): boolean {
  const values = routingValues(text);
  return values.length <= 32 && values.every((value) => value.length <= 80);
}

/** Edita solo routing; un guardado sin cambios conserva incluso metadata legada. */
export function toAgentRoutingMetadata(metadata: string | null, form: AgentRoutingForm): string | null {
  if (JSON.stringify(form) === JSON.stringify(parseAgentRouting(metadata))) return metadata;
  const raw = readMetadata(metadata);
  if (!raw) throw new Error("metadata");
  if (!form.enabled) {
    delete raw.routing;
  } else {
    if (!validRoutingValues(form.topics) || !validRoutingValues(form.keywords)) throw new Error("routing");
    raw.routing = {
      ...object(raw.routing),
      topics: routingValues(form.topics),
      keywords: routingValues(form.keywords),
      channels: form.channels.filter((channel) => channel === "text" || channel === "voice"),
    };
  }
  return JSON.stringify(raw);
}

import { apiFetch } from "@/lib/api/http";
import { env } from "@/lib/config/env";

const versionPath = `${env.apiUrl}/api/v1/erp/motor365/parameters/versions`;

export interface MotorParameterRevision {
  version: number;
  engineVersion: string;
  changedBy: string | null;
  reason: string | null;
  publishedAt: string | null;
  defaults: boolean;
}

export type MotorParameterValue = number | string | boolean | null | MotorParameterValue[] |
  { [property: string]: MotorParameterValue };

export interface MotorParameterHistory {
  versions: MotorParameterRevision[];
  nextBefore: number | null;
}

interface MotorParameterVersion {
  revision: MotorParameterRevision;
  parameters: Record<string, MotorParameterValue>;
}

export function readParameterHistory(signal: AbortSignal, before?: number) {
  const query = before === undefined ? "" : `?before=${before}`;
  return apiFetch<MotorParameterHistory>(versionPath + query, { signal, cache: "no-store" });
}

export async function compareMotorParameters(previous: number, current: number, signal: AbortSignal) {
  const load = (version: number) => apiFetch<MotorParameterVersion>(`${versionPath}/${version}`, { signal, cache: "no-store" });
  const [before, after] = await Promise.all([load(previous), load(current)]);
  return parameterDiff(before.parameters, after.parameters);
}

export interface MotorParameterDifference {
  path: string;
  before?: MotorParameterValue;
  after?: MotorParameterValue;
}

function isParameterObject(value: MotorParameterValue | undefined): value is Record<string, MotorParameterValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parameterDiff(before: Record<string, MotorParameterValue>, after: Record<string, MotorParameterValue>, prefix = ""): MotorParameterDifference[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return paths.flatMap(key => {
    const path = prefix ? `${prefix}.${key}` : key;
    const older = before[key];
    const newer = after[key];
    if (isParameterObject(older) && isParameterObject(newer)) return parameterDiff(older, newer, path);
    return JSON.stringify(older) === JSON.stringify(newer) ? [] : [{ path, before: older, after: newer }];
  });
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Indicator, Observation } from "@/lib/ine/types";

export const ResponseToneSchema = z.enum(["direct", "journalist", "teacher", "researcher", "executive", "sarcastic"]);
export type ResponseTone = z.infer<typeof ResponseToneSchema>;

export interface StatisticalEvidence {
  question: string;
  indicator: Pick<Indicator, "id" | "name" | "shortName" | "unit" | "dimensionDescription">;
  observations: Observation[];
  summaries: Array<{ territory: string; first?: Observation; last?: Observation; absolute?: number | null; percent?: number | null } | null>;
  calculations: Array<{ label: string; value: number; unit: string }>;
  sources: Array<{ name: string; url: string; dataUrl: string; indicatorId: string }>;
  limitations: string[];
}

export interface Explanation {
  tone: ResponseTone;
  headline: string;
  summary: string;
  caveat: string | null;
  detail: string;
  title: string;
  body: string;
  evidenceId: string;
  provider: "gemini" | "ollama" | "template";
  model: string;
}

type Entry = { evidence: Readonly<StatisticalEvidence>; expiresAt: number; explanations: Map<ResponseTone, Explanation> };
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 128;
// Next can bundle /api/ask and /api/explain separately; a process-global cache keeps
// the same short-lived evidence available to both route modules.
const processState = globalThis as typeof globalThis & { __perguntaAoIneEvidenceCache?: Map<string, Entry> };
const cache = processState.__perguntaAoIneEvidenceCache ?? (processState.__perguntaAoIneEvidenceCache = new Map<string, Entry>());

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => freezeDeep(item));
    Object.freeze(value);
  }
  return value;
}

export function storeEvidence(evidence: StatisticalEvidence): string {
  const now = Date.now();
  for (const [id, entry] of cache) if (entry.expiresAt <= now) cache.delete(id);
  while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  const id = randomUUID();
  const copy = JSON.parse(JSON.stringify(evidence)) as StatisticalEvidence;
  cache.set(id, { evidence: freezeDeep(copy), expiresAt: now + CACHE_TTL_MS, explanations: new Map() });
  return id;
}

export function getEvidence(id: string): Readonly<StatisticalEvidence> | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { cache.delete(id); return null; }
  return entry.evidence;
}

export function getCachedExplanation(id: string, tone: ResponseTone): Explanation | null {
  return getEvidence(id) ? cache.get(id)?.explanations.get(tone) ?? null : null;
}

export function cacheExplanation(explanation: Explanation): void {
  if (explanation.provider !== "template" && getEvidence(explanation.evidenceId)) cache.get(explanation.evidenceId)?.explanations.set(explanation.tone, explanation);
}

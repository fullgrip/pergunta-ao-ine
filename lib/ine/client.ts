import { getIndicator } from "./catalog";
import { normalizeIneResponse } from "./normalize";
import type { Indicator, IndicatorId, IneResponse, Territory } from "./types";

const base = "https://www.ine.pt/ine/json_indicador";
// Medido a 17/10/2026: uma ligação nova ao INE às vezes fica pendurada sem nunca responder
// (2 em 3 pedidos seguidos, 30 s cada), enquanto a seguinte responde em ~1 s. Esperar mais
// não ajuda; repetir com uma ligação nova, sim. Só depois de todas as tentativas falharem
// é que o INE conta como indisponível.
const timeoutMs = 7_000;
const transportAttempts = 3;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function ineFetch(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < transportAttempts; attempt++) {
    if (attempt > 0) await pause(attempt * 600);
    try { return await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" }); }
    catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("erro de rede");
}
let dataQueue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
let unavailableUntil = 0;
const observationCache = new Map<string, { until: number; data: IneResponse }>();
let healthCache: { until: number; available: boolean } | null = null;
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const current = dataQueue.then(async () => {
    await pause(Math.max(0, 1400 - (Date.now() - lastRequestAt)));
    lastRequestAt = Date.now();
    return job();
  });
  dataQueue = current.catch(() => undefined);
  return current;
}
export async function getMetadata(id: IndicatorId) {
  const response = await ineFetch(`${base}/pindicaMeta.jsp?varcd=${encodeURIComponent(id)}&lang=PT`);
  if (!response.ok) throw new Error(`INE metadados: HTTP ${response.status}`);
  return response.json();
}
export async function fetchObservation(indicator: Indicator, territory: Territory, period: string, periodCode: string, options?: { maxAttempts?: number }) {
  const params = new URLSearchParams({ op: "2", varcd: indicator.id, Dim1: periodCode, Dim2: territory.id, lang: "PT", ...indicator.extraDimensions });
  const key = params.toString();
  const cached = observationCache.get(key);
  if (cached && cached.until > Date.now()) return cached.data;
  if (Date.now() < unavailableUntil) throw new Error("INE temporariamente indisponível; consulta suspensa para evitar espera repetida.");
  return enqueue(async () => {
    if (Date.now() < unavailableUntil) throw new Error("INE temporariamente indisponível; consulta suspensa para evitar espera repetida.");
    const maxAttempts = Math.max(1, Math.min(3, options?.maxAttempts ?? 3));
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let response: Response;
      try { response = await ineFetch(`${base}/pindica.jsp?${params}`); }
      catch (error) { unavailableUntil = Date.now() + 10_000; throw new Error(`INE dados: ligação indisponível (${error instanceof Error ? error.message : "erro de rede"}).`); }
      if (response.status === 429 && attempt < maxAttempts - 1) { await pause((attempt + 1) * 5000); continue; }
      if (response.status === 429) unavailableUntil = Date.now() + 60_000;
      if (!response.ok) throw new Error(`INE dados: HTTP ${response.status}`);
      const data = normalizeIneResponse(await response.json(), indicator, territory, period, periodCode);
      observationCache.set(key, { until: Date.now() + 60 * 60_000, data });
      return data;
    }
    throw new Error("INE dados: limite de taxa de pedidos excedido.");
  });
}
/** Fetch several periods and territories in one official INE request. */
export async function fetchBatchObservations(
  indicator: Indicator,
  territories: Territory[],
  periods: Array<{ period: string; code: string }>,
  options?: { maxAttempts?: number },
): Promise<IneResponse> {
  if (!territories.length || !periods.length) return { observations: [], extractedAt: "", lastUpdated: "", warnings: [] };
  if (new Set(territories.map((item) => item.id)).size !== territories.length || new Set(periods.map((item) => item.code)).size !== periods.length) {
    throw new Error("Consulta INE em lote com territórios ou períodos repetidos.");
  }
  const params = new URLSearchParams({
    op: "2", varcd: indicator.id,
    Dim1: periods.map((item) => item.code).join(","),
    Dim2: territories.map((item) => item.id).join(","),
    ...indicator.extraDimensions, lang: "PT",
  });
  const query = params.toString().replaceAll("%2C", ",");
  const cached = observationCache.get(query);
  if (cached && cached.until > Date.now()) return cached.data;
  if (Date.now() < unavailableUntil) throw new Error("INE temporariamente indisponível; consulta suspensa para evitar espera repetida.");
  return enqueue(async () => {
    const secondCache = observationCache.get(query);
    if (secondCache && secondCache.until > Date.now()) return secondCache.data;
    if (Date.now() < unavailableUntil) throw new Error("INE temporariamente indisponível; consulta suspensa para evitar espera repetida.");
    const maxAttempts = Math.max(1, Math.min(3, options?.maxAttempts ?? 2));
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let response: Response;
      try { response = await ineFetch(`${base}/pindica.jsp?${query}`); }
      catch (error) { unavailableUntil = Date.now() + 10_000; throw new Error(`INE dados: ligação indisponível (${error instanceof Error ? error.message : "erro de rede"}).`); }
      if (response.status === 429 && attempt < maxAttempts - 1) { await pause((attempt + 1) * 5000); continue; }
      if (response.status === 429) unavailableUntil = Date.now() + 60_000;
      if (!response.ok) throw new Error(`INE dados: HTTP ${response.status}`);
      const raw: unknown = await response.json();
      const cells = territories.flatMap((territory) => periods.map(({ period, code }) => normalizeIneResponse(raw, indicator, territory, period, code)));
      const data: IneResponse = {
        observations: cells.flatMap((cell) => cell.observations),
        extractedAt: cells[0].extractedAt,
        lastUpdated: cells[0].lastUpdated,
        warnings: cells.flatMap((cell) => cell.warnings),
      };
      observationCache.set(query, { until: Date.now() + 60 * 60_000, data });
      return data;
    }
    throw new Error("INE dados: limite de taxa de pedidos excedido.");
  });
}
export function periodCodes(indicator: Indicator, year: number): Array<{ period: string; code: string }> {
  if (indicator.frequency === "Anual") return [{ period: String(year), code: `S7A${year}` }];
  return [1, 2, 3, 4].filter((q) => year !== 2026 || q <= 2).map((q) => ({ period: `${q}.º Trimestre de ${year}`, code: `S5A${year}${q}` }));
}
export function plannedPeriods(indicator: Indicator, startYear?: number, endYear?: number, quarter?: number): Array<{ period: string; code: string }> {
  const years = indicator.years.map(Number).filter((year) => (!startYear || year >= startYear) && (!endYear || year <= endYear));
  if (quarter !== undefined) {
    if (indicator.frequency !== "Trimestral" || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error("Trimestre inválido para este indicador.");
    return years.flatMap((year) => periodCodes(indicator, year)).filter(({ code }) => code.endsWith(String(quarter)));
  }
  if (startYear || endYear) return years.flatMap((year) => periodCodes(indicator, year));
  if (indicator.frequency === "Trimestral") return years.flatMap((year) => periodCodes(indicator, year)).slice(-8);
  const lastYear = years.at(-1);
  if (!lastYear) return [];
  return years.slice(-5).flatMap((year) => periodCodes(indicator, year));
}
export async function fetchSeries(indicator: Indicator, territory: Territory, startYear?: number, endYear?: number, quarter?: number) {
  const periods = plannedPeriods(indicator, startYear, endYear, quarter);
  if (!periods.length) return { observations: [], extractedAt: "", lastUpdated: "", warnings: [] } satisfies IneResponse;
  try { return await fetchBatchObservations(indicator, [territory], periods); }
  catch (error) { return { observations: [], extractedAt: "", lastUpdated: "", warnings: [error instanceof Error ? error.message : "Falha na consulta ao INE."] } satisfies IneResponse; }
}
export async function checkIne() {
  if (healthCache && healthCache.until > Date.now()) return healthCache.available;
  let available = false;
  try { const items = await getMetadata("0012918"); available = Array.isArray(items) && items[0]?.IndicadorCod === "0012918"; } catch { available = false; }
  // Uma falha só fica em cache 30 s: o INE costuma voltar logo, e o selo não deve ficar vermelho 5 min.
  healthCache = { until: Date.now() + (available ? 5 * 60_000 : 30_000), available };
  return available;
}
export function indicatorById(id: string) { return getIndicator(id); }

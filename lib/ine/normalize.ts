import type { Indicator, IneResponse, Observation, Territory } from "./types";

type RawRow = { geocod?: string; geodsg?: string; valor?: string; ind_string?: string; sinal_conv_desc?: string };
type RawEnvelope = { IndicadorCod?: string; Dados?: Record<string, RawRow[]>; Sucesso?: { Verdadeiro?: unknown[] }; DataExtracao?: string; DataUltimoAtualizacao?: string; MetaInfUrl?: string };
export function normalizeIneResponse(raw: unknown, indicator: Indicator, territory: Territory, period: string, periodCode: string): IneResponse {
  if (!Array.isArray(raw) || !raw.length) throw new Error("Resposta do INE vazia ou inválida.");
  const envelope = raw[0] as RawEnvelope;
  if (envelope.IndicadorCod !== indicator.id) throw new Error("O INE devolveu um indicador diferente do pedido.");
  if (!envelope.Sucesso?.Verdadeiro) throw new Error("O INE não confirmou sucesso para esta consulta.");
  const rows = envelope.Dados?.[period] ?? [];
  const row = rows.find((item) => item.geocod === territory.id);
  let value: number | null = null;
  if (row?.valor !== undefined && row.valor !== "") {
    const parsed = Number(row.valor.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(parsed)) value = parsed;
  }
  return {
    observations: [{ territoryId: territory.id, territory: row?.geodsg ?? territory.name, period, periodCode, value, displayValue: row?.ind_string ?? "Sem valor publicado" }],
    extractedAt: envelope.DataExtracao ?? new Date().toISOString(), lastUpdated: envelope.DataUltimoAtualizacao ?? "Data não indicada",
    warnings: [
      ...(value === null ? [`${territory.name}, ${period}: o INE não disponibilizou valor numérico; não foi tratado como zero.`] : []),
      ...(row?.sinal_conv_desc ? [`${territory.name}, ${period}: ${row.sinal_conv_desc}.`] : []),
    ],
  };
}

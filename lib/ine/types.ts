export type IndicatorId = "0014711" | "0012918" | "0012136" | "0012653" | "0013312" | "0012765" | "0014137" | "0012255" | "0012256" | "0012909" | "0013044" | "0012260" | "0014580" | "0013249";
export type Intent = "trend" | "comparison";

export interface Territory { id: string; name: string; level: "municipality" | "region" }
export interface Indicator {
  id: IndicatorId; slug: string; name: string; shortName: string; unit: string;
  frequency: "Anual" | "Trimestral"; dimensionDescription: string;
  supportedTerritories: Territory[]; sourceUrl: string; dataUrl: string;
  years: string[]; extraDimensions: Record<string, string>;
}
export interface Observation { territoryId: string; territory: string; period: string; periodCode: string; value: number | null; displayValue: string; }
export interface IneResponse { observations: Observation[]; extractedAt: string; lastUpdated: string; warnings: string[]; }

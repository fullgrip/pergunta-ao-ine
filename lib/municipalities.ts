import catalog from "../data/municipios.json";
import type { Territory } from "./ine/types";

export interface Municipality extends Territory {
  region: string;
  slug: string;
}

export const MUNICIPALITY_CATALOG_SOURCE = catalog.source;
export const MUNICIPALITY_CATALOG_VERSION = catalog.version;
export const MUNICIPALITIES: Municipality[] = catalog.municipalities.map((item) => ({
  ...item,
  level: "municipality" as const,
}));

const byId = new Map(MUNICIPALITIES.map((item) => [item.id.toUpperCase(), item]));
const bySlug = new Map(MUNICIPALITIES.map((item) => [item.slug, item]));

/** Normalize accents and case without changing official display names. */
export function normalizeMunicipalityText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function baseName(municipality: Municipality): string {
  return municipality.name.replace(/\s*\(R\.A\.[AM]\.\)\s*$/i, "");
}

export function getMunicipalityById(id: string): Municipality | undefined {
  return byId.get(id.trim().toUpperCase());
}

export function getMunicipalityBySlug(slug: string): Municipality | undefined {
  const value = decodeURIComponent(slug).trim().toLowerCase();
  return bySlug.get(value) ?? getMunicipalityById(value);
}

export function municipalitySlug(municipality: Territory): string {
  return getMunicipalityById(municipality.id)?.slug ?? normalizeMunicipalityText(municipality.name).replaceAll(" ", "-");
}

export function searchMunicipalities(query: string, limit = 10): Municipality[] {
  const normalized = normalizeMunicipalityText(query);
  const capped = Math.max(0, Math.min(308, Math.floor(limit)));
  if (!normalized) return MUNICIPALITIES.slice(0, capped);

  const ranked = MUNICIPALITIES.flatMap((municipality) => {
    const name = normalizeMunicipalityText(municipality.name);
    const alias = normalizeMunicipalityText(baseName(municipality));
    const region = normalizeMunicipalityText(municipality.region);
    const id = municipality.id.toLowerCase();
    let rank = Number.POSITIVE_INFINITY;
    if (id === normalized || name === normalized) rank = 0;
    else if (alias === normalized) rank = 1;
    else if (id.startsWith(normalized) || name.startsWith(normalized) || alias.startsWith(normalized)) rank = 2;
    else if (name.includes(normalized) || alias.includes(normalized)) rank = 3;
    else if (`${alias} ${region}`.includes(normalized)) rank = 4;
    if (!Number.isFinite(rank)) return [];
    return [{ municipality, rank }];
  });
  ranked.sort((a, b) => a.rank - b.rank || a.municipality.name.localeCompare(b.municipality.name, "pt") || a.municipality.id.localeCompare(b.municipality.id));
  return ranked.slice(0, capped).map(({ municipality }) => municipality);
}

export interface MunicipalityMention {
  matches: Municipality[];
  ambiguous: boolean;
}

// Municípios cujo nome também é uma palavra comum ("Quanta gente mora em Tavira?" não é sobre Mora).
// Só contam como lugar quando escritos com maiúscula.
const COMMON_WORD_NAMES = new Set(["mora", "tomar", "mira", "caminha", "guarda", "batalha", "redondo", "paredes", "espinho",
  "horta", "velas", "nordeste", "povoacao", "constancia", "fronteira", "cuba", "vagos", "amadora", "chaves", "moita",
  "entroncamento", "tabua", "lagoa", "corvo"]);

/** Find explicit municipality names or INE codes in a question. Multiple names mean a comparison. */
export function resolveMunicipalityMention(text: string): MunicipalityMention {
  const normalized = ` ${normalizeMunicipalityText(text)} `;
  const accentless = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const writtenAsName = (alias: string) => new RegExp(`(^|[^A-Za-z])${alias.charAt(0).toUpperCase()}${alias.slice(1)}(?![A-Za-z])`).test(accentless);
  const candidates: Array<{ municipality: Municipality; start: number; end: number; length: number }> = [];

  for (const municipality of MUNICIPALITIES) {
    const aliases = [municipality.name, baseName(municipality), municipality.id];
    for (const alias of new Set(aliases.map(normalizeMunicipalityText))) {
      // Em minúsculas só conta depois de "em/no/na/de/da/do/a/o" ("habitantes da guarda"), nunca depois de "para" ("para tomar").
      if (COMMON_WORD_NAMES.has(alias) && !writtenAsName(alias) && !new RegExp(` (em|no|na|de|da|do|a|o) ${alias} `).test(normalized)) continue;
      const needle = ` ${alias} `;
      let start = normalized.indexOf(needle);
      while (start >= 0) {
        candidates.push({ municipality, start, end: start + needle.length, length: alias.length });
        start = normalized.indexOf(needle, start + 1);
      }
    }
  }

  // A longer explicit place name wins over a nested shorter name, e.g. Porto Santo over Porto.
  candidates.sort((a, b) => b.length - a.length || a.start - b.start);
  const accepted: typeof candidates = [];
  for (const candidate of candidates) {
    if (!accepted.some((match) => candidate.start < match.end && candidate.end > match.start && match.length > candidate.length)) {
      accepted.push(candidate);
    }
  }
  const unique = [...new Map(accepted.map((match) => [match.municipality.id, match.municipality])).values()];
  const byBase = new Map<string, Municipality[]>();
  for (const municipality of unique) {
    const key = normalizeMunicipalityText(baseName(municipality));
    byBase.set(key, [...(byBase.get(key) ?? []), municipality]);
  }
  const regionHint = normalized.includes(" acores ") || normalized.includes(" r a a ") ? "Região Autónoma dos Açores"
    : normalized.includes(" madeira ") || normalized.includes(" r a m ") ? "Região Autónoma da Madeira" : null;
  const matches = unique.filter((municipality) => {
    const group = byBase.get(normalizeMunicipalityText(baseName(municipality))) ?? [];
    return group.length < 2 || !regionHint || municipality.region === regionHint;
  });
  return { matches, ambiguous: [...byBase.values()].some((group) => group.length > 1 && (!regionHint || group.every((item) => item.region !== regionHint))) };
}

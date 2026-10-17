import { describe, expect, it } from "vitest";
import {
  MUNICIPALITIES, MUNICIPALITY_CATALOG_SOURCE, MUNICIPALITY_CATALOG_VERSION,
  getMunicipalityById, getMunicipalityBySlug, municipalitySlug,
  resolveMunicipalityMention, searchMunicipalities,
} from "../lib/municipalities";

describe("catálogo nacional INE", () => {
  it("contém os 308 municípios com códigos únicos e fonte versionada", () => {
    expect(MUNICIPALITIES).toHaveLength(308);
    expect(new Set(MUNICIPALITIES.map((item) => item.id)).size).toBe(308);
    expect(new Set(MUNICIPALITIES.map((item) => item.slug)).size).toBe(308);
    expect(MUNICIPALITIES.every((item) => item.id.length === 7 && item.region)).toBe(true);
    expect(MUNICIPALITY_CATALOG_VERSION).toContain("nuts-2024");
    expect(MUNICIPALITY_CATALOG_SOURCE.sourceUrl).toContain("ine.pt");
  });

  it("mantém os códigos e as rotas existentes do Algarve", () => {
    expect(MUNICIPALITIES.slice(0, 4).map((item) => item.id)).toEqual(["1500811", "1500805", "1500807", "1500801"]);
    expect(getMunicipalityBySlug("portimao")?.id).toBe("1500811");
    expect(municipalitySlug(getMunicipalityById("1500805")!)).toBe("faro");
  });

  it("pesquisa sem depender de acentos, maiúsculas ou código numérico", () => {
    expect(searchMunicipalities("PORTIMAO")[0].name).toBe("Portimão");
    expect(searchMunicipalities("são joão da madeira")[0].name).toBe("São João da Madeira");
    expect(searchMunicipalities("1500811")[0].name).toBe("Portimão");
    expect(searchMunicipalities("lagoa").map((item) => item.name)).toEqual(expect.arrayContaining(["Lagoa", "Lagoa (R.A.A.)"]));
  });

  it("encontra menções explícitas, incluindo códigos alfanuméricos", () => {
    expect(resolveMunicipalityMention("Qual é a renda em Portimão?").matches.map((item) => item.id)).toEqual(["1500811"]);
    expect(resolveMunicipalityMention("Compara Faro com Lagos").matches.map((item) => item.id).sort()).toEqual(["1500805", "1500807"]);
    expect(resolveMunicipalityMention("População de 1D11102").matches[0]?.name).toBe("Arruda dos Vinhos");
  });

  it("pede desambiguação para homónimos e resolve com região explícita", () => {
    const ambiguous = resolveMunicipalityMention("População de Lagoa");
    expect(ambiguous.ambiguous).toBe(true);
    expect(ambiguous.matches).toHaveLength(2);
    const azores = resolveMunicipalityMention("População de Lagoa nos Açores");
    expect(azores.ambiguous).toBe(false);
    expect(azores.matches.map((item) => item.name)).toEqual(["Lagoa (R.A.A.)"]);
  });

  it("prefere nomes completos a nomes contidos neles", () => {
    const found = resolveMunicipalityMention("População de Porto Santo");
    expect(found.matches.map((item) => item.name)).toEqual(["Porto Santo"]);
  });
});

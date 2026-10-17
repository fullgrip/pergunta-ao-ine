"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BarChart3, Database, ExternalLink, GitCompareArrows, Info, LoaderCircle, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComparisonResult } from "@/lib/analytics/comparison";
import { DEFAULT_COMPARISON_IDS } from "@/lib/analytics/comparison-options";
import { getMunicipalityById } from "@/lib/municipalities";
import MunicipalitySelector, { readSavedMunicipalityId } from "@/components/municipality/MunicipalitySelector";
import CityPhoto, { type CityPhotoSlug } from "@/components/media/CityPhoto";
import styles from "./ComparisonView.module.css";
import MobileMenu from "@/components/layout/MobileMenu";

const featuredColors: Record<string, string> = {
  "1500811": "var(--cidade-portimao)", "1500805": "var(--cidade-faro)",
  "1500807": "var(--cidade-lagos)", "1500801": "var(--cidade-albufeira)",
};
const featuredPhotos: Record<string, CityPhotoSlug> = {
  "1500811": "portimao", "1500805": "faro", "1500807": "lagos", "1500801": "albufeira",
};
const otherColors = ["var(--mar)", "var(--pinho)", "var(--falesia-texto)", "var(--cidade-albufeira)"];
const indicatorOptions = [
  { slug: "rendas", label: "Renda mediana", unit: "€/m²", year: "2025" },
  { slug: "populacao", label: "População residente", unit: "pessoas", year: "2025" },
  { slug: "ganho-medio", label: "Ganho médio mensal", unit: "€", year: "2024" },
  { slug: "hospedes-por-habitante", label: "Hóspedes por habitante", unit: "hóspedes/hab.", year: "2025" },
  { slug: "residuos-por-habitante", label: "Resíduos urbanos por habitante", unit: "kg/hab.", year: "2024" },
] as const;

function cityColor(id: string) {
  if (featuredColors[id]) return featuredColors[id];
  const hash = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return otherColors[hash % otherColors.length];
}
function format(value: number | null, unit: string) {
  return value === null ? "Sem dado" : `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: unit === "pessoas" ? 0 : 2 }).format(value)} ${unit}`;
}
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const saved = readSavedMunicipalityId();
  const suggested = saved ? [saved, DEFAULT_COMPARISON_IDS.find((id) => id !== saved)!] : DEFAULT_COMPARISON_IDS;
  const ids = params.get("territories")?.split(",").map((id) => id.trim()) ?? suggested;
  return {
    selected: ids.length >= 2 && ids.length <= 4 && new Set(ids).size === ids.length && ids.every(getMunicipalityById)
      ? ids : DEFAULT_COMPARISON_IDS,
    indicator: indicatorOptions.find((item) => item.slug === params.get("indicator"))?.slug ?? "rendas",
  };
}

type Explanation = { headline: string; facts: string; explanation: string; provider: "gemini" | "ollama" | "template"; model: string };

export default function ComparisonView() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_COMPARISON_IDS);
  const [indicator, setIndicator] = useState("rendas");
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<ComparisonResult | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [explaining, setExplaining] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");

  useEffect(() => {
    const sync = () => { const state = readUrl(); setSelected(state.selected); setIndicator(state.indicator); setReady(true); };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    params.set("indicator", indicator);
    params.set("territories", selected.join(","));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [indicator, selected, ready]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ indicator, territories: selected.join(",") });
    setLoading(true); setData(null); setExplanation(null); setSavedNotice(""); setError("");
    fetch(`/api/compare?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body as ComparisonResult; })
      .then((result) => { setData(result); setError(""); })
      .catch((cause) => { if (cause.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Não foi possível abrir a comparação."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [indicator, selected, ready]);
  useEffect(() => {
    if (!data || data.ranking.length !== selected.length || !ready) return;
    const controller = new AbortController();
    setExplaining(true);
    fetch("/api/compare/explain", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ indicator, territories: selected }), signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body as Explanation; })
      .then(setExplanation)
      .catch(() => { if (!controller.signal.aborted) setExplanation(null); })
      .finally(() => { if (!controller.signal.aborted) setExplaining(false); });
    return () => controller.abort();
  }, [data, indicator, selected, ready]);

  function addCity(id: string) {
    if (selected.length >= 4 || selected.includes(id)) return;
    setSelected((current) => [...current, id]);
  }
  function removeCity(id: string) {
    if (selected.length <= 2) return;
    setSelected((current) => current.filter((item) => item !== id));
  }
  async function refreshMissing() {
    if (!data || fetching) return;
    const latestYear = indicatorOptions.find((item) => item.slug === indicator)?.year ?? "2025";
    const latest = data.periods.find((period) => period.periodCode === `S7A${latestYear}`);
    const missing = selected.filter((id) => !latest?.cells.some((cell) => cell.territoryId === id && cell.value !== null));
    if (!missing.length) return;
    setFetching(true); setError(""); setSavedNotice("");
    try {
      const response = await fetch("/api/compare", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ indicator, territoryIds: missing }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "O INE não devolveu os valores pedidos.");
      setSavedNotice(body.message ?? "Dados atualizados.");
      const params = new URLSearchParams({ indicator, territories: selected.join(",") });
      const refreshed = await fetch(`/api/compare?${params}`, { cache: "no-store" });
      const result = await refreshed.json();
      if (!refreshed.ok) throw new Error(result.error ?? "Falha ao reler os dados guardados.");
      setData(result); setExplanation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar o INE.");
    } finally { setFetching(false); }
  }

  const current = data?.periods.find((period) => period.periodCode === data.selectedPeriodCode);
  const latestYear = indicatorOptions.find((item) => item.slug === indicator)?.year ?? "2025";
  const latestPeriodCode = `S7A${latestYear}`;
  const latest = data?.periods.find((period) => period.periodCode === latestPeriodCode);
  const latestMissing = data ? selected.filter((id) => !latest?.cells.some((cell) => cell.territoryId === id && cell.value !== null)) : [];
  const timeline = data?.periods.map((period) => ({
    period: period.period, ...Object.fromEntries(period.cells.map((cell) => [cell.territoryId, cell.value])),
  })) ?? [];
  const barData = current?.cells.map((cell) => ({ id: cell.territoryId, name: cell.territory, value: cell.value })) ?? [];
  const hasMissing = (current?.cells.filter((cell) => cell.value === null).length ?? 0) > 0;

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <Link href="/" className={styles.brand}><span className={styles.brandIcon}><BarChart3 size={19}/></span><span>Pergunta <em>ao INE</em></span></Link>
      <nav className={styles.nav}><Link href="/">Perguntar</Link><Link href="/explorar">Explorar cidades</Link><span>Comparar cidades</span><Link href="/descobertas">Descobertas</Link><Link href="/sobre">Sobre o projeto</Link></nav><MobileMenu/>
      <span className={styles.official}><span/> Dados oficiais</span>
    </header>
    <div className={styles.breadcrumb}><Link href="/"><ArrowLeft size={13}/> Início</Link><span>/</span>Comparar cidades</div>
    <section className={styles.hero}><div className={styles.eyebrow}><GitCompareArrows size={15}/> COMPARAÇÃO MUNICIPAL</div>
      <h1>Compara cidades.<br/><span>Percebe as diferenças.</span></h1>
      <p>Escolhe entre dois e quatro municípios portugueses. Só apresentamos um ranking quando existem valores oficiais do mesmo indicador, período e unidade para todos.</p>
    </section>
    <div className={styles.dataNotice}><Database size={17}/><div><strong>Dados verificados</strong><span>Os valores já guardados abrem sem novo pedido ao INE. Podes consultar os que faltam numa única operação.</span></div></div>
    {savedNotice && <div className={styles.savedNotice} role="status"><ShieldCheck size={15}/>{savedNotice}</div>}
    <section className={styles.workspace}>
      <aside className={styles.filters}>
        <div className={styles.filterHeading}><span>01 / PREPARAR</span><h2>Municípios</h2><p>Escolhe entre dois e quatro de todo o país.</p></div>
        <div className={styles.cityOptions}>{selected.map((id, index) => {
          const city = getMunicipalityById(id);
          if (!city) return null;
          return <div key={id} className={styles.cityOption}><span className={styles.citySymbol} style={{ borderColor: cityColor(id) }}>{String(index + 1).padStart(2, "0")}</span>
            <span><strong>{city.name}</strong><small>Código INE · {id}</small></span>
            <button type="button" className={styles.removeCity} onClick={() => removeCity(id)} disabled={selected.length <= 2}
              aria-label={`Remover ${city.name}`} title={selected.length <= 2 ? "Mantém pelo menos dois municípios" : `Remover ${city.name}`}><X size={15}/></button></div>;
        })}</div>
        {selected.length < 4 && <div className={styles.addCity}><span><Plus size={15}/> Adicionar município</span>
          <MunicipalitySelector value={null} onChange={(city) => addCity(city.id)} excludedIds={selected} placeholder="Pesquisar município ou código INE" />
        </div>}
        <div className={styles.filterRule}/>
        <div className={styles.filterHeading}><span>02 / INDICADOR</span><h2>O que comparar?</h2></div>
        <div className={styles.indicators}>{indicatorOptions.map((option) => <button key={option.slug} type="button" className={indicator === option.slug ? styles.selectedIndicator : ""} onClick={() => setIndicator(option.slug)}>{option.label} <small>{option.unit}</small></button>)}</div>
        <div className={styles.filterNote}><Info size={15}/><p>Valores em falta ficam assinalados. A explicação por Gemma 4 só aparece quando o ranking é comprovado.</p></div>
      </aside>
      <div className={styles.results}>
        <div className={styles.resultHead}><div><span className={styles.eyebrow}>03 / COMPARAR</span><h2>{data?.indicator.shortName ?? "A preparar a comparação"}</h2>
          <p>{data ? `${data.indicator.name} · ${data.indicator.frequency}` : "A ler valores guardados"}</p></div><span className={styles.unit}>{data?.indicator.unit ?? "—"}</span></div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {loading && <div className={styles.loading} role="status">A ler dados verificados e a alinhar os períodos…</div>}
        {!loading && data && <>
          <div className={styles.statusStrip}><ShieldCheck size={17}/><span>{data.availableCount} de {data.territories.length} municípios com valor em {data.selectedPeriod ?? "período indisponível"}</span><small>Indicador {data.indicator.id}</small></div>
          {latestMissing.length > 0 && <div className={styles.refreshBar}><span>Faltam valores de {data.indicator.shortName.toLowerCase()} para {latestMissing.length} {latestMissing.length === 1 ? "município" : "municípios"} em {latestYear}.</span>
            <button type="button" onClick={() => void refreshMissing()} disabled={fetching}>{fetching ? <LoaderCircle size={15} className={styles.spin}/> : <RefreshCw size={15}/>} {fetching ? "A aguardar dados oficiais…" : "Consultar INE em lote"}</button></div>}
          <div className={styles.cards}>{data.territories.map((city) => {
            const cell = current?.cells.find((item) => item.territoryId === city.id);
            const photo = featuredPhotos[city.id];
            return <article className={styles.cityCard} key={city.id} style={{ borderTopColor: cityColor(city.id) }}>
              {photo && <CityPhoto city={photo} compact className={styles.cardPhoto}/>}
              <div className={styles.cardTop}><span className={styles.cityDot} style={{ background: cityColor(city.id) }}/><span>{city.name.toUpperCase()}</span></div>
              <strong className={cell?.value == null ? styles.noValue : ""}>{format(cell?.value ?? null, data.indicator.unit)}</strong>
              <div className={styles.cardBottom}><span>{cell?.value == null ? "Sem observação para o período" : `${data.selectedPeriod} · recolhido ${cell.collectedAt ?? data.snapshotDate}`}</span>
                {cell?.sourceUrl && <a href={cell.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Fonte INE de ${city.name}`}><ExternalLink size={14}/></a>}</div>
              <Link className={styles.cityLink} href={`/cidade/${city.id}`}>Explorar {city.name} <ArrowUpRight size={13}/></Link>
            </article>;
          })}</div>
          <div className={styles.visualGrid}>
            <article className={styles.chartPanel}><div className={styles.chartHead}><div><span>MESMO INDICADOR · MESMO PERÍODO</span><h3>Valores em {data.selectedPeriod ?? "período disponível"}</h3></div><BarChart3 size={18}/></div>
              {current ? <div className={styles.barChart}><ResponsiveContainer width="100%" height="100%"><BarChart data={barData} margin={{ left: 0, top: 8, right: 10, bottom: 8 }}><CartesianGrid vertical={false} stroke="var(--linha)"/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--tinta-2)", fontSize: 12 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--tinta-2)", fontSize: 12 }} width={48}/><Tooltip formatter={(value) => format(value == null ? null : Number(value), data.indicator.unit)}/><Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={62}>{barData.map((item) => <Cell key={item.id} fill={cityColor(item.id)}/>)}</Bar></BarChart></ResponsiveContainer></div> : <div className={styles.emptyChart}>Ainda não há observações verificadas.</div>}
              <div className={styles.chartFoot}>{hasMissing ? "A ausência de uma barra indica que não há valor verificado." : "Todos os municípios têm valor para o período mostrado."}</div></article>
            <article className={styles.insightPanel}><span className={styles.eyebrow}>LEITURA DOS DADOS</span>
              <h3>{data.ranking.length ? explanation?.headline ?? `${data.ranking[0].territory} tem o valor mais alto` : "Ainda não há comparação justa"}</h3>
              <p>{data.ranking.length ? explanation?.facts ?? `Em ${data.selectedPeriod}, ${data.ranking.map((row) => `${row.territory}: ${format(row.value, data.indicator.unit)}`).join("; ")}.` : data.rankingReason}</p>
              {data.ranking.length ? <><p className={styles.gemmaText}>{explaining ? "Gemma 4 está a preparar a explicação…" : explanation?.explanation ?? "O ranking compara a mesma medida, unidade e período."}</p>
                {explanation && <small className={styles.provider}>Explicação: {explanation.provider === "gemini" ? "Gemma 4 via Gemini API" : explanation.provider === "ollama" ? "Gemma 4 via Ollama" : "texto verificado"}</small>}
                <ol>{data.ranking.map((rank) => <li key={rank.territoryId}><span>{rank.rank}. {rank.territory}</span><strong>{format(rank.value, data.indicator.unit)}</strong></li>)}</ol></>
                : <div className={styles.waiting}>Consulta os valores em falta para poder comparar todos no mesmo período.</div>}</article>
          </div>
          <article className={styles.timelinePanel}><div className={styles.chartHead}><div><span>EVOLUÇÃO</span><h3>Períodos verificados</h3></div><span>{data.periods.length} {data.periods.length === 1 ? "período" : "períodos"}</span></div>
            {timeline.length >= 2 ? <div className={styles.lineChart}><ResponsiveContainer width="100%" height="100%"><LineChart data={timeline} margin={{ left: 0, top: 15, right: 14, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--linha)"/><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "var(--tinta-2)", fontSize: 12 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--tinta-2)", fontSize: 12 }} width={50}/><Tooltip formatter={(value) => format(value == null ? null : Number(value), data.indicator.unit)}/>{data.territories.map((city) => <Line key={city.id} type="linear" dataKey={city.id} name={city.name} stroke={cityColor(city.id)} strokeWidth={3} dot={{ r: 4 }} connectNulls={false}/>)}</LineChart></ResponsiveContainer></div> : <div className={styles.emptyChart}>É preciso ter pelo menos dois períodos verificados para desenhar uma tendência.</div>}
            <div className={styles.legend}>{data.territories.map((city) => <span key={city.id}><i style={{ background: cityColor(city.id) }}/>{city.name}</span>)}</div></article>
          <article className={styles.tablePanel}><div className={styles.chartHead}><div><span>PROVA-ME ISSO</span><h3>Observações e fontes</h3></div><ShieldCheck size={19}/></div>
            <div className={styles.tableScroll}><table><thead><tr><th>Município</th>{data.periods.map((period) => <th key={period.periodCode}>{period.period}</th>)}<th>Código INE</th></tr></thead>
              <tbody>{data.territories.map((city) => <tr key={city.id}><td><i style={{ background: cityColor(city.id) }}/>{city.name}</td>{data.periods.map((period) => { const cell = period.cells.find((item) => item.territoryId === city.id); return <td key={period.periodCode}>{cell?.sourceUrl ? <a href={cell.sourceUrl} target="_blank" rel="noreferrer">{format(cell.value, data.indicator.unit)} <ExternalLink size={12}/></a> : <span className={styles.missing}>Sem dado</span>}</td>; })}<td>{city.id}</td></tr>)}</tbody></table></div>
            <div className={styles.tableFoot}><span>Fonte: Instituto Nacional de Estatística. Valores e períodos alinhados antes do ranking.</span><a href={data.indicator.sourceUrl} target="_blank" rel="noreferrer">Metainformação oficial <ArrowUpRight size={13}/></a></div></article>
        </>}
      </div>
    </section>
    <footer className={styles.footer}><span>Um projeto <a href="https://fullgrip.ai/" target="_blank" rel="noreferrer">FullGrip.ai</a>. Projeto independente, não afiliado ao Instituto Nacional de Estatística.</span><span>Open source · MIT · Dados INE</span></footer>
  </main>;
}

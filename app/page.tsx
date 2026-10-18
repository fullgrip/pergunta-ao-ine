"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BarChart3, Check, ExternalLink, Link2, LoaderCircle, MapPin, Search, ShieldCheck, Sparkles, BookOpen, Home as HomeIcon, Euro, Users, Sun, Briefcase, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AnswerHero, { type AnswerStage } from "@/components/answer/AnswerHero";
import EverydayView from "@/components/answer/EverydayView";
import { everydayView } from "@/lib/everyday";
import { followUpQuestions } from "@/lib/followups";
import { englishError, indicatorName, indicatorUnit, isLang, periodLabel, type Lang } from "@/lib/i18n";
import ExplanationPanel, { explanationProviderLabel, type Explanation, type ResponseTone } from "@/components/explain/ExplanationPanel";
import HomeCityStrip from "@/components/home/HomeCityStrip";
import MunicipalitySelector from "@/components/municipality/MunicipalitySelector";
import MobileMenu from "@/components/layout/MobileMenu";
import { getMunicipalityById, municipalitySlug } from "@/lib/municipalities";

type Answer = { question: string; summary: string; territoryIds?: string[]; mode: "live" | "snapshot"; snapshotDate?: string | null; analysisId?: string; explanation?: Explanation; provider?: string; homologousComparison?: { previous: { period: string; value: number }; current: { period: string; value: number }; percentagePointChange: number } | null; indicator: { id: string; name: string; shortName: string; unit: string; dimensionDescription: string }; observations: Array<{ territory: string; period: string; value: number | null; displayValue: string }>; summaries: Array<{ territory: string; first?: { period: string; value: number | null }; last?: { period: string; value: number | null }; absolute?: number | null; percent?: number | null }>; sources: Array<{ name: string; url: string; dataUrl: string; indicatorId: string }>; warnings: string[]; extractedAt?: string; lastUpdated?: string; model: string };
// Um exemplo por tema, escrito como as pessoas perguntam: mostram de uma vez tudo o que a app sabe responder.
const EXAMPLES_EN = [
  { q: "How much is rent in Portimão?", Icon: HomeIcon, theme: "rendas" },
  { q: "How much do people earn in Faro?", Icon: Euro, theme: "ganho" },
  { q: "How many people live in Lagos?", Icon: Users, theme: "populacao" },
  { q: "Are there many tourists in Albufeira?", Icon: Sun, theme: "turismo" },
  { q: "Is unemployment high in the Algarve?", Icon: Briefcase, theme: "desemprego" },
  { q: "How much waste is produced in Tavira?", Icon: Trash2, theme: "lixo" },
  { q: "Are there many houses in Portimão?", Icon: HomeIcon, theme: "casas" },
  { q: "Is Faro safe?", Icon: ShieldCheck, theme: "crime" },
  { q: "How much does it cost to buy a house in Lagos?", Icon: Euro, theme: "compra" },
  { q: "Are there many elderly people in Tavira?", Icon: Users, theme: "idosos" },
];
const EXAMPLES = [
  { q: "Quanto custa arrendar em Portimão?", Icon: HomeIcon, theme: "rendas" },
  { q: "Quanto se ganha em Faro?", Icon: Euro, theme: "ganho" },
  { q: "Quantas pessoas vivem em Lagos?", Icon: Users, theme: "populacao" },
  { q: "Há muitos turistas em Albufeira?", Icon: Sun, theme: "turismo" },
  { q: "Como está o desemprego no Algarve?", Icon: Briefcase, theme: "desemprego" },
  { q: "Quanto lixo se produz em Tavira?", Icon: Trash2, theme: "lixo" },
  { q: "Há muitas casas em Portimão?", Icon: HomeIcon, theme: "casas" },
  { q: "É seguro viver em Faro?", Icon: ShieldCheck, theme: "crime" },
  { q: "Quanto custa comprar casa em Lagos?", Icon: Euro, theme: "compra" },
  { q: "Há muitos idosos em Tavira?", Icon: Users, theme: "idosos" },
];
type Health = { ollama: { available: boolean; modelAvailable: boolean; model: string }; ine: { available: boolean | null; checked: boolean } };
const fmt = (n: number | null | undefined, unit: string, lang: "pt" | "en" = "pt") => n == null ? "—" : `${new Intl.NumberFormat(lang === "en" ? "en-GB" : "pt-PT", { maximumFractionDigits: unit === "pessoas" || unit === "people" ? 0 : 2, useGrouping: "always" }).format(n)} ${unit}`;
const shortPeriod = (period: string) => { const quarter = period.match(/([1-4])\.?º?\s*trimestre\s+de\s+(\d{4})/i); return quarter ? `T${quarter[1]}/${quarter[2].slice(2)}` : period; };
function calculationDescription(answer: Answer, item: Answer["summaries"][number]) {
  if (answer.indicator.id === "0012136") {
    const comparison = answer.homologousComparison;
    if (!comparison) return "São necessários dois valores do mesmo trimestre, em anos diferentes, para calcular uma variação homóloga.";
    const difference = comparison.percentagePointChange;
    return `${fmt(comparison.current.value, "%")} (${comparison.current.period}) − ${fmt(comparison.previous.value, "%")} (${comparison.previous.period}) = ${difference >= 0 ? "+" : ""}${difference.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} p.p. de variação homóloga.`;
  }
  if (item.first?.value == null || item.last?.value == null || item.absolute == null) return "Dados insuficientes para calcular a variação.";
  return `${fmt(item.last.value, answer.indicator.unit)} (${item.last.period}) − ${fmt(item.first.value, answer.indicator.unit)} (${item.first.period}) = ${fmt(item.absolute, answer.indicator.unit === "%" ? "p.p." : answer.indicator.unit)}; variação ${item.percent == null ? "indefinida" : `${item.percent.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`}.`;
}
export default function Home() {
  const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState<Answer | null>(null); const [heroExplanation, setHeroExplanation] = useState<Explanation | null>(null); const [error, setError] = useState(""); const [guidance, setGuidance] = useState(false); const [busy, setBusy] = useState(false); const [stage, setStage] = useState<AnswerStage>("interpret"); const [dataSource, setDataSource] = useState<"snapshot" | "ine" | undefined>(); const [selectedTone, setSelectedTone] = useState<ResponseTone>("direct"); const [health, setHealth] = useState<Health | null>(null); const [activeGeneration, setActiveGeneration] = useState<{ provider?: string; model?: string }>({});
  const [municipalityId, setMunicipalityId] = useState<string | null>(null);
  // Língua da página: ?lang=en ou a última escolha; o servidor responde na mesma língua.
  const [lang, setLangState] = useState<Lang>("pt");
  const L = (pt: string, en: string) => lang === "en" ? en : pt;
  // Um link partilhado traz ?q=pergunta&lang=en&m=município: a página abre já com a resposta.
  const [sharedQuestion, setSharedQuestion] = useState<{ q: string; m?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let initial: Lang = "pt";
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("lang"); const stored = localStorage.getItem("pergunta-ao-ine:lang");
      initial = isLang(fromUrl) ? fromUrl : isLang(stored) ? stored : "pt";
      const q = params.get("q")?.trim();
      if (q && q.length >= 3) setSharedQuestion({ q: q.slice(0, 500), m: params.get("m") ?? undefined });
    } catch { /* fica em português, sem pergunta */ }
    setLangState(initial);
  }, []);
  useEffect(() => { document.documentElement.lang = lang === "en" ? "en-GB" : "pt-PT"; }, [lang]);
  function setLang(next: Lang) { setLangState(next); try { localStorage.setItem("pergunta-ao-ine:lang", next); } catch { /* sem armazenamento */ } setAnswer(null); setError(""); setGuidance(false); setQuestion(""); try { window.history.replaceState(null, "", window.location.pathname + (next === "en" ? "?lang=en" : "")); } catch { /* sem history */ } }
  const guidanceRef = useRef<HTMLElement | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const proofRef = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => { if (guidance) guidanceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [guidance]);
  useEffect(() => { const stored = localStorage.getItem("pergunta-ao-ine:municipality"); if (stored && getMunicipalityById(stored)) setMunicipalityId(stored); }, []);
  function selectMunicipality(id: string) { setMunicipalityId(id); localStorage.setItem("pergunta-ao-ine:municipality", id); }
  useEffect(() => { if (busy || answer) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [busy, answer]);
  const onActiveProviderChange = useCallback((provider?: string, model?: string) => setActiveGeneration((current) => current.provider === provider && current.model === model ? current : { provider, model }), []);
  const onExplanationChange = useCallback((explanation: Explanation) => setHeroExplanation(explanation), []);
  async function ask(value = question, municipalityOverride?: string) {
    if (!value.trim() || busy) return;
    const askedMunicipality = municipalityOverride ?? municipalityId;
    setQuestion(value); setBusy(true); setStage("interpret"); setDataSource(undefined); setError(""); setGuidance(false); setAnswer(null); setHeroExplanation(null); setActiveGeneration({});
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ question: value, lang, ...(askedMunicipality ? { municipalityId: askedMunicipality } : {}) }) });
      if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        const body = await response.json();
        if (body.guidance === "city-choice") { setGuidance(true); return; }
        throw new Error(body.error ?? "Não foi possível responder.");
      }
      if (!response.body) throw new Error("A ligação à resposta foi interrompida.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { done, value: chunk } = await reader.read();
        buffer += decoder.decode(chunk, { stream: !done });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = frame.match(/^event: (.+)$/m)?.[1];
          const payload = frame.match(/^data: (.+)$/m)?.[1];
          if (event && payload) {
            const body = JSON.parse(payload);
            if (event === "stage") { setStage(body.stage); setDataSource(body.source); }
            if (event === "error") throw new Error(body.error ?? "Não foi possível responder.");
            if (event === "result") { setAnswer(body); setCopied(false); try { const url = new URL(window.location.href); const linkMunicipality = body.territoryIds?.length === 1 && getMunicipalityById(body.territoryIds[0]) ? body.territoryIds[0] : askedMunicipality; url.search = new URLSearchParams({ q: value, lang, ...(linkMunicipality ? { m: linkMunicipality } : {}) }).toString(); window.history.replaceState(null, "", url); } catch { /* o endereço fica como estava */ } setHeroExplanation(body.explanation ?? null); setActiveGeneration({ provider: body.explanation?.provider ?? body.provider, model: body.explanation?.model ?? body.model }); if (body.territoryIds?.length === 1 && getMunicipalityById(body.territoryIds[0])) selectMunicipality(body.territoryIds[0]); completed = true; }
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (!completed) throw new Error("A resposta terminou antes de chegar a conclusão.");
    }
    catch (e) { const message = e instanceof Error ? e.message : "Erro inesperado."; setError(lang === "en" ? englishError(message) : message); }
    finally { setBusy(false); }
  }
  // Abre a pergunta do link uma vez, já com a língua certa.
  useEffect(() => {
    if (!sharedQuestion) return;
    const { q, m } = sharedQuestion;
    setSharedQuestion(null);
    if (m && getMunicipalityById(m)) selectMunicipality(m);
    void ask(q, m && getMunicipalityById(m) ? m : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedQuestion, lang]);
  async function copyLink() {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); }
    catch { const field = document.createElement("textarea"); field.value = url; document.body.appendChild(field); field.select(); try { document.execCommand("copy"); } finally { field.remove(); } }
    setCopied(true); window.setTimeout(() => setCopied(false), 2500);
  }
  useEffect(() => { fetch("/api/health?scope=ollama").then((r) => r.json()).then(setHealth).catch(() => undefined); }, []);
  const chartData = answer ? [...new Map(answer.observations.map((row) => [row.period, row.period])).keys()].map((periodo) => ({ periodo, ...Object.fromEntries(answer.observations.filter((row) => row.period === periodo).map((row) => [row.territory, row.value])) })) : [];
  const territories = [...new Set(answer?.observations.map((row) => row.territory) ?? [])];
  const cityColors: Record<string, string> = { "Portimão": "var(--cidade-portimao)", Faro: "var(--cidade-faro)", Lagos: "var(--cidade-lagos)", Albufeira: "var(--cidade-albufeira)", Algarve: "var(--mar)" };
  const actualProvider = activeGeneration.provider ?? answer?.explanation?.provider ?? answer?.provider;
  const reportedUpdate = answer?.lastUpdated?.trim();
  const validReportedUpdate = reportedUpdate && !/^(ver fonte|data n[aã]o indicada)$/i.test(reportedUpdate) ? reportedUpdate : null;
  const lastUpdatedLabel = validReportedUpdate ?? (answer?.mode === "snapshot" && answer.snapshotDate ? `Snapshot de ${answer.snapshotDate}` : null);
  const directExplanation: Explanation | null = answer ? answer.explanation ?? { tone: "direct", headline: answer.indicator.shortName, summary: answer.summary, detail: answer.summary, caveat: null, title: answer.indicator.shortName, body: answer.summary, evidenceId: answer.analysisId ?? "", provider: answer.provider, model: answer.model } : null;
  return <main className="shell">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><BarChart3 size={19} strokeWidth={2.5}/></span>{lang === "en" ? <span>Ask<span className="brand-muted"> INE</span></span> : <span>Pergunta<span className="brand-muted"> ao INE</span></span>}</Link><nav className="site-nav" aria-label={L("Navegação principal", "Main navigation")}><Link href="/">{L("Perguntar", "Ask")}</Link><Link href="/explorar">{L("Explorar cidades", "Explore towns")}</Link><Link href="/comparar">{L("Comparar cidades", "Compare towns")}</Link><Link href="/descobertas">{L("Descobertas", "Discoveries")}</Link><Link href="/sobre">{L("Sobre o projeto", "About")}</Link></nav><div className="lang-toggle" role="group" aria-label="Língua / Language"><button type="button" aria-pressed={lang === "pt"} onClick={() => setLang("pt")}>PT</button><button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button></div><MobileMenu/><span className="health-button" title={actualProvider ? explanationProviderLabel(actualProvider) : "Estado do modelo local"}><span className={actualProvider === "gemini" || actualProvider === "ollama" || (!actualProvider && health?.ollama.modelAvailable) ? "live-dot" : "warn-dot"}/><span className="health-label">{actualProvider ? explanationProviderLabel(actualProvider) : health?.ollama.modelAvailable ? L("Gemma local disponível", "Local Gemma ready") : "Gemma 4"}</span></span></header>
    <section className="hero hero-photo"><div className="eyebrow"><Sparkles size={14}/> {L("DADOS OFICIAIS, EXPLICAÇÕES CLARAS", "OFFICIAL DATA, CLEARLY EXPLAINED")}</div><h1>{L("Pergunta ao INE", "Ask INE")}<span className="period">.</span></h1><h2 className="hero-subtitle">{lang === "en" ? <>Ask about any Portuguese town. Get the official numbers, <mark>explained</mark>.</> : <>Pergunta sobre a tua terra. Recebe os números oficiais, <mark>explicados</mark>.</>}</h2>
      <form className="search-card" onSubmit={(e) => { e.preventDefault(); void ask(); }}><div className="search-input-row"><Search size={19}/><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={L("Ex.: quanto custa arrendar em Faro?", "E.g. how much is rent in Faro?")} maxLength={500} aria-label={L("Pergunta ao INE", "Ask INE")}/><span className="key-hint">↵</span></div><div className="search-footer"><div className="privacy-note"><span className="lock-mark"><ShieldCheck size={14}/></span>{L("Gemma 4 explica · INE fornece os dados", "Gemma 4 explains · INE provides the data")}</div><button className="ask-button" disabled={busy || question.trim().length < 3}>{busy ? <><LoaderCircle className="spin" size={16}/> {L("A consultar", "Asking")}</> : <>{L("Perguntar", "Ask")} <ArrowUpRight size={16}/></>}</button></div></form>
      <div className="examples"><span>{L("EXPERIMENTA", "TRY")}</span>{(lang === "en" ? EXAMPLES_EN : EXAMPLES).map(({ q, Icon, theme }) => <button key={q} data-theme-chip={theme} onClick={() => void ask(q)}><Icon size={14} aria-hidden/>{q}</button>)}</div>
      <details className="home-municipality-toggle"><summary><MapPin size={14}/> {municipalityId && getMunicipalityById(municipalityId) ? `${L("A tua terra", "Your town")}: ${getMunicipalityById(municipalityId)!.name}` : L("Escolher a tua terra (opcional)", "Choose your town (optional)")}</summary><div className="home-municipality"><MunicipalitySelector value={municipalityId} onChange={(municipality) => selectMunicipality(municipality.id)} label={L("Município usado quando a pergunta não diz qual", "Town used when the question doesn’t name one")} /></div></details>
      <a className="hero-photo-credit" href="https://commons.wikimedia.org/wiki/File:Praia_da_Rocha,_Portim%C3%A3o.jpg" target="_blank" rel="noreferrer">{L("Foto", "Photo")}: Praia da Rocha, Portimão · Steven Fruitsmaak · CC BY-SA 3.0</a>
    </section>
    {busy && <section className="answer-area" ref={resultRef}><AnswerHero question={question} loading stage={stage} source={dataSource} lang={lang}/></section>}
    {error && <section className="answer-area" ref={resultRef}><AnswerHero question={question} failureHeadline={/valores num[eé]ricos|dados insuficientes|observa[cç][aã]o|returned no values/i.test(error) ? L("Não é possível concluir com os dados disponíveis.", "The available data isn’t enough to answer.") : L("Não foi possível responder.", "I couldn’t answer that.")} failureReason={error} lang={lang}/></section>}
    {guidance && <section className="guidance-card" role="status" ref={guidanceRef}><span className="guidance-icon"><MapPin size={19}/></span><div><strong>{L("O que valorizas para viver numa cidade?", "What matters to you in a place to live?")}</strong><p>{L("Não há uma cidade “melhor” para toda a gente. Com os dados já verificados, podes comparar a renda mediana de novos contratos em Portimão, Faro, Lagos e Albufeira. Isso mostra apenas uma parte da decisão; não temos dados suficientes para recomendar onde viver.", "There is no “best” town for everyone. With verified data you can compare the median rent of new leases in Portimão, Faro, Lagos and Albufeira. That is only part of the decision; there isn’t enough data to recommend where to live.")}</p><div className="guidance-actions"><Link href="/comparar">{L("Comparar rendas das quatro cidades", "Compare rent in the four towns")} <ArrowUpRight size={14}/></Link><button type="button" onClick={() => void ask(L("Como evoluíram as rendas em Portimão?", "How has rent changed in Portimão?"))}>{L("Ver a evolução em Portimão", "See the trend in Portimão")} <ArrowUpRight size={14}/></button></div></div></section>}
    {answer && directExplanation && <section className="answer-area" ref={resultRef}>
      <AnswerHero question={answer.question} explanation={heroExplanation ?? directExplanation} tone={selectedTone} lang={lang}/>
      <div className="answer-kpis">{answer.summaries.filter((item) => item.last?.value != null).map((item) => { const change = answer.indicator.id === "0012136" ? answer.homologousComparison?.percentagePointChange ?? null : item.percent ?? null; const unitChange = answer.indicator.id === "0012136" ? " p.p." : " %"; return <article key={item.territory} className="answer-kpi"><span className="answer-kpi-place"><MapPin size={13}/>{item.territory}</span><strong>{fmt(item.last!.value, indicatorUnit(answer.indicator.id, answer.indicator.unit, lang), lang)}</strong><span className="answer-kpi-period">{indicatorName(answer.indicator.id, answer.indicator.shortName, lang)} · {periodLabel(item.last!.period, lang)}</span>{change != null && item.first?.period !== item.last?.period && <span className={change >= 0 ? "answer-kpi-change up" : "answer-kpi-change down"}>{change >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}{change >= 0 ? "+" : ""}{change.toLocaleString(lang === "en" ? "en-GB" : "pt-PT", { maximumFractionDigits: 1 })}{unitChange} {answer.indicator.id === "0012136" ? L("face ao ano anterior", "vs a year earlier") : `${L("desde", "since")} ${periodLabel(item.first?.period ?? "", lang)}`}</span>}</article>; })}</div>
      <EverydayView view={everydayView(answer, lang)} lang={lang}/>
      {answer.territoryIds?.length === 1 && getMunicipalityById(answer.territoryIds[0]) && <nav className="answer-next" aria-label={L("Continuar", "Continue")}><Link href={`/cidade/${municipalitySlug(getMunicipalityById(answer.territoryIds[0])!)}`}><MapPin size={14}/> {L("Ver tudo sobre", "Everything about")} {getMunicipalityById(answer.territoryIds[0])!.name} <ArrowUpRight size={14}/></Link><Link href="/comparar"><BarChart3 size={14}/> {L("Comparar com outra cidade", "Compare with another town")} <ArrowUpRight size={14}/></Link></nav>}
      <div className="answer-followups" aria-label={L("Perguntas seguintes", "Next questions")}><span>{L("E A SEGUIR?", "WHAT NEXT?")}</span>{followUpQuestions({ indicatorId: answer.indicator.id, territories: answer.summaries.map((item) => item.territory) }, lang).map((item) => <button key={item} type="button" onClick={() => void ask(item)}>{item} <ArrowUpRight size={13}/></button>)}<button type="button" className="answer-share" onClick={() => void copyLink()}>{copied ? <><Check size={14}/> {L("Link copiado", "Link copied")}</> : <><Link2 size={14}/> {L("Copiar link desta resposta", "Copy link to this answer")}</>}</button></div>
      <details className="answer-tones" open><summary>🎭 {L("Explica-me de outra maneira", "Explain it another way")} <span aria-hidden>🤙 🎯 🧑‍🏫 😏 📰 💼 🔬</span></summary>
      <ExplanationPanel key={answer.analysisId ?? answer.question} lang={lang} analysisId={answer.analysisId} initialExplanation={directExplanation} onActiveProviderChange={onActiveProviderChange} onToneChange={setSelectedTone} onExplanationChange={onExplanationChange} onShowEvidence={() => { if (proofRef.current) { proofRef.current.open = true; proofRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } }}/>
      </details>
      <article className="panel chart-panel answer-chart"><div className="panel-head"><div><h3>{chartData.length >= 2 ? L("Evolução", "Trend") + ": " + indicatorName(answer.indicator.id, answer.indicator.shortName, lang).toLowerCase() : L("Valor observado", "Observed value")}</h3><p>{chartData.length >= 2 ? L("Períodos verificados", "Verified periods") + ": " + periodLabel(chartData[0].periodo, lang) + L(" a ", " to ") + periodLabel(chartData.at(-1)?.periodo ?? "", lang) : chartData[0]?.periodo ?? L("Sem observações", "No values")}</p></div><span className="unit-pill">{indicatorUnit(answer.indicator.id, answer.indicator.unit, lang)}</span></div>{chartData.length >= 2 ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 3 }}><CartesianGrid stroke="var(--linha)" vertical={false}/><XAxis dataKey="periodo" tickFormatter={shortPeriod} interval={0} minTickGap={0} angle={-40} textAnchor="end" height={48} tickMargin={8} tickLine={false} axisLine={false} tick={{ fill: "var(--tinta-2)", fontSize: 12 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--tinta-2)", fontSize: 12 }} width={48}/><Tooltip formatter={(v) => fmt(Number(v), answer.indicator.unit)} contentStyle={{ border: "1px solid var(--linha)", borderRadius: 14, boxShadow: "var(--sombra)" }}/>{territories.map((territory) => <Line key={territory} name={territory} type="monotone" dataKey={territory} stroke={cityColors[territory] ?? "var(--pinho)"} strokeWidth={2.5} dot={{ r: 3, fill: cityColors[territory] ?? "var(--pinho)", strokeWidth: 0 }}/>)}</LineChart></ResponsiveContainer></div> : <div className="answer-single-point"><strong>{chartData.length === 1 ? fmt(answer.observations[0]?.value, indicatorUnit(answer.indicator.id, answer.indicator.unit, lang), lang) : L("Sem observações", "No values")}</strong><p>{L("Há apenas um período verificado; não é possível desenhar uma evolução.", "Only one period is available, so there is no trend to draw.")}</p></div>}<div className="legend">{territories.map((name) => <span key={name}><i style={{ background: cityColors[name] ?? "var(--pinho)" }}/>{name}</span>)}</div><p className="answer-chart-source">{L("Fonte", "Source")}: Instituto Nacional de Estatística (INE). <a href={answer.sources[0].url} target="_blank" rel="noreferrer">{L("Definição do indicador", "Indicator definition")} <ExternalLink size={12}/></a></p></article>
      <div className="answer-disclosures" aria-label={L("Fontes e detalhes estatísticos", "Sources and details")}>
        <details><summary>{L("Ver mais dados", "See all the data")} <span>{answer.observations.length} {L("observações", "values")}</span></summary><div className="answer-disclosure-content"><div className="stat-row">{answer.summaries.map((item) => <article className="stat-card" key={item.territory}><span className="stat-label"><MapPin size={13}/>{item.territory}</span><strong>{fmt(item.last?.value, answer.indicator.unit)}</strong><span className="stat-period">{item.last?.period ?? "Sem observações"}</span></article>)}</div><div className="table-scroll"><table><thead><tr><th>{L("Território", "Place")}</th><th>{L("Período", "Period")}</th><th>{L("Valor", "Value")}</th><th>{L("Unidade", "Unit")}</th></tr></thead><tbody>{answer.observations.map((row, i) => <tr key={row.territory + "-" + row.period + "-" + i}><td><MapPin size={13}/>{row.territory}</td><td>{row.period}</td><td className={row.value === null ? "missing-value" : "value-cell"}>{row.displayValue}</td><td>{answer.indicator.unit}</td></tr>)}</tbody></table></div></div></details>
        <details><summary>{L("Como foi calculado?", "How was it calculated?")}</summary><div className="answer-disclosure-content"><p>{answer.indicator.dimensionDescription}</p>{answer.summaries.map((item) => <p key={item.territory}><strong>{item.territory}:</strong> {calculationDescription(answer, item)}</p>)}{answer.homologousComparison && <p>A variação do desemprego compara o mesmo trimestre em anos diferentes.</p>}</div></details>
        <details ref={proofRef} id="answer-evidence"><summary>{L("Prova-me isso", "Prove it")} <span>{L("Fontes INE", "INE sources")}</span></summary><div className="answer-disclosure-content"><p><strong>{L("Indicador oficial", "Official indicator (in Portuguese)")}:</strong> {answer.indicator.name} · {answer.indicator.id}</p><p><strong>Unidade:</strong> {answer.indicator.unit}</p>{lastUpdatedLabel && <p><strong>{validReportedUpdate ? "Última atualização INE:" : "Data do snapshot:"}</strong> {lastUpdatedLabel}</p>}<p><strong>{L("Origem da explicação", "Explanation written by")}:</strong> {explanationProviderLabel(actualProvider)}{activeGeneration.model ? " · " + activeGeneration.model : ""}</p><p><strong>Dados:</strong> {answer.mode === "snapshot" ? "snapshot oficial recolhido em " + answer.snapshotDate : "consulta ao INE em " + (answer.extractedAt ? new Date(answer.extractedAt).toLocaleString("pt-PT") : "tempo real")}</p>{answer.warnings.map((warning) => <p key={warning} className="answer-warning">{warning}</p>)}<a href={answer.sources[0].url} target="_blank" rel="noreferrer">{L("Metainformação oficial", "Official metadata")} <ExternalLink size={13}/></a><a href={answer.sources[0].dataUrl} target="_blank" rel="noreferrer">{L("Pedido à API do INE", "INE API request")} <ExternalLink size={13}/></a><p className="answer-attribution">{L("Aplicam-se as condições de reutilização e atribuição do INE.", "INE reuse and attribution terms apply.")}</p></div></details>
      </div>
    </section>}
    {!answer && !busy && !error && !guidance && <><HomeCityStrip/><section className="origin-section"><div><div className="eyebrow"><BookOpen size={15}/> {L("A HISTÓRIA DE ORIGEM", "HOW IT STARTED")}</div><h2>{L("Uma pergunta sobre arrendar em Portimão.", "A question about renting in Portimão.")}</h2><p>{L("Tudo começou com uma pergunta simples. Queria arrendar um apartamento em Portimão e perceber qual seria um preço de referência para o mercado local.", "It started with a simple question: I wanted to rent a flat in Portimão and know what a fair price looks like.")}</p><p>{L("Os dados públicos existiam, mas encontrar o indicador adequado e compreender o que significava exigia mais trabalho do que esperava. E se pudesse simplesmente perguntar?", "The public data existed, but finding the right indicator and understanding it took more work than expected. What if you could just ask?")}</p><p>{L("Foi assim que nasceu o Pergunta ao INE: uma ferramenta open source que aproxima as pessoas das estatísticas oficiais, em qualquer município português.", "That is how Ask INE was born: an open-source tool that brings official statistics closer to people, for any Portuguese municipality.")}</p><Link href="/sobre">{L("Conhece o projeto", "About the project")} <ArrowUpRight size={15}/></Link></div><aside><span>{L("EXPERIMENTA UMA PERGUNTA REAL", "TRY A REAL QUESTION")}</span><h3>{L("Qual é a renda mediana em Portimão?", "What is the median rent in Portimão?")}</h3><p>{L("O indicador mede a mediana por metro quadrado nos novos contratos de arrendamento. Não avalia um apartamento específico nem determina o preço correto de um T2.", "It measures the median per square metre of new leases. It doesn’t value a specific flat or set the right price for one.")}</p><button onClick={() => void ask(L("Qual é a renda mediana em Portimão?", "What is the median rent in Portimão?"))}>{L("Explorar com dados oficiais", "Explore the official data")} <ArrowUpRight size={15}/></button></aside></section></>}

    <footer><span>{L("Um projeto", "A project by")} <a href="https://fullgrip.ai/" target="_blank" rel="noreferrer">FullGrip.ai</a> {L("para tornar os dados públicos mais acessíveis. Projeto independente, não afiliado ao Instituto Nacional de Estatística.", "to make public data easier to use. Independent project, not affiliated with Statistics Portugal (INE).")}</span><span>{L("Informação, não aconselhamento.", "Information, not advice.")} <Link href="/aviso-legal">{L("Aviso legal", "Disclaimer")}</Link> <b>·</b> Open source <b>·</b> MIT <b>·</b> {L("Dados INE", "INE data")}</span></footer>
  </main>;
}

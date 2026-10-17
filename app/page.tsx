"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BarChart3, ExternalLink, LoaderCircle, MapPin, Search, ShieldCheck, Sparkles, BookOpen } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AnswerHero, { type AnswerStage } from "@/components/answer/AnswerHero";
import ExplanationPanel, { explanationProviderLabel, type Explanation, type ResponseTone } from "@/components/explain/ExplanationPanel";
import HomeCityStrip from "@/components/home/HomeCityStrip";
import MunicipalitySelector from "@/components/municipality/MunicipalitySelector";
import MobileMenu from "@/components/layout/MobileMenu";
import { getMunicipalityById, municipalitySlug } from "@/lib/municipalities";

type Answer = { question: string; summary: string; territoryIds?: string[]; mode: "live" | "snapshot"; snapshotDate?: string | null; analysisId?: string; explanation?: Explanation; provider?: string; homologousComparison?: { previous: { period: string; value: number }; current: { period: string; value: number }; percentagePointChange: number } | null; indicator: { id: string; name: string; shortName: string; unit: string; dimensionDescription: string }; observations: Array<{ territory: string; period: string; value: number | null; displayValue: string }>; summaries: Array<{ territory: string; first?: { period: string; value: number | null }; last?: { period: string; value: number | null }; absolute?: number | null; percent?: number | null }>; sources: Array<{ name: string; url: string; dataUrl: string; indicatorId: string }>; warnings: string[]; extractedAt?: string; lastUpdated?: string; model: string };
// Um exemplo por tema, escrito como as pessoas perguntam: mostram de uma vez tudo o que a app sabe responder.
const EXAMPLES = ["Quanto custa arrendar em Portimão?", "Quanto se ganha em Faro?", "Quantas pessoas vivem em Lagos?", "Há muitos turistas em Albufeira?", "Como está o desemprego no Algarve?", "Quanto lixo se produz em Tavira?"];
type Health = { ollama: { available: boolean; modelAvailable: boolean; model: string }; ine: { available: boolean | null; checked: boolean } };
const fmt = (n: number | null | undefined, unit: string) => n == null ? "—" : `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: unit === "pessoas" ? 0 : 2 }).format(n)} ${unit}`;
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
  const guidanceRef = useRef<HTMLElement | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const proofRef = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => { if (guidance) guidanceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [guidance]);
  useEffect(() => { const stored = localStorage.getItem("pergunta-ao-ine:municipality"); if (stored && getMunicipalityById(stored)) setMunicipalityId(stored); }, []);
  function selectMunicipality(id: string) { setMunicipalityId(id); localStorage.setItem("pergunta-ao-ine:municipality", id); }
  useEffect(() => { if (busy || answer) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [busy, answer]);
  const onActiveProviderChange = useCallback((provider?: string, model?: string) => setActiveGeneration((current) => current.provider === provider && current.model === model ? current : { provider, model }), []);
  const onExplanationChange = useCallback((explanation: Explanation) => setHeroExplanation(explanation), []);
  async function ask(value = question) {
    if (!value.trim() || busy) return;
    setQuestion(value); setBusy(true); setStage("interpret"); setDataSource(undefined); setError(""); setGuidance(false); setAnswer(null); setHeroExplanation(null); setActiveGeneration({});
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ question: value, ...(municipalityId ? { municipalityId } : {}) }) });
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
            if (event === "result") { setAnswer(body); setHeroExplanation(body.explanation ?? null); setActiveGeneration({ provider: body.explanation?.provider ?? body.provider, model: body.explanation?.model ?? body.model }); if (body.territoryIds?.length === 1 && getMunicipalityById(body.territoryIds[0])) selectMunicipality(body.territoryIds[0]); completed = true; }
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (!completed) throw new Error("A resposta terminou antes de chegar a conclusão.");
    }
    catch (e) { setError(e instanceof Error ? e.message : "Erro inesperado."); }
    finally { setBusy(false); }
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
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><BarChart3 size={19} strokeWidth={2.5}/></span><span>Pergunta<span className="brand-muted"> ao INE</span></span></Link><nav className="site-nav" aria-label="Navegação principal"><Link href="/">Perguntar</Link><Link href="/explorar">Explorar cidades</Link><Link href="/comparar">Comparar cidades</Link><Link href="/descobertas">Descobertas</Link><Link href="/sobre">Sobre o projeto</Link></nav><MobileMenu/><span className="health-button" title={actualProvider ? explanationProviderLabel(actualProvider) : "Estado do modelo local"}><span className={actualProvider === "gemini" || actualProvider === "ollama" || (!actualProvider && health?.ollama.modelAvailable) ? "live-dot" : "warn-dot"}/><span className="health-label">{actualProvider ? explanationProviderLabel(actualProvider) : health?.ollama.modelAvailable ? "Gemma local disponível" : "Gemma 4"}</span></span></header>
    <section className="hero"><div className="eyebrow"><Sparkles size={14}/> DADOS OFICIAIS, EXPLICAÇÕES CLARAS</div><h1>Pergunta ao INE<span className="period">.</span></h1><h2 className="hero-subtitle">Pergunta sobre a tua terra. Recebe os números oficiais, explicados.</h2>
      <form className="search-card" onSubmit={(e) => { e.preventDefault(); void ask(); }}><div className="search-input-row"><Search size={19}/><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex.: quanto custa arrendar em Faro?" maxLength={500} aria-label="Pergunta ao INE"/><span className="key-hint">↵</span></div><div className="search-footer"><div className="privacy-note"><span className="lock-mark"><ShieldCheck size={14}/></span>Gemma 4 explica · INE fornece os dados</div><button className="ask-button" disabled={busy || question.trim().length < 3}>{busy ? <><LoaderCircle className="spin" size={16}/> A consultar</> : <>Perguntar <ArrowUpRight size={16}/></>}</button></div></form>
      <div className="examples"><span>EXPERIMENTA</span>{EXAMPLES.map((item) => <button key={item} onClick={() => void ask(item)}>{item}</button>)}</div>
      <details className="home-municipality-toggle"><summary><MapPin size={14}/> {municipalityId && getMunicipalityById(municipalityId) ? `A tua terra: ${getMunicipalityById(municipalityId)!.name}` : "Escolher a tua terra (opcional)"}</summary><div className="home-municipality"><MunicipalitySelector value={municipalityId} onChange={(municipality) => selectMunicipality(municipality.id)} label="Município usado quando a pergunta não diz qual" /></div></details>
    </section>
    {busy && <section className="answer-area" ref={resultRef}><AnswerHero question={question} loading stage={stage} source={dataSource}/></section>}
    {error && <section className="answer-area" ref={resultRef}><AnswerHero question={question} failureHeadline={/valores num[eé]ricos|dados insuficientes|observa[cç][aã]o/i.test(error) ? "Não é possível concluir com os dados disponíveis." : "Não foi possível responder."} failureReason={error}/></section>}
    {guidance && <section className="guidance-card" role="status" ref={guidanceRef}><span className="guidance-icon"><MapPin size={19}/></span><div><strong>O que valorizas para viver numa cidade?</strong><p>Não há uma cidade “melhor” para toda a gente. Com os dados já verificados, podes comparar a renda mediana de novos contratos em Portimão, Faro, Lagos e Albufeira. Isso mostra apenas uma parte da decisão; não temos dados suficientes para recomendar onde viver.</p><div className="guidance-actions"><Link href="/comparar">Comparar rendas das quatro cidades <ArrowUpRight size={14}/></Link><button type="button" onClick={() => void ask("Como evoluíram as rendas em Portimão?")}>Ver a evolução em Portimão <ArrowUpRight size={14}/></button></div></div></section>}
    {answer && directExplanation && <section className="answer-area" ref={resultRef}>
      <AnswerHero question={answer.question} explanation={heroExplanation ?? directExplanation} tone={selectedTone}/>
      {answer.territoryIds?.length === 1 && getMunicipalityById(answer.territoryIds[0]) && <nav className="answer-next" aria-label="Continuar"><Link href={`/cidade/${municipalitySlug(getMunicipalityById(answer.territoryIds[0])!)}`}><MapPin size={14}/> Ver tudo sobre {getMunicipalityById(answer.territoryIds[0])!.name} <ArrowUpRight size={14}/></Link><Link href="/comparar"><BarChart3 size={14}/> Comparar com outra cidade <ArrowUpRight size={14}/></Link></nav>}
      <details className="answer-tones"><summary><Sparkles size={15}/> Explicar de outra forma <span>6 estilos, os mesmos números</span></summary>
      <ExplanationPanel key={answer.analysisId ?? answer.question} analysisId={answer.analysisId} initialExplanation={directExplanation} onActiveProviderChange={onActiveProviderChange} onToneChange={setSelectedTone} onExplanationChange={onExplanationChange} onShowEvidence={() => { if (proofRef.current) { proofRef.current.open = true; proofRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } }}/>
      </details>
      <article className="panel chart-panel answer-chart"><div className="panel-head"><div><h3>{chartData.length >= 2 ? "Evolução: " + answer.indicator.shortName.toLowerCase() : "Valor observado"}</h3><p>{chartData.length >= 2 ? "Períodos verificados: " + chartData[0].periodo + " a " + chartData.at(-1)?.periodo : chartData[0]?.periodo ?? "Sem observações"}</p></div><span className="unit-pill">{answer.indicator.unit}</span></div>{chartData.length >= 2 ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 3 }}><CartesianGrid stroke="var(--linha)" vertical={false}/><XAxis dataKey="periodo" tickFormatter={shortPeriod} interval={0} minTickGap={0} angle={-40} textAnchor="end" height={48} tickMargin={8} tickLine={false} axisLine={false} tick={{ fill: "var(--tinta-2)", fontSize: 12 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--tinta-2)", fontSize: 12 }} width={48}/><Tooltip formatter={(v) => fmt(Number(v), answer.indicator.unit)} contentStyle={{ border: "1px solid var(--linha)", borderRadius: 14, boxShadow: "var(--sombra)" }}/>{territories.map((territory) => <Line key={territory} name={territory} type="monotone" dataKey={territory} stroke={cityColors[territory] ?? "var(--pinho)"} strokeWidth={2.5} dot={{ r: 3, fill: cityColors[territory] ?? "var(--pinho)", strokeWidth: 0 }}/>)}</LineChart></ResponsiveContainer></div> : <div className="answer-single-point"><strong>{chartData.length === 1 ? fmt(answer.observations[0]?.value, answer.indicator.unit) : "Sem observações"}</strong><p>Há apenas um período verificado; não é possível desenhar uma evolução.</p></div>}<div className="legend">{territories.map((name) => <span key={name}><i style={{ background: cityColors[name] ?? "var(--pinho)" }}/>{name}</span>)}</div><p className="answer-chart-source">Fonte: Instituto Nacional de Estatística (INE). <a href={answer.sources[0].url} target="_blank" rel="noreferrer">Definição do indicador <ExternalLink size={12}/></a></p></article>
      <div className="answer-disclosures" aria-label="Fontes e detalhes estatísticos">
        <details><summary>Ver mais dados <span>{answer.observations.length} observações</span></summary><div className="answer-disclosure-content"><div className="stat-row">{answer.summaries.map((item) => <article className="stat-card" key={item.territory}><span className="stat-label"><MapPin size={13}/>{item.territory}</span><strong>{fmt(item.last?.value, answer.indicator.unit)}</strong><span className="stat-period">{item.last?.period ?? "Sem observações"}</span></article>)}</div><div className="table-scroll"><table><thead><tr><th>Território</th><th>Período</th><th>Valor</th><th>Unidade</th></tr></thead><tbody>{answer.observations.map((row, i) => <tr key={row.territory + "-" + row.period + "-" + i}><td><MapPin size={13}/>{row.territory}</td><td>{row.period}</td><td className={row.value === null ? "missing-value" : "value-cell"}>{row.displayValue}</td><td>{answer.indicator.unit}</td></tr>)}</tbody></table></div></div></details>
        <details><summary>Como foi calculado?</summary><div className="answer-disclosure-content"><p>{answer.indicator.dimensionDescription}</p>{answer.summaries.map((item) => <p key={item.territory}><strong>{item.territory}:</strong> {calculationDescription(answer, item)}</p>)}{answer.homologousComparison && <p>A variação do desemprego compara o mesmo trimestre em anos diferentes.</p>}</div></details>
        <details ref={proofRef} id="answer-evidence"><summary>Prova-me isso <span>Fontes INE</span></summary><div className="answer-disclosure-content"><p><strong>Indicador oficial:</strong> {answer.indicator.name} · {answer.indicator.id}</p><p><strong>Unidade:</strong> {answer.indicator.unit}</p>{lastUpdatedLabel && <p><strong>{validReportedUpdate ? "Última atualização INE:" : "Data do snapshot:"}</strong> {lastUpdatedLabel}</p>}<p><strong>Origem da explicação:</strong> {explanationProviderLabel(actualProvider)}{activeGeneration.model ? " · " + activeGeneration.model : ""}</p><p><strong>Dados:</strong> {answer.mode === "snapshot" ? "snapshot oficial recolhido em " + answer.snapshotDate : "consulta ao INE em " + (answer.extractedAt ? new Date(answer.extractedAt).toLocaleString("pt-PT") : "tempo real")}</p>{answer.warnings.map((warning) => <p key={warning} className="answer-warning">{warning}</p>)}<a href={answer.sources[0].url} target="_blank" rel="noreferrer">Metainformação oficial <ExternalLink size={13}/></a><a href={answer.sources[0].dataUrl} target="_blank" rel="noreferrer">Pedido à API do INE <ExternalLink size={13}/></a><p className="answer-attribution">Aplicam-se as condições de reutilização e atribuição do INE.</p></div></details>
      </div>
    </section>}
    {!answer && !busy && !error && !guidance && <><HomeCityStrip/><section className="origin-section"><div><div className="eyebrow"><BookOpen size={15}/> A HISTÓRIA DE ORIGEM</div><h2>Uma pergunta sobre arrendar em Portimão.</h2><p>Tudo começou com uma pergunta simples. Queria arrendar um apartamento em Portimão e perceber qual seria um preço de referência para o mercado local.</p><p>Os dados públicos existiam, mas encontrar o indicador adequado e compreender o que significava exigia mais trabalho do que esperava. E se pudesse simplesmente perguntar?</p><p>Foi assim que nasceu o Pergunta ao INE: uma ferramenta open source que aproxima as pessoas das estatísticas oficiais, em qualquer município português.</p><Link href="/sobre">Conhece o projeto <ArrowUpRight size={15}/></Link></div><aside><span>EXPERIMENTA UMA PERGUNTA REAL</span><h3>Qual é a renda mediana em Portimão?</h3><p>O indicador mede a mediana por metro quadrado nos novos contratos de arrendamento. Não avalia um apartamento específico nem determina o preço correto de um T2.</p><button onClick={() => void ask("Qual é a renda mediana em Portimão?")}>Explorar com dados oficiais <ArrowUpRight size={15}/></button></aside></section></>}

    <footer><span>Um projeto <a href="https://fullgrip.ai/" target="_blank" rel="noreferrer">FullGrip.ai</a> para tornar os dados públicos mais acessíveis. Projeto independente, não afiliado ao Instituto Nacional de Estatística.</span><span>Open source <b>·</b> MIT <b>·</b> Dados INE</span></footer>
  </main>;
}

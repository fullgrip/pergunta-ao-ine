"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BarChart3, ExternalLink, Lightbulb, LoaderCircle, MapPin, Sparkles } from "lucide-react";
import MunicipalitySelector, { readSavedMunicipalityId, saveSelectedMunicipalityId } from "@/components/municipality/MunicipalitySelector";
import ExplanationPanel, { explanationProviderLabel, type Explanation } from "@/components/explain/ExplanationPanel";
import type { Discovery } from "@/lib/analytics/discoveries";
import { getMunicipalityById, municipalitySlug } from "@/lib/municipalities";
import styles from "./DiscoveryView.module.css";
import MobileMenu from "@/components/layout/MobileMenu";

type DiscoveryResult = {
  discovery: Discovery;
  headline: string;
  explanation: string;
  caveat: string | null;
  modelUsed: boolean;
  provider: string;
  evidenceId: string;
  explanationData: Explanation;
  mode: "snapshot" | "live";
  collectedAt: string;
  warnings: string[];
};

function format(value: number, unit: string) {
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: unit === "pessoas" ? 0 : 2 }).format(value)} ${unit}`;
}

export default function DiscoveryView({ initialMunicipalityId }: { initialMunicipalityId: string | null }) {
  const [municipalityId, setMunicipalityId] = useState(initialMunicipalityId ?? "1500811");
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [currentExplanation, setCurrentExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const proofRef = useRef<HTMLDetailsElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const chosen = initialMunicipalityId ?? readSavedMunicipalityId() ?? "1500811";
    setMunicipalityId(chosen);
    saveSelectedMunicipalityId(chosen);
    const url = new URL(window.location.href);
    url.searchParams.set("municipio", chosen);
    window.history.replaceState(null, "", url.toString());
    setReady(true);
  }, [initialMunicipalityId]);

  useEffect(() => { if (result || error) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [result, error]);

  function selectMunicipality(id: string) {
    abortRef.current?.abort();
    setBusy(false);
    setResult(null);
    setCurrentExplanation(null);
    setError("");
    setMunicipalityId(id);
    saveSelectedMunicipalityId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("municipio", id);
    window.history.replaceState(null, "", url.toString());
  }

  async function discover() {
    if (busy || !ready) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setResult(null);
    setCurrentExplanation(null);
    setError("");
    try {
      const response = await fetch("/api/discoveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ municipalityId }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível procurar uma descoberta.");
      if (!body.discovery || !body.explanationData) throw new Error("A descoberta recebida está incompleta.");
      setResult(body as DiscoveryResult);
      setCurrentExplanation(body.explanationData as Explanation);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível procurar uma descoberta.");
    } finally {
      if (abortRef.current === controller) { abortRef.current = null; setBusy(false); }
    }
  }

  const municipality = getMunicipalityById(municipalityId);
  const discovery = result?.discovery;
  const explanation = currentExplanation ?? result?.explanationData;

  return <main className="shell">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><BarChart3 size={19} strokeWidth={2.5}/></span><span>Pergunta<span className="brand-muted"> ao INE</span></span></Link><nav className="site-nav" aria-label="Navegação principal"><Link href="/">Perguntar</Link><Link href="/explorar">Explorar cidades</Link><Link href="/comparar">Comparar cidades</Link><Link href="/descobertas" aria-current="page">Descobertas</Link><Link href="/sobre">Sobre o projeto</Link></nav><MobileMenu/></header>
    <section className={styles.intro}><span className="eyebrow"><Lightbulb size={15}/> DESCOBERTAS COM PROVA</span><h1>O que mudou na tua cidade?</h1><p>Escolhe um município. A aplicação compara valores oficiais do mesmo indicador e destaca a maior variação verificável disponível. O Gemma 4 ajuda a explicar o resultado.</p><div className={styles.controls}><MunicipalitySelector value={municipalityId} onChange={(item) => selectMunicipality(item.id)} label="Município" placeholder="Pesquisar município ou código INE"/><button type="button" onClick={() => void discover()} disabled={!ready || busy}>{busy ? <><LoaderCircle className="spin" size={17}/> A analisar</> : <><Sparkles size={17}/> Descobrir <ArrowRight size={16}/></>}</button></div><p className={styles.context}>{municipality ? <>A explorar <strong>{municipality.name}</strong> · {municipality.region}. <Link href={`/cidade/${municipalitySlug(municipality)}`}>Abrir Raio-X <ArrowUpRight size={13}/></Link></> : "Escolhe um município para começar."}</p></section>
    {busy && <section className={styles.status} role="status"><LoaderCircle size={20} className="spin"/><div><strong>A consultar dados oficiais e a preparar a explicação</strong><p>A pesquisa usa um snapshot verificado quando existe; caso contrário, consulta o INE. A descoberta só aparece depois da validação dos valores.</p></div></section>}
    {error && <section className={styles.status} role="alert" ref={resultRef}><Lightbulb size={21}/><div><strong>Ainda não é possível concluir</strong><p>{error}</p><Link href="/">Fazer uma pergunta específica <ArrowUpRight size={14}/></Link></div></section>}
    {result && discovery && explanation && <section className={styles.result} ref={resultRef} aria-live="polite"><div className={styles.answer}><span className="eyebrow"><span className="live-dot"/> DESCOBERTA VERIFICADA</span><h2>{explanation.headline ?? result.headline}</h2><p>{explanation.summary ?? result.explanation}</p>{explanation.caveat && <p className={styles.caveat}>{explanation.caveat}</p>}<span className={styles.provider}>{explanationProviderLabel(explanation.provider ?? result.provider)}</span></div><ExplanationPanel key={result.evidenceId} analysisId={result.evidenceId} initialExplanation={result.explanationData} onExplanationChange={setCurrentExplanation} onShowEvidence={() => { if (proofRef.current) { proofRef.current.open = true; proofRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } }}/><div className={styles.values} aria-label="Valores oficiais comparados"><div><span>{discovery.first.period}</span><strong>{format(discovery.first.value, discovery.unit)}</strong></div><ArrowRight size={23} aria-hidden="true"/><div><span>{discovery.last.period}</span><strong>{format(discovery.last.value, discovery.unit)}</strong></div><b>{discovery.percent >= 0 ? "+" : ""}{discovery.percent.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%</b></div><details className={styles.proof} ref={proofRef}><summary>Prova-me isso <span>Fonte e cálculo</span></summary><div><p><strong>Indicador:</strong> {discovery.indicatorName} ({discovery.indicatorId})</p><p><strong>Município:</strong> {discovery.territory} ({discovery.territoryId})</p><p><strong>Comparação:</strong> {discovery.first.period} e {discovery.last.period}, mesma unidade ({discovery.unit}).</p><p><strong>Cálculo:</strong> {discovery.formula} = {discovery.percent.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%.</p><p><strong>Recolha:</strong> {result.mode === "snapshot" ? "Snapshot verificado" : "Consulta à API do INE"} em {result.collectedAt.slice(0, 10)}.</p><div className={styles.sourceLinks}><a href={discovery.first.sourceUrl} target="_blank" rel="noreferrer">Valor inicial no INE <ExternalLink size={14}/></a><a href={discovery.last.sourceUrl} target="_blank" rel="noreferrer">Valor final no INE <ExternalLink size={14}/></a><a href={discovery.sourceUrl} target="_blank" rel="noreferrer">Definição do indicador <ExternalLink size={14}/></a></div>{result.warnings.map((warning) => <p className={styles.warning} key={warning}>{warning}</p>)}</div></details></section>}
    <section className={styles.featured}><div><span className="eyebrow">COMEÇOU NO ALGARVE</span><h2>Uma pergunta em Portimão. Descobertas em todo o país.</h2><p>A curiosidade sobre o custo de arrendar em Portimão deu origem ao projeto. Agora podes procurar mudanças verificáveis em qualquer município disponível no catálogo.</p></div><Link href="/comparar">Comparar municípios <ArrowUpRight size={15}/></Link></section>
    <footer><span>Um projeto <a href="https://fullgrip.ai/" target="_blank" rel="noreferrer">FullGrip.ai</a>. Projeto independente, não afiliado ao Instituto Nacional de Estatística.</span><span>Open source <b>·</b> MIT <b>·</b> Dados INE</span></footer>
  </main>;
}

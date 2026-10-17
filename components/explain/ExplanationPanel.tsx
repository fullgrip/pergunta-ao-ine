"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Download, FileCheck2, LoaderCircle, Sparkles } from "lucide-react";
import styles from "./ExplanationPanel.module.css";

export type ResponseTone = "direct" | "journalist" | "teacher" | "researcher" | "executive" | "sarcastic";
export type Explanation = {
  tone: ResponseTone;
  headline?: string;
  summary?: string;
  caveat?: string | null;
  detail?: string;
  title: string;
  body: string;
  evidenceId: string;
  provider?: string;
  model?: string;
};

const tones: Array<{ id: ResponseTone; label: string }> = [
  { id: "direct", label: "Direto" },
  { id: "journalist", label: "Jornalista" },
  { id: "teacher", label: "Professor" },
  { id: "researcher", label: "Investigador" },
  { id: "executive", label: "Executivo" },
  { id: "sarcastic", label: "Sarcástico" },
];
const toneIds = new Set(tones.map(({ id }) => id));
const quickActions: Array<{ label: string; tone: ResponseTone; hint: string }> = [
  { label: "Simplificar", tone: "teacher", hint: "Usa o modo Professor" },
  { label: "Aprofundar", tone: "researcher", hint: "Usa o modo Investigador" },
  { label: "Resumir", tone: "direct", hint: "Usa o modo Direto" },
  { label: "Dar contexto", tone: "journalist", hint: "Usa o modo Jornalista com os mesmos dados" },
];

export function explanationProviderLabel(provider?: string) {
  if (provider === "gemini") return "Gemma 4 · Gemini API";
  if (provider === "ollama") return "Gemma 4 · Ollama local";
  if (provider === "template") return "Síntese factual verificada";
  return "Origem da explicação não identificada";
}

type Props = {
  analysisId?: string | null;
  initialExplanation: Explanation;
  onActiveProviderChange?: (provider?: string, model?: string) => void;
  onShowEvidence?: () => void;
  onToneChange?: (tone: ResponseTone) => void;
  onExplanationChange?: (explanation: Explanation) => void;
};

export default function ExplanationPanel({ analysisId, initialExplanation, onActiveProviderChange, onShowEvidence, onToneChange, onExplanationChange }: Props) {
  const [tone, setTone] = useState<ResponseTone>("direct");
  const [responses, setResponses] = useState<Partial<Record<ResponseTone, Explanation>>>({ direct: initialExplanation });
  const responsesRef = useRef<Partial<Record<ResponseTone, Explanation>>>({ direct: initialExplanation });
  const inFlightRef = useRef<Partial<Record<ResponseTone, Promise<Explanation | null>>>>({});
  const [pending, setPending] = useState<Partial<Record<ResponseTone, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<ResponseTone, string>>>({});
  const [compare, setCompare] = useState(false);
  const [leftTone, setLeftTone] = useState<ResponseTone>("direct");
  const [rightTone, setRightTone] = useState<ResponseTone>("sarcastic");

  async function loadTone(nextTone: ResponseTone): Promise<Explanation | null> {
    const cached = responsesRef.current[nextTone];
    if (cached) return cached;
    if (!analysisId) {
      setErrors((current) => ({ ...current, [nextTone]: "Esta resposta não tem uma análise guardada. Faz uma nova pergunta para mudar o tom." }));
      return null;
    }
    if (inFlightRef.current[nextTone]) return inFlightRef.current[nextTone]!;
    setPending((current) => ({ ...current, [nextTone]: true }));
    setErrors((current) => ({ ...current, [nextTone]: "" }));
    const task = (async () => {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, tone: nextTone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível gerar esta explicação.");
      if (result.tone !== nextTone || result.evidenceId !== analysisId || typeof result.body !== "string" || !result.body.trim()) {
        throw new Error("A explicação recebida não corresponde à análise atual.");
      }
      const explanation: Explanation = {
        tone: nextTone,
        headline: result.headline,
        summary: result.summary,
        caveat: result.caveat,
        detail: result.detail,
        title: typeof result.title === "string" ? result.title : initialExplanation.title,
        body: result.body,
        evidenceId: result.evidenceId,
        provider: result.provider,
        model: result.model,
      };
      responsesRef.current[nextTone] = explanation;
      setResponses({ ...responsesRef.current });
      return explanation;
    })();
    const safeTask = task.catch((error) => {
      setErrors((current) => ({ ...current, [nextTone]: error instanceof Error ? error.message : "Não foi possível gerar esta explicação." }));
      return null;
    }).finally(() => {
      delete inFlightRef.current[nextTone];
      setPending((current) => ({ ...current, [nextTone]: false }));
    });
    inFlightRef.current[nextTone] = safeTask;
    return safeTask;
  }

  function chooseTone(nextTone: ResponseTone) {
    setTone(nextTone);
    onToneChange?.(nextTone);
    try { window.sessionStorage.setItem("pergunta-ao-ine-tone", nextTone); } catch { /* Private browsing can block storage. */ }
    void loadTone(nextTone);
  }

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("pergunta-ao-ine-tone");
      if (saved && toneIds.has(saved as ResponseTone)) chooseTone(saved as ResponseTone);
    } catch { /* The default tone remains available. */ }
    // Restore the preference once for this analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const active = responses[tone];
    if (active) { onActiveProviderChange?.(active.provider, active.model); onExplanationChange?.(active); }
  }, [tone, responses, onActiveProviderChange, onExplanationChange]);

  function showCompare() {
    const next = !compare;
    setCompare(next);
    if (next) {
      setLeftTone(tone);
      void loadTone(tone);
      void loadTone(rightTone);
    }
  }

  function exportExplanation() {
    const current = responses[tone];
    if (!current) return;
    const label = tones.find(({ id }) => id === tone)?.label ?? tone;
    const content = [current.headline ?? current.title, "", `Tom: ${label}`, `Origem: ${explanationProviderLabel(current.provider)}`, "", current.summary ?? current.body, current.caveat ? `Limitação: ${current.caveat}` : "", "", `Análise: ${current.evidenceId}`, "Os valores e as fontes devem ser confirmados na aplicação Pergunta ao INE."].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pergunta-ao-ine-${tone}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderText(selectedTone: ResponseTone, comparison = false) {
    const item = responses[selectedTone];
    if (pending[selectedTone]) return <div className={styles.loading} role="status"><LoaderCircle className="spin" size={17}/> O Gemma 4 está a adaptar a explicação…</div>;
    if (errors[selectedTone]) return <div className={styles.error} role="alert">{errors[selectedTone]} <button onClick={() => void loadTone(selectedTone)}>Tentar novamente</button></div>;
    if (!item) return <div className={styles.loading}>Escolhe um tom para gerar a explicação.</div>;
    return <div className={styles.text}>
      {item.title && item.title !== item.headline && <h3>{item.title}</h3>}
      <p>{item.detail ?? item.body}</p>
      <span className={styles.provider}>{explanationProviderLabel(item.provider)}{comparison ? " · mesma evidência" : ""}</span>
    </div>;
  }

  return <section className={styles.panel} aria-label="Explicação dos dados">
    <div className={styles.heading}><div><span className={styles.kicker}><Sparkles size={14}/> EXPLICAÇÃO DOS DADOS</span><h2>Como queres que te explique?</h2></div><span className={styles.evidenceTag}>Dados e cálculos preservados</span></div>
    <div className={styles.tones} role="group" aria-label="Tom da explicação">
      {tones.map(({ id, label }) => <button key={id} type="button" className={tone === id ? styles.selected : ""} aria-pressed={tone === id} onClick={() => chooseTone(id)}>{label}</button>)}
    </div>
    <div className={styles.answer} aria-live="polite" aria-busy={Boolean(pending[tone])}>{renderText(tone)}</div>
    <div className={styles.actions}><div className={styles.quickActions} aria-label="Explicar de outra maneira">{quickActions.map(({ label, tone: actionTone, hint }) => <button key={label} type="button" title={hint} onClick={() => chooseTone(actionTone)}>{label}</button>)}</div><div className={styles.mainActions}><button type="button" className={styles.compareButton} aria-expanded={compare} onClick={showCompare}><ArrowLeftRight size={15}/> {compare ? "Fechar comparação" : "Comparar estilos"}</button><button type="button" className={styles.compareButton} disabled={!responses[tone] || Boolean(pending[tone])} onClick={exportExplanation}><Download size={15}/> Exportar explicação</button><button type="button" className={styles.compareButton} onClick={onShowEvidence}><FileCheck2 size={15}/> Prova-me Isso</button></div></div>
    {compare && <div className={styles.comparison} aria-label="Comparar dois estilos">
      {([leftTone, rightTone] as const).map((selected, index) => <article className={styles.comparisonCard} key={index}>
        <label htmlFor={`compare-tone-${index}`}>{index === 0 ? "Estilo A" : "Estilo B"}</label>
        <select id={`compare-tone-${index}`} value={selected} onChange={(event) => { const next = event.target.value as ResponseTone; if (index === 0) setLeftTone(next); else setRightTone(next); void loadTone(next); }}>{tones.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}</select>
        <div className={styles.comparisonText} aria-live="polite" aria-busy={Boolean(pending[selected])}>{renderText(selected, true)}</div>
      </article>)}
    </div>}
    <p className={styles.disclosure}>A explicação adapta o texto. Os valores, o gráfico e as fontes abaixo pertencem à mesma análise do INE. O texto é gerado por IA, não pelo INE.</p>
  </section>;
}

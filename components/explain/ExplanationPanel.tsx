"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Download, FileCheck2 } from "lucide-react";
import styles from "./ExplanationPanel.module.css";

export type ResponseTone = "direct" | "friend" | "journalist" | "teacher" | "researcher" | "executive" | "sarcastic";
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

// Cada estilo é uma "personagem": mais fácil de escolher do que um tom abstrato, sobretudo para os mais novos.
const tones: Array<{ id: ResponseTone; label: string; emoji: string; tagline: string }> = [
  { id: "friend", label: "Como um amigo", emoji: "🤙", tagline: "Na boa, sem palavras difíceis" },
  { id: "direct", label: "Direto", emoji: "🎯", tagline: "Sem rodeios" },
  { id: "teacher", label: "Professor", emoji: "🧑‍🏫", tagline: "Com um exemplo do dia a dia" },
  { id: "sarcastic", label: "Sarcástico", emoji: "😏", tagline: "Com ironia, os mesmos números" },
  { id: "journalist", label: "Jornalista", emoji: "📰", tagline: "Como numa notícia" },
  { id: "executive", label: "Executivo", emoji: "💼", tagline: "O que muda na prática" },
  { id: "researcher", label: "Investigador", emoji: "🔬", tagline: "Com rigor técnico" },
];
const toneIds = new Set(tones.map(({ id }) => id));
const toneById = (id: ResponseTone) => tones.find((item) => item.id === id) ?? tones[1];

/** Reveals the text a few letters at a time; shows it whole when the person prefers reduced motion. */
function Typewriter({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* sem matchMedia: mostra tudo */ }
    if (reduced) { setShown(text.length); return; }
    setShown(0);
    const step = Math.max(2, Math.ceil(text.length / 70));
    const timer = window.setInterval(() => setShown((current) => { if (current + step >= text.length) { window.clearInterval(timer); return text.length; } return current + step; }), 18);
    return () => window.clearInterval(timer);
  }, [text]);
  return <p aria-label={text}><span aria-hidden>{text.slice(0, shown)}</span>{shown < text.length && <span className={styles.caret} aria-hidden>▍</span>}</p>;
}

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
    const persona = toneById(selectedTone);
    if (pending[selectedTone]) return <div className={styles.loading} role="status"><span className={styles.avatar} aria-hidden>{persona.emoji}</span><span>O Gemma 4 está a escrever {selectedTone === "friend" ? "como um amigo" : `como ${persona.label.toLowerCase()}`}<span className={styles.dots} aria-hidden><i/><i/><i/></span></span></div>;
    if (errors[selectedTone]) return <div className={styles.error} role="alert">{errors[selectedTone]} <button onClick={() => void loadTone(selectedTone)}>Tentar outra vez</button></div>;
    if (!item) return <div className={styles.loading}>Escolhe quem te explica.</div>;
    return <div className={styles.bubbleRow} key={selectedTone}>
      {!comparison && <span className={styles.avatar} aria-hidden>{persona.emoji}</span>}
      <div className={styles.bubble}>
        <span className={styles.bubbleName}>{persona.label}</span>
        {comparison ? <p>{item.detail ?? item.body}</p> : <Typewriter text={item.detail ?? item.body}/>}
        <span className={styles.provider}>{explanationProviderLabel(item.provider)}</span>
      </div>
    </div>;
  }

  return <section className={styles.panel} aria-label="Explicação dos dados">
    <div className={styles.heading}><span className={styles.kicker}>🎭 ESCOLHE QUEM TE EXPLICA</span><h2>Os números são os mesmos. A conversa é que muda.</h2></div>
    <div className={styles.personas} role="group" aria-label="Quem explica">
      {tones.map(({ id, label, emoji, tagline }) => <button key={id} type="button" className={tone === id ? `${styles.persona} ${styles.selected}` : styles.persona} aria-pressed={tone === id} onClick={() => chooseTone(id)}>
        <span className={styles.personaEmoji} aria-hidden>{emoji}</span><strong>{label}</strong><small>{tagline}</small>
      </button>)}
    </div>
    <div className={styles.answer} aria-live="polite" aria-busy={Boolean(pending[tone])}>{renderText(tone)}</div>
    <div className={styles.actions}>
      <button type="button" className={styles.actionButton} aria-expanded={compare} onClick={showCompare}><ArrowLeftRight size={15}/> {compare ? "Fechar comparação" : "Comparar dois estilos"}</button>
      <button type="button" className={styles.actionButton} disabled={!responses[tone] || Boolean(pending[tone])} onClick={exportExplanation}><Download size={15}/> Guardar texto</button>
      <button type="button" className={styles.actionButton} onClick={onShowEvidence}><FileCheck2 size={15}/> Prova-me isso</button>
    </div>
    {compare && <div className={styles.comparison} aria-label="Comparar dois estilos">
      {([leftTone, rightTone] as const).map((selected, index) => <article className={styles.comparisonCard} key={index}>
        <label htmlFor={`compare-tone-${index}`}>{index === 0 ? "Estilo A" : "Estilo B"}</label>
        <select id={`compare-tone-${index}`} value={selected} onChange={(event) => { const next = event.target.value as ResponseTone; if (index === 0) setLeftTone(next); else setRightTone(next); void loadTone(next); }}>{tones.map(({ id, label, emoji }) => <option value={id} key={id}>{emoji} {label}</option>)}</select>
        <div className={styles.comparisonText} aria-live="polite" aria-busy={Boolean(pending[selected])}>{renderText(selected, true)}</div>
      </article>)}
    </div>}
    <p className={styles.disclosure}>O texto muda, os números não. Escrito por IA (Gemma 4), não pelo INE.</p>
  </section>;
}

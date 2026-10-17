import { LoaderCircle, Sparkles } from "lucide-react";
import { explanationProviderLabel, type Explanation, type ResponseTone } from "@/components/explain/ExplanationPanel";
import styles from "./AnswerHero.module.css";

export type AnswerStage = "interpret" | "data" | "analyze" | "explain";
const stageLabels: Record<AnswerStage, string> = {
  interpret: "A interpretar a pergunta",
  data: "A consultar dados oficiais",
  analyze: "A analisar os resultados",
  explain: "A preparar a explicação",
};
const toneLabels: Record<ResponseTone, string> = {
  direct: "Direto", friend: "Como um amigo", journalist: "Jornalista", teacher: "Professor",
  researcher: "Investigador", executive: "Executivo", sarcastic: "Sarcástico",
};

type Props = {
  question: string;
  explanation?: Explanation | null;
  loading?: boolean;
  stage?: AnswerStage;
  source?: "snapshot" | "ine";
  tone?: ResponseTone;
  failureHeadline?: string;
  failureReason?: string;
};

export default function AnswerHero({ question, explanation, loading = false, stage = "interpret", source, tone = "direct", failureHeadline, failureReason }: Props) {
  return <section className={styles.hero} aria-label="Resposta à pergunta" aria-busy={loading}>
    <div className={styles.question}><span>A TUA PERGUNTA</span><p>{question}</p></div>
    {loading ? <div className={styles.loading} role="status" aria-live="polite"><LoaderCircle className="spin" size={23}/><div><strong>{stage === "data" && source === "snapshot" ? "A ler dados oficiais guardados" : stageLabels[stage]}</strong><p>Esta etapa começou no servidor. A resposta aparece quando os dados e a explicação estiverem prontos.</p></div></div> : failureReason ? <div role="alert"><h2>{failureHeadline ?? "Não foi possível responder."}</h2><p className={styles.summary}>{failureReason}</p></div> : explanation ? <>
      <div className={styles.answerLabel}><Sparkles size={15}/>{explanation.provider === "template" ? "RESPOSTA FACTUAL VERIFICADA" : "EXPLICAÇÃO POR GEMMA 4"}</div>
      <h2>{explanation.headline ?? explanation.title}</h2>
      <p className={styles.summary}>{explanation.summary ?? explanation.body}</p>
      {explanation.caveat && <p className={styles.caveat}><strong>A ter em conta:</strong> {explanation.caveat}</p>}
      <div className={styles.meta}><span>{explanationProviderLabel(explanation.provider)}</span><span>Tom escolhido: {toneLabels[tone]}</span></div>
    </> : null}
  </section>;
}

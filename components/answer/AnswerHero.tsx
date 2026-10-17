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
const stageLabelsEn: Record<AnswerStage, string> = { interpret: "Reading your question", data: "Fetching official data", analyze: "Working out the numbers", explain: "Writing the explanation" };
const toneLabelsEn: Record<ResponseTone, string> = { direct: "Direct", friend: "Like a friend", journalist: "Journalist", teacher: "Teacher", researcher: "Researcher", executive: "Executive", sarcastic: "Sarcastic" };
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
  lang?: "pt" | "en";
};

export default function AnswerHero({ question, explanation, loading = false, stage = "interpret", source, tone = "direct", failureHeadline, failureReason, lang = "pt" }: Props) {
  const en = lang === "en";
  return <section className={styles.hero} aria-label="Resposta à pergunta" aria-busy={loading}>
    <div className={styles.question}><span>{en ? "YOUR QUESTION" : "A TUA PERGUNTA"}</span><p>{question}</p></div>
    {loading ? <div className={styles.loading} role="status" aria-live="polite"><LoaderCircle className="spin" size={23}/><div><strong>{stage === "data" && source === "snapshot" ? (en ? "Reading saved official data" : "A ler dados oficiais guardados") : (en ? stageLabelsEn : stageLabels)[stage]}</strong><p>{en ? "The answer appears as soon as the data and the explanation are ready." : "Esta etapa começou no servidor. A resposta aparece quando os dados e a explicação estiverem prontos."}</p></div></div> : failureReason ? <div role="alert"><h2>{failureHeadline ?? (en ? "I couldn’t answer that." : "Não foi possível responder.")}</h2><p className={styles.summary}>{failureReason}</p></div> : explanation ? <>
      <div className={styles.answerLabel}><Sparkles size={15}/>{explanation.provider === "template" ? (en ? "VERIFIED FACTUAL ANSWER" : "RESPOSTA FACTUAL VERIFICADA") : (en ? "EXPLAINED BY GEMMA 4" : "EXPLICAÇÃO POR GEMMA 4")}</div>
      <h2>{explanation.headline ?? explanation.title}</h2>
      <p className={styles.summary}>{explanation.summary ?? explanation.body}</p>
      {explanation.caveat && <p className={styles.caveat}><strong>{en ? "Keep in mind:" : "A ter em conta:"}</strong> {explanation.caveat}</p>}
      <div className={styles.meta}><span>{explanationProviderLabel(explanation.provider)}</span><span>{en ? `Style: ${toneLabelsEn[tone]}` : `Tom escolhido: ${toneLabels[tone]}`}</span></div>
    </> : null}
  </section>;
}

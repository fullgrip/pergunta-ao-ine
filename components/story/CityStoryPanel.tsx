import { ArrowUpRight, BookOpen, FileCheck2 } from "lucide-react";
import type { CityDashboard } from "@/lib/city";
import { buildCityStory } from "@/lib/analytics/story";
import styles from "./CityStoryPanel.module.css";

export default function CityStoryPanel({ city }: { city: CityDashboard }) {
  const story = buildCityStory(city);
  return <section className={styles.story} id="historia" aria-labelledby="city-story-heading">
    <div className={styles.heading}>
      <div>
        <span className={styles.kicker}><BookOpen size={15} /> HISTÓRIA DA CIDADE</span>
        <h2 id="city-story-heading">O que contam os dados?</h2>
        <p>Uma leitura curta, calculada a partir das observações verificadas.</p>
      </div>
      <span className={styles.date}>{story.mode === "snapshot" ? "Snapshot" : "Consulta em direto"} · {story.collectedAt.slice(0, 10)}</span>
    </div>
    <div className={styles.grid}>
      {story.sections.map((section) => <article className={styles.card} key={section.id}>
        <span className={styles.eyebrow}>{section.eyebrow}</span>
        <h3>{section.title}</h3>
        <p>{section.text}</p>
        {section.calculation && <div className={styles.calculation}>
          <span>CÁLCULO REPRODUZÍVEL</span>
          <code>{section.calculation.formula}</code>
          <strong>{section.calculation.result > 0 ? "+" : ""}{new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(section.calculation.result)}{section.calculation.unit}</strong>
        </div>}
        {section.evidence.length > 0 && <div className={styles.evidence}>
          <span><FileCheck2 size={14}/> OBSERVAÇÕES OFICIAIS</span>
          {section.evidence.map((item) => <a key={`${item.indicatorId}-${item.period}`} href={item.sourceUrl} target="_blank" rel="noreferrer">
            {item.indicatorId} · {item.period} · {new Intl.NumberFormat("pt-PT", { maximumFractionDigits: item.unit === "pessoas" ? 0 : 2 }).format(item.value)} {item.unit} <ArrowUpRight size={12}/>
          </a>)}
        </div>}
      </article>)}
    </div>
    <p className={styles.note}>Leitura gerada por regras verificáveis. As fontes abrem a observação do INE; o Gemma não cria valores nem conclusões nesta secção.</p>
  </section>;
}

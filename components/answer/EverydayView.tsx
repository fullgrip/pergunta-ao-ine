import { Briefcase, Euro, Home, Luggage, Sun, Trash2, TrendingUp, User, Users } from "lucide-react";
import type { Everyday, EverydayIcon } from "@/lib/everyday";

const icons: Record<EverydayIcon, typeof Home> = { home: Home, euro: Euro, users: Users, sun: Sun, briefcase: Briefcase, trash: Trash2, trend: TrendingUp };
const fmt = (n: number, unit: string, en = false) => `${new Intl.NumberFormat(en ? "en-GB" : "pt-PT", { maximumFractionDigits: unit === "pessoas" || unit === "people" ? 0 : 2, useGrouping: "always" }).format(n)} ${unit}`;

/** "Em linguagem do dia a dia": the official value turned into things people recognise. */
export default function EverydayView({ view, lang = "pt" }: { view: Everyday; lang?: "pt" | "en" }) {
  const en = lang === "en";
  if (!view.lines.length) return null;
  const { beforeAfter, pictogram } = view;
  const max = beforeAfter ? Math.max(beforeAfter.first.value, beforeAfter.last.value) : 0;
  return <section className="everyday" aria-label="Em linguagem do dia a dia">
    <header><span className="everyday-eyebrow">{en ? "IN EVERYDAY TERMS" : "EM LINGUAGEM DO DIA A DIA"}</span><p>{en ? "Worked out by the app from INE’s official values." : "Contas feitas pela app a partir dos valores oficiais do INE."}</p></header>
    <ul className="everyday-lines">{view.lines.map((line) => { const Icon = icons[line.icon]; return <li key={line.text}><span className={`everyday-icon everyday-icon-${line.icon}`}><Icon size={18} aria-hidden/></span><div><p>{line.text}</p>{line.note && <small>{line.note}</small>}</div></li>; })}</ul>
    {(beforeAfter || pictogram) && <div className="everyday-visuals">
      {beforeAfter && <figure className="everyday-bars" aria-label={`${en ? "Then and now in" : "Antes e agora em"} ${beforeAfter.territory}`}>
        <figcaption>{en ? "Then and now" : "Antes e agora"} · {beforeAfter.territory}</figcaption>
        {[beforeAfter.first, beforeAfter.last].map((point, index) => <div className="everyday-bar-row" key={point.period}>
          <span className="everyday-bar-label">{point.period}</span>
          <span className="everyday-bar-track"><span className={index ? "everyday-bar now" : "everyday-bar"} style={{ width: `${max > 0 ? Math.max(4, (point.value / max) * 100) : 0}%` }}/></span>
          <strong>{fmt(point.value, beforeAfter.unit, en)}</strong>
        </div>)}
      </figure>}
      {pictogram?.kind === "people100" && <figure className="everyday-people" aria-label={pictogram.label}>
        <figcaption>{pictogram.label}</figcaption>
        <div className="everyday-people-grid">{Array.from({ length: pictogram.total }, (_, i) => <User key={i} size={15} aria-hidden className={i < pictogram.filled ? "on" : ""}/>)}</div>
      </figure>}
      {pictogram?.kind === "guests" && <figure className="everyday-guests" aria-label={pictogram.label}>
        <figcaption>{pictogram.label}</figcaption>
        <div className="everyday-guests-row"><span className="everyday-resident"><User size={22} aria-hidden/><small>{en ? "1 resident" : "1 habitante"}</small></span><span className="everyday-equals">=</span><span className="everyday-luggage">{Array.from({ length: pictogram.filled }, (_, i) => <Luggage key={i} size={18} aria-hidden/>)}</span></div>
      </figure>}
    </div>}
  </section>;
}

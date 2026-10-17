import Link from "next/link";
import CityPhoto, { type CityPhotoSlug } from "@/components/media/CityPhoto";
import AlgarveMap from "@/components/map/AlgarveMap";
import styles from "./HomeCityStrip.module.css";

const cities: { slug: CityPhotoSlug; name: string }[] = [
  { slug: "portimao", name: "Portimão" },
  { slug: "faro", name: "Faro" },
  { slug: "lagos", name: "Lagos" },
  { slug: "albufeira", name: "Albufeira" },
];

export default function HomeCityStrip() {
  return <section className={styles.section} aria-labelledby="cities-heading">
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>COMEÇA POR QUATRO CIDADES</span><h2 id="cities-heading">Explora os municípios</h2></div>
      <p>Estas são sugestões do Algarve. <Link href="/explorar">Pesquisa qualquer município português →</Link></p>
    </div>
    <div className={styles.grid}>
      {cities.map(({ slug, name }) => <article className={`${styles.card} ${styles[slug]}`} key={slug}>
        <CityPhoto city={slug} compact sizes="(max-width: 600px) 50vw, 25vw" />
        <Link href={`/cidade/${slug}`} className={styles.link} aria-label={`Abrir Raio-X de ${name}`}>{name}<span aria-hidden="true">↗</span></Link>
      </article>)}
    </div>
    <AlgarveMap className={styles.map}/>
  </section>;
}

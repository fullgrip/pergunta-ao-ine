import Image from "next/image";
import credits from "@/data/creditos.json";
import styles from "./CityPhoto.module.css";

export type CityPhotoSlug = "portimao" | "faro" | "lagos" | "albufeira";

const bySlug = Object.fromEntries(credits.map((credit) => [credit.slug, credit])) as Record<CityPhotoSlug, (typeof credits)[number]>;

export default function CityPhoto({ city, compact = false, className = "", priority = false, sizes }: {
  city: CityPhotoSlug;
  compact?: boolean;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const credit = bySlug[city];
  return <div className={`${styles.frame} ${compact ? styles.compact : ""} ${className}`}>
    <Image
      src={`/cidades/${city}${compact ? "-800" : ""}.webp`}
      alt={credit.alt}
      fill
      priority={priority}
      sizes={sizes ?? (compact ? "(max-width: 700px) 50vw, 25vw" : "(max-width: 700px) 100vw, 65vw")}
      className={styles.image}
    />
    <span className={styles.shade} aria-hidden="true" />
    <a className={styles.credit} href={credit.commonsUrl} target="_blank" rel="noreferrer" title={`${credit.adaptacao}. Licença: ${credit.licenca} (${credit.licencaUrl})`}>
      Foto: {credit.autor} · {credit.licenca}
    </a>
  </div>;
}

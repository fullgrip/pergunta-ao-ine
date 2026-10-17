import styles from "./AlgarveMap.module.css";

export type AlgarveCity = "portimao" | "faro" | "lagos" | "albufeira";

type CityPoint = {
  slug: AlgarveCity;
  name: string;
  latitude: number;
  longitude: number;
  labelOffset: number;
};

const cities: CityPoint[] = [
  { slug: "lagos", name: "Lagos", latitude: 37.103, longitude: -8.674, labelOffset: 36 },
  { slug: "portimao", name: "Portimão", latitude: 37.137, longitude: -8.538, labelOffset: -31 },
  { slug: "albufeira", name: "Albufeira", latitude: 37.089, longitude: -8.25, labelOffset: -18 },
  { slug: "faro", name: "Faro", latitude: 37.019, longitude: -7.93, labelOffset: -18 },
];

// Local planar projection for this narrow strip. City marks use the supplied
// coordinates; the coast below is intentionally a simplified visual outline.
function project(latitude: number, longitude: number) {
  return {
    x: 38 + ((longitude + 9.02) / 1.64) * 684,
    y: 190 - ((latitude - 36.95) / 0.3) * 165,
  };
}

const coastAnchors: Array<[number, number]> = [
  [37.005, -8.99],
  [37.005, -8.94],
  [37.035, -8.84],
  [37.075, -8.73],
  [37.079, -8.66],
  [37.114, -8.58],
  [37.105, -8.54],
  [37.083, -8.43],
  [37.087, -8.35],
  [37.075, -8.25],
  [37.06, -8.11],
  [36.995, -7.94],
  [37.0, -7.86],
  [37.045, -7.77],
  [37.092, -7.65],
  [37.13, -7.53],
  [37.165, -7.42],
];

const coast = coastAnchors
  .map(([latitude, longitude], index) => {
    const { x, y } = project(latitude, longitude);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  })
  .join(" ");

export default function AlgarveMap({
  activeCity,
  className = "",
}: {
  activeCity?: AlgarveCity;
  className?: string;
}) {
  return (
    <div className={`${styles.map} ${className}`}>
      <svg
        viewBox="0 0 760 220"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Mapa simplificado da costa do Algarve com Lagos, Portimão, Albufeira e Faro nas posições geográficas indicadas"
      >
        <path className={styles.land} d={`${coast} L722 0 L38 0 Z`} />
        <path className={styles.coast} d={coast} />
        <text className={styles.seaLabel} x="645" y="185">Oceano Atlântico</text>
        {cities.map((city) => {
          const { x, y } = project(city.latitude, city.longitude);
          const active = city.slug === activeCity;
          return (
            <a
              key={city.slug}
              className={`${styles.cityLink} ${styles[city.slug]} ${active ? styles.active : ""}`}
              href={`/cidade/${city.slug}`}
              aria-label={`Abrir Raio-X de ${city.name}${active ? ", cidade atual" : ""}`}
            >
              <title>{`${city.name}: ${city.latitude.toFixed(3)}°, ${city.longitude.toFixed(3)}°`}</title>
              <circle className={styles.hitArea} cx={x} cy={y} r={30} />
              <circle className={styles.halo} cx={x} cy={y} r={active ? 14 : 11} />
              <circle className={styles.point} cx={x} cy={y} r={active ? 7 : 6} />
              <text className={styles.cityLabel} x={x} y={y + city.labelOffset} textAnchor="middle">
                {city.name}
              </text>
            </a>
          );
        })}
      </svg>
      <p className={styles.caption}>Linha da costa simplificada · pontos posicionados por latitude e longitude</p>
    </div>
  );
}

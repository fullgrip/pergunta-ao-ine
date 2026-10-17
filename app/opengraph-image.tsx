import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Pergunta ao INE — Os números do Algarve, com o Algarve à vista";

const cities = [
  { name: "Portimão", color: "#0D6B52" },
  { name: "Faro", color: "#C8743A" },
  { name: "Lagos", color: "#2F6FB0" },
  { name: "Albufeira", color: "#B5487A" },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FBF8F2", color: "#13232B", padding: "72px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: "#0D6B52", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 5, paddingBottom: 14 }}>
          {[18, 29, 22, 37].map((height, index) => <div key={index} style={{ width: 6, height, borderRadius: 4, background: "white" }} />)}
        </div>
        <div style={{ fontSize: 29, fontWeight: 700 }}>Pergunta ao INE</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 23 }}>
        <div style={{ maxWidth: 960, fontSize: 70, fontWeight: 750, letterSpacing: -2, lineHeight: 1.08 }}>Os números do Algarve, com o Algarve à vista.</div>
        <div style={{ maxWidth: 860, fontSize: 27, color: "#4F5F58", lineHeight: 1.35 }}>Pergunta, compara e compreende as estatísticas oficiais.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        {cities.map((city) => <div key={city.name} style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 21 }}><div style={{ width: 17, height: 17, borderRadius: 9, background: city.color }} /><span style={{ fontSize: 19, color: "#4F5F58" }}>{city.name}</span></div>)}
      </div>
    </div>,
    size,
  );
}

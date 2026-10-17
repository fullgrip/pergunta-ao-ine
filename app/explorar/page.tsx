"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, MapPin } from "lucide-react";
import MunicipalitySelector, { useSelectedMunicipality } from "@/components/municipality/MunicipalitySelector";
import MobileMenu from "@/components/layout/MobileMenu";
import { getMunicipalityById, municipalitySlug, searchMunicipalities } from "@/lib/municipalities";

export default function ExplorePage() {
  const router = useRouter();
  const [selectedId, select] = useSelectedMunicipality();
  const selected = selectedId ? getMunicipalityById(selectedId) : null;
  return <main className="shell national-page">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><BarChart3 size={19}/></span><span>Pergunta ao INE</span></Link><nav className="site-nav" aria-label="Navegação principal"><Link href="/">Perguntar</Link><Link href="/explorar" aria-current="page">Explorar cidades</Link><Link href="/comparar">Comparar cidades</Link><Link href="/descobertas">Descobertas</Link><Link href="/sobre">Sobre o projeto</Link></nav><MobileMenu/></header>
    <section className="national-hero"><span className="eyebrow"><MapPin size={15}/> PORTUGAL EM DADOS</span><h1>Explora qualquer município.</h1><p>Pesquisa entre os 308 municípios do catálogo oficial. O Raio-X mostra os indicadores publicados pelo INE, com período, unidade e fonte.</p><div className="national-selector"><MunicipalitySelector value={selectedId} onChange={(municipality) => { select(municipality.id); router.push(`/cidade/${municipalitySlug(municipality)}`); }} label="Município" placeholder="Nome ou código oficial" /></div>{selected && <Link className="national-action" href={`/cidade/${municipalitySlug(selected)}`}>Abrir Raio-X de {selected.name} <ArrowRight size={17}/></Link>}</section>
    <section className="national-examples"><h2>Para começar</h2><div>{["Portimão", "Lisboa", "Porto", "Funchal", "Braga", "Ponta Delgada"].map((name) => <button type="button" key={name} onClick={() => { const municipality = searchMunicipalities(name, 10).find((item) => item.name === name); if (municipality) { select(municipality.id); router.push(`/cidade/${municipalitySlug(municipality)}`); } }}>{name} <ArrowRight size={15}/></button>)}</div><p>Se um indicador não tiver valores para o município ou período escolhido, a aplicação mostra a ausência sem preencher números.</p></section>
    <footer><span>Um projeto <a href="https://fullgrip.ai/" target="_blank" rel="noreferrer">FullGrip.ai</a>. Projeto independente, não afiliado ao Instituto Nacional de Estatística.</span><span>Open source · MIT · Dados INE</span></footer>
  </main>;
}

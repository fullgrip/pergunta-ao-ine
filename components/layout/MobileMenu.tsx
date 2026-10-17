import Link from "next/link";

export default function MobileMenu() {
  return <details className="mobile-nav"><summary>Menu</summary><nav aria-label="Navegação móvel"><Link href="/">Perguntar</Link><Link href="/explorar">Explorar cidades</Link><Link href="/comparar">Comparar cidades</Link><Link href="/descobertas">Descobertas</Link><Link href="/sobre">Sobre o projeto</Link></nav></details>;
}

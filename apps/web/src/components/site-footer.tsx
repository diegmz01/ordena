import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

const links = [
  { href: "/faq", label: "Preguntas frecuentes" },
  { href: "/privacidad", label: "Aviso de privacidad" },
  { href: "/terminos", label: "Términos y condiciones" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container-page flex flex-col items-center gap-4 !py-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <BrandLogo height={28} />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} Ordena. Todos los derechos
            reservados.
          </p>
        </div>
        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          aria-label="Enlaces legales"
        >
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="site-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

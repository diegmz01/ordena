import Image from "next/image";
import {
  Bell,
  CreditCard,
  MapPin,
  ShieldCheck,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { SiApplepay, SiGooglepay } from "react-icons/si";
import { HomeHeroCta } from "@/components/home-hero-cta";
import { InstallPwaCard } from "@/components/pwa/install-pwa-card";

const steps = [
  {
    n: "01",
    icon: MapPin,
    title: "Sucursal",
    text: "Elige dónde pasas a recoger.",
  },
  {
    n: "02",
    icon: UtensilsCrossed,
    title: "Pedido",
    text: "Arma tu orden y personaliza extras.",
  },
  {
    n: "03",
    icon: Bell,
    title: "Listo",
    text: "Te avisamos cuando puedas pasar.",
  },
];

const paymentMethods = [
  {
    icon: SiApplepay,
    title: "Apple Pay",
    text: "Paga en un toque desde tu iPhone.",
  },
  {
    icon: SiGooglepay,
    title: "Google Pay",
    text: "Rápido y seguro en Android.",
  },
  {
    icon: CreditCard,
    title: "Tarjetas de crédito y débito",
    text: "Visa, Mastercard y más.",
  },
  {
    icon: ShieldCheck,
    title: "Pago 100% seguro",
    text: "Procesado por Stripe, se cobra al recoger.",
  },
];

const siteUrl =
  process.env.NEXT_PUBLIC_CUSTOMER_URL ?? "http://localhost:3000";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Ordena",
  url: siteUrl,
  logo: `${siteUrl}/logos/icono.png`,
};

export default function HomePage() {
  return (
    <div className="pb-24 md:pb-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="customer-hero">
        <Image
          src="/images/background-burgers-home-top.jpg"
          alt=""
          fill
          priority
          aria-hidden
          className="absolute inset-0 object-cover opacity-40 mix-blend-luminosity"
        />
        <div
          className="absolute inset-0 bg-gradient-to-br from-orange-600/92 via-orange-500/85 to-amber-600/92"
          aria-hidden
        />
        <div className="customer-hero-mesh absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-5xl gap-10 px-4 pb-14 pt-16 sm:pb-16 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-8">
          <div className="max-w-lg">
            <Image
              src="/logos/icono.png"
              alt=""
              width={64}
              height={64}
              className="mb-6 rounded-2xl shadow-lg ring-2 ring-white/30"
              priority
            />
            <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
              Tu pedido te espera listo al llegar
            </h1>
            <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-white/90 sm:text-xl">
              Pide, paga en línea y recoge en tu sucursal. Sin filas, sin
              esperas.
            </p>

            <HomeHeroCta />

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="customer-hero-chip">
                <ShieldCheck className="size-3.5" />
                Pago seguro
              </span>
              <span className="customer-hero-chip">
                <Zap className="size-3.5" />
                Listo en minutos
              </span>
              <span className="customer-hero-chip">
                <Bell className="size-3.5" />
                Avisos en tiempo real
              </span>
            </div>
          </div>

          <div className="relative mx-auto hidden w-full max-w-md pb-6 pt-2 lg:block">
            <div className="relative overflow-hidden rounded-[2rem] border-[6px] border-white/25 shadow-[0_35px_100px_rgba(124,45,18,0.35)]">
              <div className="relative aspect-[4/5]">
                <Image
                  src="/images/next.jpg"
                  alt="Platillos de El Bajito servidos en mesa, listos para disfrutar"
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-[#5a1d05]/85 via-[#c2410c]/10 to-transparent"
                  aria-hidden
                />
                <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/20 bg-black/30 p-4 text-white backdrop-blur-md">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-white/70">
                        Pedido #128 · Sucursal Campestre
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold">
                        2 × Tacos al pastor, 1 × Coca Cola
                      </p>
                    </div>
                    <span className="status-pulse inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-orange-600">
                      Listo
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="customer-mock-card absolute -right-3 -top-3 flex w-56 items-center gap-2.5 p-3"
              aria-hidden
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-orange-600">
                <Bell className="size-4" />
              </span>
              <p className="text-xs font-medium leading-snug text-white">
                Tu pedido está listo para recoger
              </p>
            </div>

            <div
              className="customer-mock-card absolute -bottom-4 -left-4 flex items-center gap-2 px-4 py-2.5"
              aria-hidden
            >
              <SiApplepay className="size-5 text-white" />
              <span className="text-xs font-semibold text-white">
                Pagado con Apple Pay
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page !pb-6">
        <ol className="grid gap-4 sm:grid-cols-3 sm:gap-6">
          {steps.map((step) => (
            <li key={step.n} className="customer-feature-card">
              <div className="flex items-center justify-between">
                <span className="customer-feature-icon">
                  <step.icon className="size-5" />
                </span>
                <span className="text-3xl font-bold tracking-tight text-orange-500/20">
                  {step.n}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {step.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-page !py-6">
        <div className="mb-5">
          <h2 className="page-title">Paga como quieras</h2>
          <p className="page-description">
            Checkout rápido y seguro, directo desde tu celular.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {paymentMethods.map((method) => (
            <div key={method.title} className="payment-method-chip">
              <span className="customer-feature-icon mb-0 shrink-0">
                <method.icon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {method.title}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {method.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page !pt-2">
        <InstallPwaCard />
      </section>
    </div>
  );
}

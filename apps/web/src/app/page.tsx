import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="pb-24 md:pb-8">
      <section className="customer-hero">
        <div className="customer-hero-mesh absolute inset-0" aria-hidden />
        <div className="relative mx-auto flex min-h-[min(78vh,640px)] max-w-5xl flex-col justify-end px-4 pb-12 pt-16 sm:justify-center sm:pb-16 sm:pt-20">
          <div className="max-w-lg">
            <Image
              src="/logos/icono.png"
              alt=""
              width={64}
              height={64}
              className="mb-6 rounded-2xl shadow-lg ring-2 ring-white/30"
              priority
            />
            <Image
              src="/logos/logo.svg"
              alt="Ordena"
              width={320}
              height={120}
              className="h-12 w-auto brightness-0 invert sm:h-14"
              priority
            />
            <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-white/90 sm:text-xl">
              Pide, paga en línea y recoge en tu sucursal.
            </p>
            <div className="mt-8">
              <Link
                href="/sucursales"
                className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-orange-600 shadow-lg transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Empezar pedido
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page !pt-10 !pb-6">
        <ol className="grid gap-6 sm:grid-cols-3 sm:gap-8">
          {[
            {
              n: "01",
              title: "Sucursal",
              text: "Elige dónde pasas a recoger.",
            },
            {
              n: "02",
              title: "Pedido",
              text: "Arma tu orden y personaliza extras.",
            },
            {
              n: "03",
              title: "Listo",
              text: "Te avisamos cuando puedas pasar.",
            },
          ].map((step) => (
            <li key={step.n} className="relative">
              <p className="text-3xl font-bold tracking-tight text-orange-500/25">
                {step.n}
              </p>
              <h2 className="-mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {step.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

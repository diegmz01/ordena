import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description:
    "Resuelve tus dudas sobre pedidos, pago y recolección en Ordena.",
  alternates: { canonical: "/faq" },
};

type Faq = { id: string; question: string; answer: string };

export default async function FaqPage() {
  const { data: faqs } = await apiFetch<{ data: Faq[] }>("/content/faqs");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <div className="container-page">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        Preguntas frecuentes
      </h1>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
        Si tienes otra duda, contáctanos directamente en tu sucursal.
      </p>

      {faqs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Aún no hay preguntas frecuentes disponibles.
        </p>
      ) : (
        <div className="space-y-3">
          {faqs.map((faq) => (
            <details key={faq.id} className="pwa-card group">
              <summary className="cursor-pointer list-none font-semibold text-gray-900 marker:content-none dark:text-white">
                {faq.question}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}

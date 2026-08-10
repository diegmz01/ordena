import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";

// Evita que Next intente prerenderizar esta página en build time (llamaría a
// la API real durante el build, que puede no tener aún el código desplegado).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aviso de Privacidad",
  alternates: { canonical: "/privacidad" },
};

type SiteContent = { id: string; title: string; content: string };

export default async function PrivacidadPage() {
  let page: SiteContent;
  try {
    ({ data: page } = await apiFetch<{ data: SiteContent }>(
      "/content/pages/privacidad",
    ));
  } catch {
    notFound();
  }

  return (
    <div className="container-page max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
        {page.title}
      </h1>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        {page.content}
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ExternalLink, GripVertical, HelpCircle, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type ContentTab = "faq" | "privacidad" | "terminos";

type Faq = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
};

type FaqFormState = {
  question: string;
  answer: string;
  isActive: boolean;
};

const emptyFaqForm = (): FaqFormState => ({
  question: "",
  answer: "",
  isActive: true,
});

type SiteContent = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
} | null;

type PageFormState = {
  title: string;
  content: string;
};

const emptyPageForm = (): PageFormState => ({ title: "", content: "" });

const PAGE_TABS: { slug: "privacidad" | "terminos"; label: string }[] = [
  { slug: "privacidad", label: "Aviso de Privacidad" },
  { slug: "terminos", label: "Términos y Condiciones" },
];

const customerUrl =
  process.env.NEXT_PUBLIC_CUSTOMER_URL ?? "http://localhost:3000";

function tokenOrThrow() {
  const token = getAuthToken();
  if (!token) throw new Error("Sesión expirada, vuelve a iniciar sesión");
  return token;
}

export function ContentPanel() {
  const [tab, setTab] = useState<ContentTab>("faq");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqForm, setFaqForm] = useState<FaqFormState>(emptyFaqForm());
  const [savingFaq, setSavingFaq] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [faqReorderModalOpen, setFaqReorderModalOpen] = useState(false);
  const [faqReorderList, setFaqReorderList] = useState<Faq[]>([]);
  const [faqDragIndex, setFaqDragIndex] = useState<number | null>(null);
  const [savingFaqReorder, setSavingFaqReorder] = useState(false);
  const [faqReorderError, setFaqReorderError] = useState<string | null>(null);

  const [pages, setPages] = useState<Record<string, SiteContent>>({});
  const [pageForm, setPageForm] = useState<PageFormState>(emptyPageForm());
  const [savingPage, setSavingPage] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = tokenOrThrow();
      const [faqsRes, privacidadRes, terminosRes] = await Promise.all([
        apiFetch<{ data: Faq[] }>("/content/admin/faqs", token),
        apiFetch<{ data: SiteContent }>(
          "/content/admin/pages/privacidad",
          token,
        ),
        apiFetch<{ data: SiteContent }>(
          "/content/admin/pages/terminos",
          token,
        ),
      ]);
      setFaqs(faqsRes.data);
      setPages({
        privacidad: privacidadRes.data,
        terminos: terminosRes.data,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de contenido al montar
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "faq") return;
    const page = pages[tab];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el formulario con la página activa
    setPageForm({
      title: page?.title ?? "",
      content: page?.content ?? "",
    });
  }, [tab, pages]);

  function switchTab(next: ContentTab) {
    setTab(next);
    setError(null);
    setSuccess(null);
  }

  function closeFaqModal() {
    setFaqModalOpen(false);
    setEditingFaqId(null);
    setFaqForm(emptyFaqForm());
    setFormError(null);
  }

  function openCreateFaq() {
    setEditingFaqId(null);
    setFaqForm(emptyFaqForm());
    setFormError(null);
    setFaqModalOpen(true);
  }

  function openEditFaq(faq: Faq) {
    setEditingFaqId(faq.id);
    setFaqForm({
      question: faq.question,
      answer: faq.answer,
      isActive: faq.isActive,
    });
    setFormError(null);
    setFaqModalOpen(true);
  }

  async function saveFaq(event: FormEvent) {
    event.preventDefault();
    setSavingFaq(true);
    setFormError(null);
    try {
      const token = tokenOrThrow();
      const body = {
        question: faqForm.question.trim(),
        answer: faqForm.answer.trim(),
        isActive: faqForm.isActive,
      };
      if (editingFaqId) {
        await apiFetch(`/content/admin/faqs/${editingFaqId}`, token, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setSuccess("Pregunta actualizada");
      } else {
        await apiFetch("/content/admin/faqs", token, {
          method: "POST",
          body: JSON.stringify(body),
        });
        setSuccess("Pregunta creada");
      }
      closeFaqModal();
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar la pregunta",
      );
    } finally {
      setSavingFaq(false);
    }
  }

  async function deleteFaq(faq: Faq) {
    if (!window.confirm(`¿Eliminar la pregunta "${faq.question}"?`)) return;
    setError(null);
    try {
      const token = tokenOrThrow();
      await apiFetch(`/content/admin/faqs/${faq.id}`, token, {
        method: "DELETE",
      });
      setSuccess("Pregunta eliminada");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo eliminar la pregunta",
      );
    }
  }

  function closeFaqReorderModal() {
    setFaqReorderModalOpen(false);
    setFaqReorderList([]);
    setFaqReorderError(null);
    setFaqDragIndex(null);
  }

  function openReorderFaqs() {
    setFaqReorderList([...faqs].sort((a, b) => a.sortOrder - b.sortOrder));
    setFaqReorderError(null);
    setSuccess(null);
    setFaqReorderModalOpen(true);
  }

  function moveFaqReorderItem(from: number, to: number) {
    if (to < 0 || to >= faqReorderList.length || from === to) return;
    setFaqReorderList((list) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function saveFaqReorder() {
    setSavingFaqReorder(true);
    setFaqReorderError(null);
    try {
      const token = tokenOrThrow();
      await apiFetch("/content/admin/faqs/reorder", token, {
        method: "PATCH",
        body: JSON.stringify({ faqIds: faqReorderList.map((f) => f.id) }),
      });
      setSuccess("Orden de preguntas actualizado");
      closeFaqReorderModal();
      await load();
    } catch (err) {
      setFaqReorderError(
        err instanceof Error ? err.message : "No se pudo guardar el orden",
      );
    } finally {
      setSavingFaqReorder(false);
    }
  }

  async function savePage(event: FormEvent) {
    event.preventDefault();
    if (tab === "faq") return;
    setSavingPage(true);
    setError(null);
    setSuccess(null);
    try {
      const token = tokenOrThrow();
      const res = await apiFetch<{ data: SiteContent }>(
        `/content/admin/pages/${tab}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            title: pageForm.title.trim(),
            content: pageForm.content,
          }),
        },
      );
      setPages((prev) => ({ ...prev, [tab]: res.data }));
      setSuccess("Página guardada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingPage(false);
    }
  }

  const sortedFaqs = [...faqs].sort((a, b) => a.sortOrder - b.sortOrder);

  const headerAction =
    tab === "faq" ? (
      <>
        <button
          type="button"
          className="btn-secondary"
          onClick={openReorderFaqs}
          disabled={faqs.length < 2}
          title={
            faqs.length < 2
              ? "Se necesitan al menos 2 preguntas para ordenar"
              : undefined
          }
        >
          Ordenar preguntas
        </button>
        <button type="button" className="btn-primary" onClick={openCreateFaq}>
          Nueva pregunta
        </button>
      </>
    ) : (
      <a
        href={`${customerUrl}/${tab}`}
        target="_blank"
        rel="noreferrer"
        className="btn-secondary"
      >
        <ExternalLink className="h-4 w-4" />
        Ver en el sitio
      </a>
    );

  return (
    <div className="space-y-4">
      <div className="admin-panel">
        <div className="admin-panel-header">
          <p className="page-description">
            Preguntas frecuentes y páginas legales del sitio de clientes.
          </p>
          <div className="flex flex-wrap gap-2">{headerAction}</div>
        </div>

        <div className="admin-panel-toolbar">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={cn(
                "admin-tab-pill",
                tab === "faq" && "admin-tab-pill-active",
              )}
              onClick={() => switchTab("faq")}
            >
              <HelpCircle className="h-4 w-4" />
              FAQ
              <span className="text-xs opacity-70">({faqs.length})</span>
            </button>
            {PAGE_TABS.map((page) => (
              <button
                key={page.slug}
                type="button"
                className={cn(
                  "admin-tab-pill",
                  tab === page.slug && "admin-tab-pill-active",
                )}
                onClick={() => switchTab(page.slug)}
              >
                <ShieldCheck className="h-4 w-4" />
                {page.label}
              </button>
            ))}
          </div>

          {error && <p className="admin-alert-error">{error}</p>}
          {success && <p className="pwa-alert-brand">{success}</p>}
        </div>

        {loading ? (
          <div className="admin-panel-body">
            <p className="text-sm text-gray-500">Cargando…</p>
          </div>
        ) : tab === "faq" ? (
          sortedFaqs.length === 0 ? (
            <div className="admin-panel-body">
              <div className="admin-empty">
                Aún no hay preguntas. Usa “Nueva pregunta” para crear la
                primera.
              </div>
            </div>
          ) : (
            <div className="admin-panel-table">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Pregunta
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedFaqs.map((faq) => (
                    <tr
                      key={faq.id}
                      className="cursor-pointer transition-colors hover:bg-orange-50/40 dark:hover:bg-orange-950/10"
                      onClick={() => openEditFaq(faq)}
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-800 dark:text-white">
                          {faq.question}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                          {faq.answer}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        {faq.isActive ? (
                          <span className="status-badge-active">Activa</span>
                        ) : (
                          <span className="status-badge-inactive">
                            Inactiva
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() => openEditFaq(faq)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() => deleteFaq(faq)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="admin-panel-body">
            <form onSubmit={savePage} className="space-y-4">
              <div>
                <label className="field-label" htmlFor="page-title">
                  Título
                </label>
                <input
                  id="page-title"
                  className="input-field"
                  required
                  value={pageForm.title}
                  onChange={(e) =>
                    setPageForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="field-label" htmlFor="page-content">
                  Contenido
                </label>
                <textarea
                  id="page-content"
                  className="input-field font-mono"
                  rows={20}
                  required
                  value={pageForm.content}
                  onChange={(e) =>
                    setPageForm((f) => ({ ...f, content: e.target.value }))
                  }
                />
                <p className="mt-1 text-xs text-gray-500">
                  Texto plano: los saltos de línea y párrafos se respetan tal
                  cual en el sitio de clientes.
                </p>
              </div>
              {pages[tab]?.updatedAt && (
                <p className="text-xs text-gray-500">
                  Última actualización:{" "}
                  {new Date(pages[tab]!.updatedAt).toLocaleString("es-MX")}
                </p>
              )}
              <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-700">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingPage}
                >
                  {savingPage ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <Modal
        open={faqModalOpen}
        onClose={closeFaqModal}
        title={editingFaqId ? "Editar pregunta" : "Nueva pregunta"}
        description="Pares de pregunta y respuesta mostrados en el sitio de clientes."
        wide
      >
        <form onSubmit={saveFaq} className="space-y-4">
          {formError && <p className="admin-alert-error">{formError}</p>}
          <div>
            <label className="field-label" htmlFor="faq-question">
              Pregunta
            </label>
            <input
              id="faq-question"
              className="input-field"
              required
              minLength={1}
              maxLength={300}
              value={faqForm.question}
              onChange={(e) =>
                setFaqForm((f) => ({ ...f, question: e.target.value }))
              }
              autoFocus
            />
          </div>
          <div>
            <label className="field-label" htmlFor="faq-answer">
              Respuesta
            </label>
            <textarea
              id="faq-answer"
              className="input-field"
              rows={5}
              required
              minLength={1}
              maxLength={5000}
              value={faqForm.answer}
              onChange={(e) =>
                setFaqForm((f) => ({ ...f, answer: e.target.value }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={faqForm.isActive}
              onChange={(e) =>
                setFaqForm((f) => ({ ...f, isActive: e.target.checked }))
              }
            />
            Pregunta activa (visible en el sitio de clientes)
          </label>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeFaqModal}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={savingFaq}>
              {savingFaq
                ? "Guardando…"
                : editingFaqId
                  ? "Guardar cambios"
                  : "Crear pregunta"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={faqReorderModalOpen}
        onClose={closeFaqReorderModal}
        title="Ordenar preguntas"
        description="Arrastra las preguntas para definir el orden en que se muestran en el FAQ del sitio de clientes."
      >
        <div className="space-y-4">
          {faqReorderError && (
            <p className="admin-alert-error">{faqReorderError}</p>
          )}

          {faqReorderList.length === 0 ? (
            <p className="text-sm text-gray-500">No hay preguntas.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {faqReorderList.map((faq, index) => (
                <li
                  key={faq.id}
                  draggable
                  onDragStart={() => setFaqDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (faqDragIndex === null || faqDragIndex === index)
                      return;
                    moveFaqReorderItem(faqDragIndex, index);
                    setFaqDragIndex(index);
                  }}
                  onDragEnd={() => setFaqDragIndex(null)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800",
                    faqDragIndex === index && "opacity-50",
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400" />
                  <span className="w-5 shrink-0 text-xs text-gray-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-white">
                    {faq.question}
                  </span>
                  {!faq.isActive && (
                    <span className="status-badge-inactive shrink-0">
                      Inactiva
                    </span>
                  )}
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => moveFaqReorderItem(index, index - 1)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => moveFaqReorderItem(index, index + 1)}
                      disabled={index === faqReorderList.length - 1}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeFaqReorderModal}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveFaqReorder}
              disabled={savingFaqReorder || faqReorderList.length === 0}
            >
              {savingFaqReorder ? "Guardando…" : "Guardar orden"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

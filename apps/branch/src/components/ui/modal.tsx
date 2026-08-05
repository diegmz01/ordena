"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Modal más ancho (p. ej. detalle de pedido en 2 columnas). */
  wide?: boolean;
  /** Aparece encima de otro modal (z-index mayor; Escape solo cierra este). */
  nested?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  headerExtra,
  children,
  footer,
  wide = false,
  nested = false,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (nested) {
        event.stopImmediatePropagation();
      }
      onClose();
    };
    document.addEventListener("keydown", onKey, nested);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, nested);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, nested]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex items-end justify-center sm:items-center sm:p-4 ${
        nested ? "z-[60]" : "z-50"
      }`}
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:rounded-2xl dark:border-border dark:bg-background ${
          wide ? "sm:max-w-4xl lg:max-w-5xl" : "sm:max-w-md"
        }`}
      >
        <div className="relative shrink-0 border-b border-gray-100 px-5 pb-3.5 pt-4 dark:border-border sm:px-6 sm:pt-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-gray-100 hover:text-slate-700 dark:hover:bg-surface-muted dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Cerrar</span>
          </button>

          <div className="pr-11">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id={titleId}
                className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white"
              >
                {title}
              </h2>
              {headerExtra}
            </div>
            {description && (
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-gray-100 bg-gray-50/95 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-border dark:bg-surface-muted/90 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

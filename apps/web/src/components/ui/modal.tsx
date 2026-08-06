"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, description, children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl dark:border-border dark:bg-background"
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
            <h2
              id={titleId}
              className="text-xl font-bold tracking-tight text-slate-900 dark:text-white"
            >
              {title}
            </h2>
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
      </div>
    </div>
  );
}

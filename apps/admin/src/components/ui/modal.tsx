"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: ModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-gray-200 bg-white p-5 shadow-2xl sm:rounded-xl dark:border-gray-700 dark:bg-gray-800 ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        } sm:p-6`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar</span>
        </button>

        <div className="mb-4 pr-8">
          <h2
            id="modal-title"
            className="text-lg font-bold text-gray-800 dark:text-white"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}

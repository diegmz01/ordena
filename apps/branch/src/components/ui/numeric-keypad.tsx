"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

type NumericKeypadProps = {
  value: string;
  onChange: (next: string) => void;
  onEnter?: () => void;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "enter"];

/** Pinpad numérico táctil para inputs de código/ticket en pantallas de branch. */
export function NumericKeypad({
  value,
  onChange,
  onEnter,
  maxLength,
  disabled = false,
  className,
}: NumericKeypadProps) {
  function pressDigit(digit: string) {
    if (disabled) return;
    if (maxLength && value.length >= maxLength) return;
    onChange(value + digit);
  }

  function backspace() {
    if (disabled) return;
    onChange(value.slice(0, -1));
  }

  return (
    <div className={cn("grid grid-cols-3 gap-2.5", className)}>
      {KEYS.map((key) => {
        if (key === "back") {
          return (
            <button
              key="back"
              type="button"
              aria-label="Borrar"
              disabled={disabled || value.length === 0}
              onClick={backspace}
              className="inline-flex h-14 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-800 transition-colors active:bg-gray-100 disabled:opacity-40 dark:border-border dark:bg-surface dark:text-white dark:active:bg-surface-muted"
            >
              <Delete className="size-5" />
            </button>
          );
        }
        if (key === "enter") {
          return (
            <button
              key="enter"
              type="button"
              aria-label="Confirmar"
              disabled={disabled || !onEnter}
              onClick={onEnter}
              className="btn-primary inline-flex h-14 items-center justify-center rounded-xl text-sm font-semibold disabled:opacity-40"
            >
              OK
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => pressDigit(key)}
            className="inline-flex h-14 items-center justify-center rounded-xl border border-gray-200 bg-white text-2xl font-semibold text-slate-800 transition-colors active:bg-gray-100 disabled:opacity-40 dark:border-border dark:bg-surface dark:text-white dark:active:bg-surface-muted"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

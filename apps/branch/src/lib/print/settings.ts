export type PaperWidth = 58 | 80;

const STORAGE_KEY = "ordena_branch_thermal_print";

type StoredSettings = {
  paperWidth: PaperWidth;
};

const DEFAULTS: StoredSettings = {
  paperWidth: 80,
};

function read(): StoredSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    const width = parsed.paperWidth === 58 ? 58 : 80;
    return { paperWidth: width };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(next: StoredSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getPrintSettings(): StoredSettings {
  return read();
}

export function setPaperWidth(paperWidth: PaperWidth) {
  const next = { ...read(), paperWidth };
  write(next);
  return next;
}

/** Caracteres por línea aproximados para ESC/POS Font A. */
export function charsPerLine(paperWidth: PaperWidth): number {
  return paperWidth === 58 ? 32 : 48;
}

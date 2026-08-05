import type { PaperWidth } from "./settings";

/**
 * Wordmark del header staff (`BrandLogo onBrand` usa logo.svg en fondo naranja).
 * En ticket usamos logo-orange.svg (misma forma “El Bajito”) para que imprima en negro.
 */
export const RECEIPT_LOGO_PATH = "/logos/logo-orange.svg";

export type LogoRaster = {
  /** Ancho en pixels (múltiplo de 8). */
  width: number;
  height: number;
  /** Bits empaquetados fila a fila, MSB = pixel izquierdo, 1 = negro. */
  data: Uint8Array;
};

let cachedRaster: LogoRaster | null = null;
let cacheKey: string | null = null;

function maxLogoWidth(paperWidth: PaperWidth): number {
  // Wordmark ancho (~2.7:1); ocupa casi el ancho útil del ticket.
  return paperWidth === 58 ? 240 : 384;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar el logo: ${src}`));
    img.src = src;
  });
}

/**
 * Raster monocromo del logo para ESC/POS (GS v 0).
 * Cachea por ancho de papel.
 */
export async function getLogoRaster(
  paperWidth: PaperWidth,
): Promise<LogoRaster | null> {
  const targetW = maxLogoWidth(paperWidth);
  const key = `${RECEIPT_LOGO_PATH}:${targetW}`;
  if (cachedRaster && cacheKey === key) return cachedRaster;

  try {
    const img = await loadImage(RECEIPT_LOGO_PATH);
    const scale = targetW / img.naturalWidth;
    let width = Math.max(8, Math.round(img.naturalWidth * scale));
    width = width - (width % 8); // múltiplo de 8
    const height = Math.max(
      1,
      Math.round((img.naturalHeight * width) / img.naturalWidth),
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const { data: rgba } = ctx.getImageData(0, 0, width, height);
    const bytesPerRow = width / 8;
    const data = new Uint8Array(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = rgba[i]!;
        const g = rgba[i + 1]!;
        const b = rgba[i + 2]!;
        const a = rgba[i + 3]!;
        // Pixel “tinta” si no es casi blanco / transparente.
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const ink = a > 128 && luminance < 200;
        if (ink) {
          data[y * bytesPerRow + (x >> 3)]! |= 0x80 >> (x & 7);
        }
      }
    }

    cachedRaster = { width, height, data };
    cacheKey = key;
    return cachedRaster;
  } catch {
    return null;
  }
}

export function receiptLogoUrl(): string {
  if (typeof window === "undefined") return RECEIPT_LOGO_PATH;
  return `${window.location.origin}${RECEIPT_LOGO_PATH}`;
}

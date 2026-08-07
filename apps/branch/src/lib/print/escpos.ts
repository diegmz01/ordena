import type { ReceiptLine } from "@ordena/shared";
import type { LogoRaster } from "./logo";
import { charsPerLine, type PaperWidth } from "./settings";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Map common Spanish chars to ASCII for CP437-ish thermal printers. */
function toPrinterText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, (m) => (m === "Ñ" ? "N" : "n"))
    .replace(/¿/g, "?")
    .replace(/¡/g, "!")
    .replace(/€/g, "EUR")
    .replace(/[^\x20-\x7E]/g, "?");
}

function encodeAscii(text: string): number[] {
  const s = toPrinterText(text);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    out.push(s.charCodeAt(i) & 0xff);
  }
  return out;
}

function padLine(
  text: string,
  width: number,
  align: "left" | "center" | "right",
): string {
  const t = toPrinterText(text).slice(0, width);
  const pad = width - t.length;
  if (pad <= 0) return t;
  if (align === "center") {
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + t + " ".repeat(pad - left);
  }
  if (align === "right") {
    return " ".repeat(pad) + t;
  }
  return t + " ".repeat(pad);
}

function appendLogoRaster(bytes: number[], raster: LogoRaster) {
  const widthBytes = raster.width / 8;
  bytes.push(ESC, 0x61, 1); // center
  // GS v 0 m xL xH yL yH data
  bytes.push(
    GS,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    raster.height & 0xff,
    (raster.height >> 8) & 0xff,
  );
  for (let i = 0; i < raster.data.length; i++) {
    bytes.push(raster.data[i]!);
  }
  bytes.push(LF);
  bytes.push(ESC, 0x61, 0);
}

export type EncodeEscPosOptions = {
  logoRaster?: LogoRaster | null;
};

/** Encode structured receipt lines to ESC/POS bytes. */
export function encodeEscPos(
  lines: ReceiptLine[],
  paperWidth: PaperWidth,
  options?: EncodeEscPosOptions,
): Uint8Array {
  const width = charsPerLine(paperWidth);
  const bytes: number[] = [];

  // Initialize
  bytes.push(ESC, 0x40);
  // Code page PC437
  bytes.push(ESC, 0x74, 0x00);

  for (const line of lines) {
    if (line.type === "logo") {
      if (options?.logoRaster) {
        appendLogoRaster(bytes, options.logoRaster);
      }
      continue;
    }
    if (line.type === "blank") {
      bytes.push(LF);
      continue;
    }
    if (line.type === "separator") {
      bytes.push(...encodeAscii("-".repeat(width)), LF);
      continue;
    }
    if (line.type === "cut") {
      bytes.push(LF, LF, LF);
      bytes.push(GS, 0x56, 0x00);
      continue;
    }
    if (line.type === "text") {
      const align = line.align ?? "left";
      const alignCode = align === "center" ? 1 : align === "right" ? 2 : 0;
      // Doble ancho/alto: la impresora imprime la mitad de caracteres por línea.
      const lineWidth = line.large ? Math.max(1, Math.floor(width / 2)) : width;
      bytes.push(ESC, 0x61, alignCode);
      bytes.push(ESC, 0x45, line.bold ? 1 : 0);
      bytes.push(GS, 0x21, line.large ? 0x11 : 0x00);
      const finalText =
        align === "left"
          ? toPrinterText(line.text).slice(0, lineWidth)
          : padLine(line.text, lineWidth, align);
      bytes.push(...encodeAscii(finalText), LF);
      bytes.push(GS, 0x21, 0x00);
      bytes.push(ESC, 0x45, 0);
      bytes.push(ESC, 0x61, 0);
    }
  }

  return new Uint8Array(bytes);
}

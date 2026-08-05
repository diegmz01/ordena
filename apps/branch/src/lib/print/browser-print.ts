import type { ReceiptLine } from "@ordena/shared";
import { receiptLogoUrl } from "./logo";
import { charsPerLine, type PaperWidth } from "./settings";

const IFRAME_ID = "ordena-thermal-print-frame";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lineToHtml(line: ReceiptLine, width: number): string {
  if (line.type === "logo") {
    return `<div class="logo"><img src="${escapeHtml(receiptLogoUrl())}" alt="" /></div>`;
  }
  if (line.type === "blank") return "<br/>";
  if (line.type === "separator") {
    return `<div class="sep">${escapeHtml("-".repeat(width))}</div>`;
  }
  if (line.type === "cut") return "";
  if (line.type === "text") {
    const align = line.align ?? "left";
    const bold = line.bold ? "bold" : "";
    return `<div class="line ${align} ${bold}">${escapeHtml(line.text)}</div>`;
  }
  return "";
}

function buildReceiptDocument(
  lines: ReceiptLine[],
  paperWidth: PaperWidth,
): string {
  const width = charsPerLine(paperWidth);
  const mm = paperWidth === 58 ? 58 : 80;
  const body = lines.map((l) => lineToHtml(l, width)).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ticket</title>
  <style>
    @page { margin: 0; size: ${mm}mm auto; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 4mm;
      width: ${mm}mm;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1.25;
      color: #000;
      background: #fff;
    }
    .logo { text-align: center; margin: 0 0 6px; }
    .logo img {
      width: ${paperWidth === 58 ? 42 : 52}mm;
      height: auto;
      display: inline-block;
    }
    .line { white-space: pre-wrap; word-break: break-word; }
    .line.center { text-align: center; }
    .line.right { text-align: right; }
    .line.left { text-align: left; }
    .line.bold { font-weight: 700; }
    .sep { letter-spacing: -0.5px; }
    @media print {
      html, body { width: ${mm}mm; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function getOrCreatePrintFrame(): HTMLIFrameElement {
  let frame = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  if (!frame) {
    frame = document.createElement("iframe");
    frame.id = IFRAME_ID;
    frame.setAttribute("title", "Impresión de ticket");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.appendChild(frame);
  }
  return frame;
}

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  ).then(() => undefined);
}

/**
 * Imprime vía iframe oculto (sin popup). Evita el bug de window.open+noopener
 * que abre about:blank y a la vez devuelve null.
 */
export async function printReceiptHtml(
  lines: ReceiptLine[],
  paperWidth: PaperWidth,
): Promise<void> {
  const html = buildReceiptDocument(lines, paperWidth);
  const frame = getOrCreatePrintFrame();
  const doc = frame.contentDocument;
  const win = frame.contentWindow;

  if (!doc || !win) {
    throw new Error("No se pudo preparar la impresión en este navegador");
  }

  doc.open();
  doc.write(html);
  doc.close();

  await waitForImages(doc);

  await new Promise<void>((resolve, reject) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          win.focus();
          win.print();
          resolve();
        } catch (err) {
          reject(
            err instanceof Error
              ? err
              : new Error("No se pudo abrir el diálogo de impresión"),
          );
        }
      });
    });
  });
}

import {
  buildReceiptTicket,
  buildTestReceiptTicket,
  type ReceiptLine,
  type ReceiptTicketOrder,
} from "@ordena/shared";
import { printReceiptHtml } from "./browser-print";
import { encodeEscPos } from "./escpos";
import { getLogoRaster } from "./logo";
import {
  getConnectedSerialPort,
  isWebSerialSupported,
  writeSerialBytes,
} from "./serial";
import { getPrintSettings } from "./settings";

export type PrintableOrder = ReceiptTicketOrder;

export type PrintOrderResult = {
  mode: "serial" | "browser";
};

export type PrintLinesOptions = {
  /** Prefer browser print even if Serial is available. */
  forceBrowser?: boolean;
};

async function sendLines(
  lines: ReceiptLine[],
  options?: PrintLinesOptions,
): Promise<PrintOrderResult> {
  const { paperWidth } = getPrintSettings();
  const needsLogo = lines.some((l) => l.type === "logo");
  const logoRaster = needsLogo ? await getLogoRaster(paperWidth) : null;

  if (!options?.forceBrowser && isWebSerialSupported()) {
    const port = await getConnectedSerialPort();
    if (port) {
      const bytes = encodeEscPos(lines, paperWidth, { logoRaster });
      await writeSerialBytes(port, bytes);
      return { mode: "serial" };
    }
  }

  await printReceiptHtml(lines, paperWidth);
  return { mode: "browser" };
}

export async function printOrder(
  order: PrintableOrder,
  branchName: string,
  options?: PrintLinesOptions,
): Promise<PrintOrderResult> {
  const lines = buildReceiptTicket({ order, branchName });
  return sendLines(lines, options);
}

export async function printTestTicket(
  branchName: string,
  options?: PrintLinesOptions,
): Promise<PrintOrderResult> {
  const lines = buildTestReceiptTicket(branchName);
  return sendLines(lines, options);
}

export {
  getPrintSettings,
  setPaperWidth,
  type PaperWidth,
} from "./settings";
export {
  isWebSerialSupported,
  requestSerialPort,
  getConnectedSerialPort,
  clearCachedSerialPort,
} from "./serial";

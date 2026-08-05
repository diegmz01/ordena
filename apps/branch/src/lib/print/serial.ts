/** Minimal Web Serial typings used by thermal print. */
export type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

type SerialLike = {
  requestPort: () => Promise<SerialPortLike>;
  getPorts: () => Promise<SerialPortLike[]>;
};

function getSerial(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { serial?: SerialLike };
  return nav.serial ?? null;
}

export function isWebSerialSupported(): boolean {
  return getSerial() != null;
}

let cachedPort: SerialPortLike | null = null;

export async function getConnectedSerialPort(): Promise<SerialPortLike | null> {
  if (cachedPort) return cachedPort;
  const serial = getSerial();
  if (!serial) return null;
  try {
    const ports = await serial.getPorts();
    cachedPort = ports[0] ?? null;
    return cachedPort;
  } catch {
    return null;
  }
}

/** Requires a user gesture. */
export async function requestSerialPort(): Promise<SerialPortLike> {
  const serial = getSerial();
  if (!serial) {
    throw new Error(
      "Web Serial no está disponible. Usa Chrome o Edge en escritorio.",
    );
  }
  const port = await serial.requestPort();
  cachedPort = port;
  return port;
}

export async function writeSerialBytes(
  port: SerialPortLike,
  data: Uint8Array,
): Promise<void> {
  // Some browsers keep the port "open" across sessions; reopen if needed.
  try {
    await port.open({ baudRate: 9600 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Already open is fine.
    if (!/already open/i.test(msg)) {
      throw err;
    }
  }

  if (!port.writable) {
    throw new Error("El puerto serial no es escribible");
  }

  const writer = port.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

export function clearCachedSerialPort() {
  cachedPort = null;
}

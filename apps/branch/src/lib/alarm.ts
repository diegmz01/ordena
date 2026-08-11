/**
 * Sirena sintetizada vía Web Audio API (osciladores + gain) para alertar al
 * staff de pedidos sin aceptar mientras la PWA esté abierta (aunque la
 * pestaña esté de fondo). No hay ni se agrega ningún asset de audio — el
 * sonido se genera por código, escalando en volumen/frecuencia cuanto más
 * tiempo lleva sonando.
 *
 * No cubre el caso de app completamente suspendida/pantalla apagada — eso
 * lo cubre el reenvío de push urgente desde el servidor (ver
 * apps/api/src/utils/escalate-unaccepted-orders.ts).
 */

const STORAGE_KEY = "ordena_branch_alarm_enabled";

let audioCtx: AudioContext | null = null;
let activeOscillators: OscillatorNode[] = [];
let escalationTimer: ReturnType<typeof setTimeout> | null = null;
let startedAtMs: number | null = null;

export function isAlarmEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setAlarmEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

function getContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** Algunos navegadores suspenden el AudioContext al perder foco por mucho
 * tiempo; reanudarlo es inofensivo si ya estaba corriendo. */
function ensureRunning(ctx: AudioContext) {
  if (ctx.state === "suspended") void ctx.resume();
}

/**
 * Debe llamarse dentro de un gesto de usuario (click) para desbloquear el
 * AudioContext bajo la política de autoplay del navegador — en particular
 * iOS Safari solo desbloquea audio si el primer sonido se dispara
 * síncronamente dentro del handler del gesto.
 */
export function unlockAudio() {
  const ctx = getContext();
  ensureRunning(ctx);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

/**
 * Un ciclo = 3 beeps cortos en ráfaga (patrón tipo detector de humo, mucho
 * más urgente/fastidioso que un beep aislado). Cada beep suena con dos
 * osciladores desafinados entre sí (`detune`), lo que genera un "batido"
 * áspero e imposible de ignorar en vez de un tono limpio.
 */
function playBeepCycle(ctx: AudioContext, intensity: number) {
  const baseFreq = 1050 + intensity * 350; // 1050Hz -> 1400Hz, muy agudo/penetrante
  const detune = 16; // Hz de separación entre osciladores -> batido áspero
  const gainValue = 0.28 + intensity * 0.32; // 0.28 -> 0.6 por oscilador (van dos a la vez)
  const beepDurationS = 0.11;
  const gapS = 0.07;
  const beepsPerCycle = 3;

  for (let i = 0; i < beepsPerCycle; i++) {
    const startAt = ctx.currentTime + i * (beepDurationS + gapS);
    for (const freq of [baseFreq, baseFreq + detune]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      // Ataque/caída casi instantáneos para que suene como un timbrazo, no
      // un tono suave.
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(gainValue, startAt + 0.005);
      gain.gain.setValueAtTime(gainValue, startAt + beepDurationS - 0.015);
      gain.gain.linearRampToValueAtTime(0, startAt + beepDurationS);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + beepDurationS + 0.02);
      activeOscillators.push(osc);
      osc.onended = () => {
        activeOscillators = activeOscillators.filter((o) => o !== osc);
      };
    }
  }
}

export function startAlarm() {
  if (escalationTimer) return; // ya sonando
  if (!isAlarmEnabled()) return;
  const ctx = getContext();
  ensureRunning(ctx);
  startedAtMs = Date.now();

  // setTimeout recursivo (no setInterval) para poder acelerar la cadencia
  // entre ráfagas a medida que sube la intensidad, no solo el volumen/tono.
  const tick = () => {
    ensureRunning(ctx);
    const elapsed = Date.now() - (startedAtMs ?? Date.now());
    const intensity = Math.min(1, elapsed / 45_000); // llega al máximo en ~45s
    playBeepCycle(ctx, intensity);
    const intervalMs = 1500 - intensity * 900; // 1500ms -> 600ms entre ráfagas
    escalationTimer = setTimeout(tick, intervalMs);
  };

  tick();
}

export function stopAlarm() {
  if (escalationTimer) {
    clearTimeout(escalationTimer);
    escalationTimer = null;
  }
  startedAtMs = null;
  for (const osc of activeOscillators) {
    try {
      osc.stop();
    } catch {
      // ya detenido
    }
  }
  activeOscillators = [];
}

export function isAlarmRunning(): boolean {
  return escalationTimer !== null;
}

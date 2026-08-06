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
let escalationTimer: ReturnType<typeof setInterval> | null = null;
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

function playBeepCycle(ctx: AudioContext, intensity: number) {
  // intensity 0..1 sube el volumen/tono y agrega un doble-beep, para dar
  // sensación de "escalada" cuanto más tiempo lleva sonando sin atenderse.
  const freq = 880 + intensity * 220; // 880Hz -> 1100Hz
  const gainValue = 0.15 + intensity * 0.25; // 0.15 -> 0.4
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.18);
  activeOscillators.push(osc);
  osc.onended = () => {
    activeOscillators = activeOscillators.filter((o) => o !== osc);
  };
}

export function startAlarm() {
  if (escalationTimer) return; // ya sonando
  if (!isAlarmEnabled()) return;
  const ctx = getContext();
  ensureRunning(ctx);
  startedAtMs = Date.now();

  const tick = () => {
    ensureRunning(ctx);
    const elapsed = Date.now() - (startedAtMs ?? Date.now());
    const intensity = Math.min(1, elapsed / 60_000); // escala en ~60s
    playBeepCycle(ctx, intensity);
    if (intensity > 0.66) {
      setTimeout(() => playBeepCycle(ctx, intensity), 220);
    }
  };

  tick();
  const intervalMs = 1800; // cadencia base entre ciclos de beep
  escalationTimer = setInterval(tick, intervalMs);
}

export function stopAlarm() {
  if (escalationTimer) {
    clearInterval(escalationTimer);
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

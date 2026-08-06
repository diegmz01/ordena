export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOSUserAgent = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reporta como "MacIntel" pero soporta touch, a diferencia de un Mac real.
  const isIPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOSUserAgent || isIPadOS;
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    iosStandalone === true
  );
}

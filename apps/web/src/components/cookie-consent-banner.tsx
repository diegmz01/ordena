"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "ordena-cookie-consent";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lee la elección guardada en localStorage tras montar (SSR-safe)
      setVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-consent-banner" role="region" aria-label="Aviso de cookies">
      <p>
        Usamos cookies necesarias para el funcionamiento del sitio (como
        mantener tu sesión iniciada). Al continuar aceptas nuestra{" "}
        <Link href="/privacidad" className="font-medium text-orange-600 underline dark:text-orange-400">
          Política de privacidad
        </Link>
        .
      </p>
      <button type="button" onClick={accept} className="pwa-btn-primary shrink-0">
        Entendido
      </button>
    </div>
  );
}

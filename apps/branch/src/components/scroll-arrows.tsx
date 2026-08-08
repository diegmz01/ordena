"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

const SCROLL_STEP = 320;
const EDGE_THRESHOLD = 4;

/** Flechas flotantes para desplazar la página en pantallas touch de escritorio. */
export function ScrollArrows() {
  const [scrollable, setScrollable] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } =
        document.documentElement;
      setScrollable(scrollHeight - clientHeight > EDGE_THRESHOLD * 2);
      setAtTop(scrollTop <= EDGE_THRESHOLD);
      setAtBottom(scrollTop + clientHeight >= scrollHeight - EDGE_THRESHOLD);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const observer = new ResizeObserver(update);
    observer.observe(document.body);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, []);

  if (!scrollable) return null;

  return (
    <div className="fixed bottom-24 right-4 z-40 flex flex-col gap-2">
      <button
        type="button"
        onClick={() =>
          window.scrollBy({ top: -SCROLL_STEP, behavior: "smooth" })
        }
        disabled={atTop}
        aria-label="Desplazar hacia arriba"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40 dark:border-border dark:bg-gray-900 dark:text-gray-300"
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() =>
          window.scrollBy({ top: SCROLL_STEP, behavior: "smooth" })
        }
        disabled={atBottom}
        aria-label="Desplazar hacia abajo"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40 dark:border-border dark:bg-gray-900 dark:text-gray-300"
      >
        <ChevronDown className="h-5 w-5" />
      </button>
    </div>
  );
}

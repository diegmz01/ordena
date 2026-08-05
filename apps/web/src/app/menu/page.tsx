import { Suspense } from "react";
import MenuPage from "./menu-client";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-zinc-500">Cargando menú…</div>}>
      <MenuPage />
    </Suspense>
  );
}

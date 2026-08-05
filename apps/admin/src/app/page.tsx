export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Backoffice</h1>
        <p className="page-description">
          Administra menú, sucursales, pedidos y configuración. Datos vía API
          (`:4000`).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Menú", "/menu", "Categorías y productos"],
          ["Sucursales", "/sucursales", "Horarios y staff"],
          ["Pedidos", "/pedidos", "Vista global"],
          ["Finanzas", "/finanzas", "Ventas y liquidaciones Stripe"],
        ].map(([title, href, desc]) => (
          <a key={href} href={href} className="admin-panel transition hover:border-orange-300">
            <div className="admin-panel-body">
              <h2 className="font-semibold text-gray-800 dark:text-white">
                {title}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{desc}</p>
              <span className="link-action mt-3 px-0">Abrir →</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

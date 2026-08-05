import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ordena",
    short_name: "Ordena",
    description:
      "Ordena comida para recoger. Recibe notificaciones del estado de tu pedido.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#f97316",
    lang: "es",
    orientation: "portrait-primary",
    categories: ["food", "lifestyle"],
    icons: [
      {
        src: "/logos/icono.png",
        sizes: "150x150",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_CUSTOMER_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/checkout",
        "/carrito",
        "/pedidos",
        "/pedido/",
        "/login",
        "/registro",
        "/olvide-password",
        "/reset-password",
        "/auth/",
        "/api-backend/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

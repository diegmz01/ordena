import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_CUSTOMER_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }> = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/sucursales", changeFrequency: "weekly", priority: 0.8 },
    { path: "/faq", changeFrequency: "weekly", priority: 0.5 },
    { path: "/privacidad", changeFrequency: "monthly", priority: 0.3 },
    { path: "/terminos", changeFrequency: "monthly", priority: 0.3 },
  ];

  return routes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

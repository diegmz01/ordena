import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { prisma } from "../src";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Seed bloqueado en production. Crea usuarios reales desde admin o un script controlado.",
    );
  }

  const password = process.env.DEV_AUTH_PASSWORD ?? "OrdenaDev2026!";
  const passwordHash = await bcrypt.hash(password, 12);

  const centro = await prisma.branch.upsert({
    where: { slug: "centro" },
    update: {
      latitude: 19.4326,
      longitude: -99.1332,
    },
    create: {
      name: "Centro",
      slug: "centro",
      address: "Av. Principal 100, Centro",
      phone: "555-0001",
      isActive: true,
      latitude: 19.4326,
      longitude: -99.1332,
    },
  });

  await prisma.branch.upsert({
    where: { slug: "norte" },
    update: {
      latitude: 19.457,
      longitude: -99.14,
    },
    create: {
      name: "Norte",
      slug: "norte",
      address: "Blvd. Norte 250",
      phone: "555-0002",
      isActive: true,
      latitude: 19.457,
      longitude: -99.14,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@ordena.local" },
    update: { passwordHash, role: "ADMIN" },
    create: {
      email: "admin@ordena.local",
      name: "Admin Ordena",
      role: "ADMIN",
      passwordHash,
    },
  });

  await prisma.user.upsert({
    where: { email: "sucursal@ordena.local" },
    update: { passwordHash, role: "BRANCH_STAFF", branchId: centro.id },
    create: {
      email: "sucursal@ordena.local",
      name: "Staff Centro",
      role: "BRANCH_STAFF",
      branchId: centro.id,
      passwordHash,
    },
  });

  await prisma.user.upsert({
    where: { email: "cliente@ordena.local" },
    update: { passwordHash, role: "CUSTOMER" },
    create: {
      email: "cliente@ordena.local",
      name: "Cliente Demo",
      role: "CUSTOMER",
      passwordHash,
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: "favoritos" },
    update: { name: "Favoritos" },
    create: {
      name: "Favoritos",
      slug: "favoritos",
      sortOrder: 1,
    },
  });

  const burger = await prisma.product.upsert({
    where: { slug: "hamburguesa-clasica" },
    update: {},
    create: {
      name: "Hamburguesa clásica",
      slug: "hamburguesa-clasica",
      description: "Carne, queso y vegetales",
      basePrice: 12000,
      categoryId: category.id,
    },
  });

  await prisma.branchProduct.upsert({
    where: {
      branchId_productId: { branchId: centro.id, productId: burger.id },
    },
    update: { available: true },
    create: {
      branchId: centro.id,
      productId: burger.id,
      available: true,
    },
  });

  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: "cliente@ordena.local" },
  });

  const businessDate = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.TZ?.trim() || "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()) + "T00:00:00.000Z",
  );

  /** Mismo formato que generateOrderNumber() en la API: ORD-YYMMDDHHMM-NNN */
  function seedOrderNumber(suffix: number) {
    const now = new Date();
    const stamp = [
      now.getFullYear().toString().slice(-2),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
    ].join("");
    return `ORD-${stamp}-${suffix}`;
  }

  // Limpia demos viejos (ORD-SEED-*) y demos previos de este seed
  await prisma.order.deleteMany({
    where: {
      OR: [
        { orderNumber: { startsWith: "ORD-SEED-" } },
        {
          userId: customer.id,
          branchId: centro.id,
          notes: { startsWith: "Demo:" },
        },
      ],
    },
  });

  const demoOrders: Array<{
    orderNumber: string;
    status: "PAID" | "ACCEPTED" | "PREPARING" | "READY";
    quantity: number;
    dayNumber: number;
    notes?: string;
    ptvTicket?: number | null;
    prepMinutes?: number | null;
    readyAt?: Date | null;
  }> = [
    {
      orderNumber: seedOrderNumber(101),
      status: "PAID",
      quantity: 2,
      dayNumber: 1,
      notes: "Demo: por verificar / aceptar",
      ptvTicket: null,
    },
    {
      orderNumber: seedOrderNumber(102),
      status: "ACCEPTED",
      quantity: 1,
      dayNumber: 2,
      notes: "Demo: aceptado sin ticket",
      ptvTicket: null,
    },
    {
      orderNumber: seedOrderNumber(103),
      status: "PREPARING",
      quantity: 3,
      dayNumber: 3,
      notes: "Demo: preparando",
      ptvTicket: 17,
      prepMinutes: 15,
      readyAt: new Date(Date.now() + 15 * 60_000),
    },
    {
      orderNumber: seedOrderNumber(104),
      status: "READY",
      quantity: 1,
      dayNumber: 4,
      notes: "Demo: listo para entregar",
      ptvTicket: 18,
      prepMinutes: 10,
      readyAt: new Date(Date.now() - 60_000),
    },
  ];

  for (const demo of demoOrders) {
    const unitPrice = burger.basePrice;
    const lineTotal = unitPrice * demo.quantity;

    await prisma.order.create({
      data: {
        orderNumber: demo.orderNumber,
        status: demo.status,
        branchId: centro.id,
        userId: customer.id,
        subtotal: lineTotal,
        discount: 0,
        total: lineTotal,
        currency: "mxn",
        notes: demo.notes,
        paidAt: new Date(),
        dayNumber: demo.dayNumber,
        businessDate,
        ptvTicket: demo.ptvTicket ?? null,
        prepMinutes: demo.prepMinutes ?? null,
        readyAt: demo.readyAt ?? null,
        paymentBrand: "visa",
        paymentFunding: demo.dayNumber % 2 === 0 ? "credit" : "debit",
        paymentLast4: String(4240 + demo.dayNumber),
        items: {
          create: [
            {
              productId: burger.id,
              productName: burger.name,
              variantName: null,
              unitPrice,
              quantity: demo.quantity,
              lineTotal,
            },
          ],
        },
      },
    });
  }

  const faqs = [
    {
      question: "¿Cómo hago un pedido para recoger?",
      answer:
        "Elige tu sucursal, arma tu pedido desde el menú y paga en línea. Te avisaremos cuando esté listo para recoger.",
      sortOrder: 1,
    },
    {
      question: "¿Puedo cancelar mi pedido?",
      answer:
        "Puedes cancelar mientras el pedido no haya sido aceptado por la sucursal. Una vez aceptado, contacta directamente a la sucursal.",
      sortOrder: 2,
    },
    {
      question: "¿Qué métodos de pago aceptan?",
      answer: "Aceptamos tarjetas de crédito y débito a través de Stripe.",
      sortOrder: 3,
    },
  ];

  for (const faq of faqs) {
    await prisma.faq.upsert({
      where: { id: `seed-${faq.sortOrder}` },
      update: { question: faq.question, answer: faq.answer },
      create: { id: `seed-${faq.sortOrder}`, ...faq },
    });
  }

  await prisma.siteContent.upsert({
    where: { id: "privacidad" },
    update: {},
    create: {
      id: "privacidad",
      title: "Aviso de Privacidad",
      content:
        "Este es un aviso de privacidad de ejemplo. Edítalo desde el panel de administración en la sección Contenido.",
    },
  });

  await prisma.siteContent.upsert({
    where: { id: "terminos" },
    update: {},
    create: {
      id: "terminos",
      title: "Términos y Condiciones",
      content:
        "Estos son los términos y condiciones de ejemplo. Edítalos desde el panel de administración en la sección Contenido.",
    },
  });

  console.log("Seed OK");
  console.log("  admin@ordena.local /", password);
  console.log("  sucursal@ordena.local /", password);
  console.log("  cliente@ordena.local /", password);
  console.log("  Pedidos demo Centro:", demoOrders.map((o) => o.orderNumber).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

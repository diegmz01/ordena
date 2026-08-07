import { z } from "zod";
import { ROLES } from "./constants";

/**
 * Denylist mínima de contraseñas triviales (sin depender de un servicio externo
 * tipo HaveIBeenPwned). No reemplaza políticas de contraseña reales, solo
 * bloquea los casos más obvios.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "letmein123",
  "admin1234",
  "admin123",
  "welcome123",
  "changeme123",
  "ordena123",
]);

/** Password schema con longitud mínima real y bloqueo de valores triviales. */
function strongPasswordSchema(minLength: number) {
  return z
    .string()
    .min(
      minLength,
      `La contraseña debe tener al menos ${minLength} caracteres`,
    )
    .max(72, "Contraseña demasiado larga") // límite de bcrypt
    .refine(
      (value) => !COMMON_PASSWORDS.has(value.toLowerCase()),
      "Esa contraseña es demasiado común, elige otra",
    );
}

/** Login mantiene el mínimo histórico (6): no se puede subirlo retroactivamente
 * sin bloquear cuentas ya creadas con contraseñas más cortas. La política fuerte
 * aplica en registro/creación (strongPasswordSchema). */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  expectedRole: z.enum(ROLES).optional(),
});

export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: strongPasswordSchema(10),
  phone: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: strongPasswordSchema(10),
});

export const updateCustomerPhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8, "El teléfono debe tener al menos 8 dígitos")
    .max(20, "Teléfono demasiado largo")
    .regex(/^[\d\s+\-()]+$/, "Usa un número de teléfono válido"),
});

export const guestCheckoutSchema = z.object({
  guestName: z.string().min(2).optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().min(8).optional(),
  branchId: z.string().min(1),
  notes: z.string().max(500).optional(),
  /**
   * Generada por el cliente (crypto.randomUUID()) al entrar a checkout y
   * reenviada tal cual en reintentos: evita crear pedidos/Stripe Sessions
   * duplicados por doble submit o retry de red.
   */
  idempotencyKey: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        variantName: z.string().optional(),
        /** Ignorado en servidor: el precio se recalcula. */
        unitPrice: z.number().int().nonnegative().optional(),
        productName: z.string().min(1).optional(),
        modifierIds: z.array(z.string().min(1)).max(20).optional(),
        /** Agrupación visual Plato/Persona; no afecta el cobro. */
        plateLabel: z.string().trim().min(1).max(40).optional(),
        /** Producto combinado (misma categoría); los modificadores son solo del principal. */
        secondaryProductId: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(50, "Máximo 50 productos por pedido"),
});

/** Validación en vivo del carrito antes de pagar (sin crear pedido). */
export const checkoutValidateSchema = z.object({
  branchId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        productName: z.string().min(1).optional(),
        modifierIds: z.array(z.string().min(1)).max(20).optional(),
        secondaryProductId: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(50, "Máximo 50 productos por pedido"),
});

/** Destinos de `PATCH /orders/:id/status` (PREPARING va por `/start-prep`). */
export const updateOrderStatusSchema = z
  .object({
    status: z.enum(["ACCEPTED", "READY", "COMPLETED", "CANCELLED"]),
    /** Requerido al pasar a COMPLETED: código de entrega dado por el cliente. */
    pickupCode: z.string().trim().min(1).max(10).optional(),
    /** Requerido al pasar a CANCELLED: motivo ingresado por el staff. */
    cancellationReason: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (data) => data.status !== "CANCELLED" || !!data.cancellationReason,
    {
      message: "El motivo de cancelación es obligatorio",
      path: ["cancellationReason"],
    },
  );

/** Body de `POST /orders/:id/admin-cancel`: motivo obligatorio de cancelación. */
export const adminCancelOrderSchema = z.object({
  cancellationReason: z.string().trim().min(1).max(500),
});

/**
 * Body de `POST /orders/:id/refund`: reembolso parcial de uno o varios
 * productos de un pedido ya cobrado por Stripe (no cancela el pedido).
 */
export const orderRefundSchema = z.object({
  reason: z.string().trim().min(1, "El motivo es obligatorio").max(500),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Selecciona al menos un producto a devolver")
    .max(50),
});

export const updateOrderItemAvailabilitySchema = z.object({
  unavailable: z.boolean(),
});

export const assignPtvTicketSchema = z.object({
  ptvTicket: z
    .number({ invalid_type_error: "El ticket debe ser un número" })
    .int("El ticket debe ser un entero")
    .positive("El ticket debe ser mayor a 0")
    .max(999999, "Ticket demasiado grande")
    .nullable(),
});

export const startOrderPrepSchema = z.object({
  prepMinutes: z
    .number({ invalid_type_error: "El tiempo debe ser un número" })
    .int()
    .min(5, "Mínimo 5 minutos")
    .max(180, "Máximo 180 minutos"),
});

/** Aceptar pedido PAID: ticket PTV + minutos → pasa directo a PREPARING */
export const acceptOrderSchema = z.object({
  ptvTicket: z
    .number({ invalid_type_error: "El ticket debe ser un número" })
    .int("El ticket debe ser un entero")
    .positive("El ticket debe ser mayor a 0")
    .max(999999, "Ticket demasiado grande"),
  prepMinutes: z
    .number({ invalid_type_error: "El tiempo debe ser un número" })
    .int()
    .min(5, "Mínimo 5 minutos")
    .max(180, "Máximo 180 minutos"),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  orderId: z.string().min(1).optional(),
  /** Token de tracking del pedido (invitados); requerido si no hay sesión dueña */
  viewToken: z.string().min(1).optional(),
  guestEmail: z.string().email().optional(),
  /** Si true (o staff autenticado), suscripción de sucursal para pedidos nuevos. */
  staffBranch: z.boolean().optional(),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
  /** Mismo viewToken de invitado usado al crear la suscripción, si aplica. */
  viewToken: z.string().min(1).optional(),
});

export const categoryCreateSchema = z.object({
  name: z.string().min(2, "Nombre demasiado corto"),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export const productCreateSchema = z.object({
  name: z.string().min(2, "Nombre demasiado corto"),
  description: z.string().max(1000).optional().nullable(),
  /** Precio en pesos MXN (se convierte a centavos en la API). */
  price: z.number().positive("El precio debe ser mayor a 0"),
  categoryId: z.string().min(1, "Categoría requerida"),
  imageUrl: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional(),
  isActive: z.boolean().optional(),
  modifierIds: z.array(z.string().min(1)).max(50).optional(),
  /** Permite combinarlo con otro producto de la misma categoría. */
  allowCombo: z.boolean().optional(),
});

export const productUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().max(1000).optional().nullable(),
  price: z.number().positive().optional(),
  categoryId: z.string().min(1).optional(),
  imageUrl: z
    .union([z.string().url(), z.literal(""), z.null()])
    .optional(),
  isActive: z.boolean().optional(),
  /** IDs de modificadores asignados al producto (reemplazo completo). */
  modifierIds: z.array(z.string().min(1)).max(50).optional(),
  /** Permite combinarlo con otro producto de la misma categoría. */
  allowCombo: z.boolean().optional(),
});

export const modifierCreateSchema = z.object({
  name: z.string().min(2, "Nombre demasiado corto"),
  /** Incremento en pesos MXN (se convierte a centavos en la API). */
  priceDelta: z.number().min(0, "El incremento no puede ser negativo"),
  sortOrder: z.number().int().optional(),
  /** true = obligatorio (incluido); false = opcional (el cliente decide). */
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const modifierUpdateSchema = modifierCreateSchema.partial();

const timeHm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:mm inválido");

export const branchDayHoursSchema = z
  .object({
    closed: z.boolean(),
    open: timeHm.optional(),
    close: timeHm.optional(),
  })
  .superRefine((day, ctx) => {
    if (!day.closed) {
      if (!day.open) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Hora de apertura requerida",
          path: ["open"],
        });
      }
      if (!day.close) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Hora de cierre requerida",
          path: ["close"],
        });
      }
    }
  });

export const branchHoursSchema = z.object({
  mon: branchDayHoursSchema,
  tue: branchDayHoursSchema,
  wed: branchDayHoursSchema,
  thu: branchDayHoursSchema,
  fri: branchDayHoursSchema,
  sat: branchDayHoursSchema,
  sun: branchDayHoursSchema,
});

/** Código de sucursal (ej. S01): letras y números, se guarda en mayúsculas. */
export const branchCodeSchema = z
  .string()
  .trim()
  .min(1, "Código requerido")
  .max(12, "Máximo 12 caracteres")
  .regex(/^[A-Za-z0-9]+$/, "Solo letras y números (ej. S01)")
  .transform((value) => value.toUpperCase());

export const branchCreateSchema = z.object({
  name: z.string().min(2, "Nombre demasiado corto"),
  code: branchCodeSchema,
  address: z.string().min(5, "Dirección demasiado corta"),
  phone: z.string().min(8).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  hours: branchHoursSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  staffEmail: z.string().email("Email de staff inválido"),
  staffPassword: strongPasswordSchema(12),
});

export const branchUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  code: branchCodeSchema.optional(),
  address: z.string().min(5).optional(),
  phone: z.string().min(8).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  hours: branchHoursSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  staffEmail: z.string().email().optional(),
  staffPassword: strongPasswordSchema(12).optional(),
});

export type BranchHours = z.infer<typeof branchHoursSchema>;
export type BranchDayHours = z.infer<typeof branchDayHoursSchema>;

export const branchAvailabilitySchema = z.enum([
  "AUTO",
  "OPEN",
  "PAUSED",
  "CLOSED",
]);

export const branchAvailabilityUpdateSchema = z.object({
  availability: branchAvailabilitySchema,
  pauseMinutes: z
    .union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)])
    .optional()
    .nullable(),
});

export type BranchAvailabilityStatus = z.infer<typeof branchAvailabilitySchema>;

export const staffAwayReasonSchema = z.enum(["APP_CLOSED", "CONNECTION_LOST"]);

export const staffAwaySchema = z.object({
  reason: staffAwayReasonSchema.default("APP_CLOSED"),
});

export const branchSettingsUpdateSchema = z.object({
  prepTimeMinutes: z
    .number()
    .int()
    .min(5, "Mínimo 5 minutos")
    .max(180, "Máximo 180 minutos")
    .optional(),
  menuStockEnabled: z.boolean().optional(),
}).refine(
  (v) => v.prepTimeMinutes !== undefined || v.menuStockEnabled !== undefined,
  { message: "Nada que actualizar" },
);

export const staffMenuStockUpdateSchema = z
  .object({
    /** true = con stock; false = agotar (requiere duration). No cambia el catálogo admin. */
    inStock: z.boolean(),
    /** Solo si inStock=false: minutos, day (hasta mañana) o manual (hasta reactivar). */
    duration: z
      .union([
        z.literal(30),
        z.literal(60),
        z.literal(120),
        z.literal("day"),
        z.literal("manual"),
      ])
      .optional(),
  })
  .refine((v) => v.inStock || v.duration !== undefined, {
    message: "Indica duración al agotar: 30, 60, 120, day o manual",
    path: ["duration"],
  });

export const branchMenuUpdateSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        available: z.boolean(),
      }),
    )
    .min(1)
    .max(1000, "Demasiados productos en una sola actualización"),
});

/** `password` vacío u omitido = conservar la contraseña SMTP ya guardada. */
export const smtpSettingsSchema = z.object({
  host: z.string().min(1, "Host requerido"),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().optional(),
  password: z.string().optional(),
  fromEmail: z.string().email("Correo remitente inválido"),
  fromName: z.string().optional(),
});

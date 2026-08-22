-- AlterEnum
-- Postgres no permite quitar un valor de un enum directamente: se recrea el
-- tipo sin PENDING_PAYMENT, se migra la columna, y se reemplaza el tipo viejo.
-- Confirmado antes de escribir esta migración: no hay filas de "Order" con
-- status = 'PENDING_PAYMENT' (era inalcanzable desde el cambio que difiere la
-- creación del Order hasta que Stripe confirma el pago).
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PAID', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PAID';
COMMIT;

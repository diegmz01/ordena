-- Se retira "Sign in with Apple". No había filas con provider = 'APPLE'
-- (0 registros en OAuthAccount al momento de esta migración), así que no
-- hace falta backfill: Postgres no soporta DROP VALUE en un enum, hay que
-- recrear el tipo.
BEGIN;

ALTER TYPE "OAuthProvider" RENAME TO "OAuthProvider_old";

CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK');

ALTER TABLE "OAuthAccount"
  ALTER COLUMN "provider" TYPE "OAuthProvider"
  USING ("provider"::text::"OAuthProvider");

DROP TYPE "OAuthProvider_old";

COMMIT;

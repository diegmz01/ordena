import dotenv from "dotenv";
import path from "path";

// Debe ser el primer import de index.ts. El singleton de Prisma en
// packages/database se construye al importarlo (top-level `new
// PrismaClient()`), y en CommonJS los require() de index.ts corren en el
// orden en que aparecen — si dotenv.config() se llamara después del primer
// import que arrastra @ordena/database (p. ej. cualquier router), Prisma ya
// habría leído DATABASE_URL del entorno del proceso (PM2/systemd) antes de
// que el override de este archivo pudiera aplicarse.
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

// Los tests son unitarios (no tocan una DB real), pero importar rutas/utils
// arrastra "@ordena/database", cuyo PrismaClient exige DATABASE_URL resoluble
// en el constructor aunque nunca se ejecute una query. Un valor dummy alcanza.
process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/ordena_test";
process.env.JWT_SECRET ??= "test-jwt-secret-not-for-production-use-only";

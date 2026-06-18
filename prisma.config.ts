import { defineConfig, env } from "prisma/config";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),

  },
  migrations: {
    path: "prisma/migrations",
  },
});

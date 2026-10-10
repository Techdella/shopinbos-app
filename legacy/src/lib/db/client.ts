import { createRequire } from "node:module";
import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};
const require = createRequire(import.meta.url);

function getPoolLimit() {
  const configured = Number(process.env.PRISMA_POOL_LIMIT ?? process.env.DATABASE_POOL_LIMIT);

  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }

  return 5;
}

function createPrismaClientInstance() {
  const log: Prisma.LogLevel[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

  if (connectionString) {
    try {
      const { PrismaPg } = require("@prisma/adapter-pg") as {
        PrismaPg: new (
          options: {
            connectionString: string;
            max: number;
            idleTimeoutMillis: number;
            connectionTimeoutMillis: number;
          },
          adapterOptions?: {
            onPoolError?: (error: Error) => void;
            onConnectionError?: (error: Error) => void;
          },
        ) => Prisma.PrismaClientOptions["adapter"];
      };

      return new PrismaClient({
        adapter: new PrismaPg(
          {
            connectionString,
            max: getPoolLimit(),
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
          },
          {
            onPoolError(error) {
              console.warn("Prisma pg pool error", error);
            },
            onConnectionError(error) {
              console.warn("Prisma pg connection error", error);
            },
          },
        ),
        log,
      });
    } catch (error) {
      throw new Error(
        "Prisma PostgreSQL adapter is not available. Install dependencies and configure DATABASE_URL before using database-backed routes.",
        { cause: error },
      );
    }
  }

  throw new Error(
    "DATABASE_URL or DIRECT_URL is missing. Create .env.local and configure the database connection before using database-backed routes.",
  );
}

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClientInstance();
  }

  return globalForPrisma.prisma;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrismaClient(), property, receiver);
  },
}) as PrismaClient;

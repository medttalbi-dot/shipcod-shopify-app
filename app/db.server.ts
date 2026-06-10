import { PrismaClient } from "@prisma/client";

// Prevent multiple Prisma client instances in development (hot-reload)
declare global {
  var __prisma: PrismaClient | undefined;
}

const db = global.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = db;
}

export default db;

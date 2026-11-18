/**
 * Prisma client factory for the host. Not used inside `step()`.
 */
import { PrismaClient } from "@prisma/client";

export type DbClient = PrismaClient;

export function createDbClient(): DbClient {
  return new PrismaClient();
}

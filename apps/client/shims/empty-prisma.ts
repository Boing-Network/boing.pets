/**
 * Browser worker must never touch Prisma. Vite aliases the Prisma client package
 * here so an accidental import fails clearly instead of shipping the Node driver.
 */
export class PrismaClient {
  constructor() {
    throw new Error("Prisma is not available in the browser host worker");
  }
}

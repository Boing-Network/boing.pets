-- CreateTable
CREATE TABLE "host_meta" (
    "id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_meta_pkey" PRIMARY KEY ("id")
);

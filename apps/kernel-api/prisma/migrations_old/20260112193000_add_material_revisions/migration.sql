-- CreateTable
CREATE TABLE "MaterialRevision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "materialId" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "truthClass" "TruthClass" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialRevision_dealId_createdAt_idx" ON "MaterialRevision"("dealId", "createdAt");
CREATE INDEX "MaterialRevision_materialId_createdAt_idx" ON "MaterialRevision"("materialId", "createdAt");

-- AddForeignKey
ALTER TABLE "MaterialRevision" ADD CONSTRAINT "MaterialRevision_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "MaterialObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialRevision" ADD CONSTRAINT "MaterialRevision_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
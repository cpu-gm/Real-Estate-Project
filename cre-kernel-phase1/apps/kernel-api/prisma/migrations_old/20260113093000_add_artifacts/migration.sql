-- CreateTable
CREATE TABLE "Artifact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dealId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256Hex" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploaderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dealId" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "eventId" UUID,
    "materialId" UUID,
    "tag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Artifact_sha256Hex_key" ON "Artifact"("sha256Hex");
CREATE INDEX "Artifact_dealId_idx" ON "Artifact"("dealId");
CREATE INDEX "ArtifactLink_dealId_idx" ON "ArtifactLink"("dealId");
CREATE INDEX "ArtifactLink_artifactId_idx" ON "ArtifactLink"("artifactId");

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtifactLink" ADD CONSTRAINT "ArtifactLink_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtifactLink" ADD CONSTRAINT "ArtifactLink_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- CreateTable
CREATE TABLE "Obligation" (
    "id" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "fromActorId" UUID NOT NULL,
    "toActorId" UUID,
    "obligationType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fulfilledByEventId" UUID,
    "dueBy" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "actorAId" UUID NOT NULL,
    "actorBId" UUID NOT NULL,
    "relationType" TEXT NOT NULL,
    "establishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminatedAt" TIMESTAMP(3),

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Obligation_dealId_status_idx" ON "Obligation"("dealId", "status");

-- CreateIndex
CREATE INDEX "Obligation_fromActorId_status_idx" ON "Obligation"("fromActorId", "status");

-- CreateIndex
CREATE INDEX "Relationship_dealId_idx" ON "Relationship"("dealId");

-- CreateIndex
CREATE INDEX "Relationship_actorAId_relationType_idx" ON "Relationship"("actorAId", "relationType");

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_fromActorId_fkey" FOREIGN KEY ("fromActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_toActorId_fkey" FOREIGN KEY ("toActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_actorAId_fkey" FOREIGN KEY ("actorAId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_actorBId_fkey" FOREIGN KEY ("actorBId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "DraftState" (
    "id" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "lastModified" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatedEvent" (
    "id" UUID NOT NULL,
    "draftStateId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" UUID,
    "payload" JSONB NOT NULL,
    "authorityContext" JSONB NOT NULL,
    "evidenceRefs" TEXT[],
    "sequenceOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulatedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionGate" (
    "id" UUID NOT NULL,
    "draftStateId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "isBlocked" BOOLEAN NOT NULL,
    "reasons" JSONB NOT NULL,
    "nextSteps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectionGate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftState_dealId_key" ON "DraftState"("dealId");

-- CreateIndex
CREATE INDEX "SimulatedEvent_draftStateId_sequenceOrder_idx" ON "SimulatedEvent"("draftStateId", "sequenceOrder");

-- CreateIndex
CREATE INDEX "ProjectionGate_draftStateId_action_idx" ON "ProjectionGate"("draftStateId", "action");

-- AddForeignKey
ALTER TABLE "DraftState" ADD CONSTRAINT "DraftState_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulatedEvent" ADD CONSTRAINT "SimulatedEvent_draftStateId_fkey" FOREIGN KEY ("draftStateId") REFERENCES "DraftState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectionGate" ADD CONSTRAINT "ProjectionGate_draftStateId_fkey" FOREIGN KEY ("draftStateId") REFERENCES "DraftState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

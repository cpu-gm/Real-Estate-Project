import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z, ZodError } from "zod";
import { AllowedEventTypes, DealStates, StressModes } from "@kernel/shared";
import { createPrismaClient } from "./prisma";
import { projectDealLifecycle } from "./projection";
import archiver from "archiver";
import PDFDocument from "pdfkit";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { basename, dirname, posix, resolve } from "node:path";
import { PassThrough } from "node:stream";

type PrismaClientType = ReturnType<typeof createPrismaClient>;

export const corsAllowedOrigins = ["http://localhost:3000"];

const createDealSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200, "name is too long")
});

const dealParamsSchema = z.object({
  dealId: z.string().uuid("dealId must be a valid UUID")
});

const actorParamsSchema = z.object({
  dealId: z.string().uuid("dealId must be a valid UUID"),
  actorId: z.string().uuid("actorId must be a valid UUID")
});

const createEventSchema = z.object({
  type: z.string().trim().min(1, "type is required").max(100, "type is too long"),
  actorId: z.string().uuid("actorId must be a valid UUID"),
  payload: z.record(z.unknown()).optional().default({}),
  authorityContext: z.record(z.unknown()).optional().default({}),
  evidenceRefs: z.array(z.string()).optional().default([])
});

const createActorSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200, "name is too long"),
  type: z.enum(["HUMAN", "SYSTEM"]),
  role: z.string().trim().min(1, "role is required").max(50, "role is too long")
});

const assignRoleSchema = z.object({
  role: z.string().trim().min(1, "role is required").max(50, "role is too long")
});

const materialParamsSchema = z.object({
  dealId: z.string().uuid("dealId must be a valid UUID"),
  materialId: z.string().uuid("materialId must be a valid UUID")
});

const artifactParamsSchema = z.object({
  dealId: z.string().uuid("dealId must be a valid UUID"),
  artifactId: z.string().uuid("artifactId must be a valid UUID")
});

const createMaterialSchema = z.object({
  type: z.string().trim().min(1, "type is required").max(100, "type is too long"),
  truthClass: z.enum(["DOC", "HUMAN", "AI"]),
  evidenceRefs: z.array(z.string()).optional().default([]),
  meta: z.record(z.unknown()).optional().default({})
});

const updateMaterialSchema = z
  .object({
    truthClass: z.enum(["DOC", "HUMAN", "AI"]).optional(),
    evidenceRefs: z.array(z.string()).optional(),
    meta: z.record(z.unknown()).optional()
  })
  .refine(
    (data) =>
      data.truthClass !== undefined ||
      data.evidenceRefs !== undefined ||
      data.meta !== undefined,
    {
      message: "At least one field is required"
    }
  );

const snapshotQuerySchema = z.object({
  at: z.string().optional()
});

const explainQuerySchema = z.object({
  at: z.string().optional()
});

const explainBodySchema = z.object({
  action: z.string().trim().min(1, "action is required"),
  actorId: z.string().uuid("actorId must be a valid UUID").nullable().optional(),
  payload: z.record(z.unknown()).optional().default({}),
  authorityContext: z.record(z.unknown()).optional().default({}),
  evidenceRefs: z.array(z.string()).optional().default([])
});

const proofpackQuerySchema = z.object({
  at: z.string().optional(),
  actions: z.string().optional()
});

const uploaderIdSchema = z.string().uuid("uploaderId must be a valid UUID");

const artifactLinkSchema = z
  .object({
    eventId: z.string().uuid("eventId must be a valid UUID").optional(),
    materialId: z.string().uuid("materialId must be a valid UUID").optional(),
    tag: z.string().trim().max(100, "tag is too long").optional()
  })
  .refine((data) => Boolean(data.eventId || data.materialId || data.tag), {
    message: "At least one link field is required"
  });

const allowedEventTypeSet = new Set(AllowedEventTypes);

const gateEventTypes = new Set([
  "DealApproved",
  "ClosingReadinessAttested",
  "ClosingFinalized",
  "OperationsActivated",
  "DistressResolved"
]);

const materialGateEventTypes = new Set([
  "DealApproved",
  "ClosingReadinessAttested",
  "ClosingFinalized",
  "OperationsActivated"
]);

const eventActionMap: Record<string, string> = {
  ReviewOpened: "OPEN_REVIEW",
  DealApproved: "APPROVE_DEAL",
  ClosingReadinessAttested: "ATTEST_READY_TO_CLOSE",
  ClosingFinalized: "FINALIZE_CLOSING",
  OperationsActivated: "ACTIVATE_OPERATIONS",
  MaterialChangeDetected: "DECLARE_CHANGE",
  ChangeReconciled: "RECONCILE_CHANGE",
  DistressDeclared: "DECLARE_DISTRESS",
  DistressResolved: "RESOLVE_DISTRESS",
  FreezeImposed: "IMPOSE_FREEZE",
  FreezeLifted: "LIFT_FREEZE",
  ExitFinalized: "FINALIZE_EXIT",
  DealTerminated: "TERMINATE_DEAL",
  DataDisputed: "DISPUTE_DATA",
  ApprovalGranted: "APPROVAL_SIGNAL",
  ApprovalDenied: "APPROVAL_SIGNAL",
  OverrideAttested: "OVERRIDE"
};

const gateActions = new Set(
  Array.from(gateEventTypes)
    .map((eventType) => eventActionMap[eventType])
    .filter((action): action is string => Boolean(action))
);

const materialGateActions = new Map(
  Array.from(materialGateEventTypes)
    .map((eventType) => {
      const action = eventActionMap[eventType];
      return action ? [action, eventType] : null;
    })
    .filter((entry): entry is [string, string] => Boolean(entry))
);

type RequiredTruth = "DOC" | "HUMAN";
type TruthClass = "DOC" | "HUMAN" | "AI";

type ExplainReason = {
  type:
    | "MISSING_MATERIAL"
    | "INSUFFICIENT_TRUTH"
    | "AUTHORITY"
    | "APPROVAL_THRESHOLD";
  message: string;
  materialType?: string;
  requiredTruth?: RequiredTruth;
  currentTruth?: TruthClass | null;
  satisfiedByOverride?: boolean;
};

type ExplainBlock = {
  action: string;
  status: "BLOCKED";
  reasons: ExplainReason[];
  nextSteps: Array<{
    description: string;
    canBeFixedByRoles: string[];
    canBeOverriddenByRoles: string[];
  }>;
};

type MaterialAt = {
  id: string;
  type: string;
  truthClass: TruthClass;
  data: Record<string, unknown>;
  createdAt: Date;
};

type MaterialRequirementStatus = {
  type: string;
  requiredTruth: RequiredTruth;
  currentTruth: TruthClass | null;
  status: "OK" | "MISSING" | "INSUFFICIENT";
};

type ApprovalSummary = {
  threshold: number;
  satisfiedByRole: Record<string, number>;
  satisfied: boolean;
};

type ExplainBlockReplay = ExplainBlock & {
  at: string;
  inputsUsed: {
    approvalsAtT: ApprovalSummary | null;
    materialsAtT: {
      list: MaterialAt[];
      requirements: MaterialRequirementStatus[];
    };
    dealStateAtT: {
      state: string;
      stressMode: string;
    };
  };
};

type ExplainReplayResponse =
  | ExplainBlockReplay
  | {
      status: "ALLOWED";
      action: string;
      at: string;
      projectionSummary: {
        state: string;
        stressMode: string;
      };
    };

type EvidenceReference = {
  source: "artifactLink" | "eventEvidenceRef" | "materialEvidenceRef";
  eventId?: string;
  materialId?: string;
  tag?: string;
};

type EvidenceIndexItem = {
  artifactId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hex: string;
  uploaderId: string | null;
  createdAt: string;
  references: EvidenceReference[];
};

type EvidenceIndex = {
  dealId: string;
  at: string;
  artifacts: EvidenceIndexItem[];
};

type MultipartFilePart = {
  type: "file";
  fieldname: string;
  filename: string;
  mimetype?: string;
  file: AsyncIterable<Buffer>;
};

type MultipartFieldPart = {
  type: "field";
  fieldname: string;
  value: string;
};

type MultipartPart = MultipartFilePart | MultipartFieldPart;

const materialRequirementsByAction: Record<
  string,
  Array<{ type: string; requiredTruth: RequiredTruth }>
> = {
  APPROVE_DEAL: [
    { type: "UnderwritingSummary", requiredTruth: "HUMAN" }
  ],
  ATTEST_READY_TO_CLOSE: [
    { type: "FinalUnderwriting", requiredTruth: "DOC" },
    { type: "SourcesAndUses", requiredTruth: "DOC" }
  ],
  FINALIZE_CLOSING: [
    { type: "WireConfirmation", requiredTruth: "DOC" },
    { type: "EntityFormationDocs", requiredTruth: "DOC" }
  ],
  ACTIVATE_OPERATIONS: [
    { type: "PropertyManagementAgreement", requiredTruth: "DOC" }
  ]
};

const truthRank: Record<TruthClass, number> = {
  AI: 1,
  HUMAN: 2,
  DOC: 3
};

function isFastTestMode(): boolean {
  return process.env.KERNEL_FAST_TEST === "1" || process.env.NODE_ENV === "test";
}

function isTruthSufficient(
  currentTruth: TruthClass | null,
  requiredTruth: RequiredTruth
): boolean {
  if (!currentTruth) {
    return false;
  }
  if (requiredTruth === "DOC") {
    return currentTruth === "DOC";
  }
  return currentTruth === "DOC" || currentTruth === "HUMAN";
}

const defaultAuthorityRules = [
  {
    action: "OPEN_REVIEW",
    rolesAllowed: ["GP"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "APPROVE_DEAL",
    rolesAllowed: ["GP"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "ATTEST_READY_TO_CLOSE",
    rolesAllowed: ["GP", "LEGAL"],
    rolesRequired: ["GP", "LEGAL"],
    threshold: 2
  },
  {
    action: "FINALIZE_CLOSING",
    rolesAllowed: ["GP", "LENDER", "ESCROW"],
    rolesRequired: ["GP", "LENDER", "ESCROW"],
    threshold: 3
  },
  {
    action: "ACTIVATE_OPERATIONS",
    rolesAllowed: ["GP", "OPERATOR"],
    rolesRequired: [],
    threshold: 2
  },
  {
    action: "DECLARE_CHANGE",
    rolesAllowed: ["GP", "OPERATOR"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "RECONCILE_CHANGE",
    rolesAllowed: ["GP", "LEGAL"],
    rolesRequired: [],
    threshold: 2
  },
  {
    action: "DECLARE_DISTRESS",
    rolesAllowed: ["GP", "LENDER"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "RESOLVE_DISTRESS",
    rolesAllowed: ["GP", "LENDER"],
    rolesRequired: [],
    threshold: 2
  },
  {
    action: "IMPOSE_FREEZE",
    rolesAllowed: ["COURT", "REGULATOR", "TRUSTEE"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "LIFT_FREEZE",
    rolesAllowed: ["COURT"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "FINALIZE_EXIT",
    rolesAllowed: ["GP"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "TERMINATE_DEAL",
    rolesAllowed: ["GP"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "DISPUTE_DATA",
    rolesAllowed: ["AUDITOR", "LENDER", "GP"],
    rolesRequired: [],
    threshold: 1
  },
  {
    action: "OVERRIDE",
    rolesAllowed: ["GP"],
    rolesRequired: [],
    threshold: 1
  }
];

function resolveAction(type: string, payload: Record<string, unknown>): string | undefined {
  if (type === "ApprovalGranted" || type === "ApprovalDenied") {
    const actionValue = payload.action;
    if (typeof actionValue !== "string") {
      return undefined;
    }
    const trimmed = actionValue.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (type === "OverrideAttested") {
    return "OVERRIDE";
  }

  return eventActionMap[type];
}

function resolveOverrideTarget(payload: Record<string, unknown>): string | undefined {
  const actionValue = payload.action;
  if (typeof actionValue !== "string") {
    return undefined;
  }
  const trimmed = actionValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveOverrideReason(payload: Record<string, unknown>): string | undefined {
  const reasonValue = payload.reason;
  if (typeof reasonValue !== "string") {
    return undefined;
  }
  const trimmed = reasonValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMaterialData(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const artifactsRoot = resolve(__dirname, "..", ".data");

function sendError(
  reply: { code: (status: number) => { send: (payload: unknown) => void } },
  request: { method: string; url: string; params?: unknown; query?: unknown },
  status: number,
  message: string
) {
  return reply.code(status).send({
    message,
    request: {
      method: request.method,
      url: request.url,
      params: request.params ?? null,
      query: request.query ?? null
    }
  });
}

async function ensureDir(pathValue: string): Promise<void> {
  await fs.mkdir(pathValue, { recursive: true });
}

function safeFilename(filename: string): string {
  const base = basename(filename);
  return base.length > 0 ? base : "artifact";
}

function buildArtifactStorageKey(
  dealId: string,
  artifactId: string,
  filename: string
): string {
  return posix.join("artifacts", dealId, artifactId, filename);
}

function resolveArtifactPath(storageKey: string): string {
  return resolve(artifactsRoot, storageKey);
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseActions(actionsValue: string | undefined): string[] {
  if (!actionsValue) {
    return [];
  }
  return actionsValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function resolveAtTimestamp(
  query: unknown,
  schema: z.ZodSchema<{ at?: string }>
): { ok: true; at: Date } | { ok: false; message: string } {
  const result = schema.safeParse(query ?? {});
  if (!result.success) {
    return { ok: false, message: formatZodError(result.error) };
  }
  if (!result.data.at) {
    return { ok: true, at: new Date() };
  }
  const parsed = new Date(result.data.at);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: "at must be a valid ISO timestamp" };
  }
  return { ok: true, at: parsed };
}

function extractApprovalAction(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = (payload as Record<string, unknown>).action;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function listEventsUpTo(
  prisma: PrismaClientType,
  dealId: string,
  at: Date
) {
  return prisma.event.findMany({
    where: { dealId, createdAt: { lte: at } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
}

async function listMaterialsUpTo(
  prisma: PrismaClientType,
  dealId: string,
  at: Date
): Promise<MaterialAt[]> {
  const revisions = await prisma.materialRevision.findMany({
    where: { dealId, createdAt: { lte: at } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const byMaterialId = new Map<string, MaterialAt>();
  for (const revision of revisions) {
    byMaterialId.set(revision.materialId, {
      id: revision.materialId,
      type: revision.type,
      truthClass: revision.truthClass as TruthClass,
      data: normalizeMaterialData(revision.data),
      createdAt: revision.createdAt
    });
  }

  const materials = await prisma.materialObject.findMany({
    where: { dealId, createdAt: { lte: at } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  for (const material of materials) {
    if (!byMaterialId.has(material.id)) {
      byMaterialId.set(material.id, {
        id: material.id,
        type: material.type,
        truthClass: material.truthClass as TruthClass,
        data: normalizeMaterialData(material.data),
        createdAt: material.createdAt
      });
    }
  }

  return Array.from(byMaterialId.values());
}

async function listActorRolesAt(
  prisma: PrismaClientType,
  dealId: string,
  at: Date,
  actorIds: string[]
) {
  if (actorIds.length === 0) {
    return [];
  }
  return prisma.actorRole.findMany({
    where: {
      dealId,
      actorId: { in: actorIds },
      createdAt: { lte: at }
    },
    include: { role: true }
  });
}

function summarizeApprovals(
  rules: Array<{
    action: string;
    threshold: number;
    rolesAllowed: string[];
  }>
): Record<string, ApprovalSummary> {
  const summary: Record<string, ApprovalSummary> = {};
  for (const rule of rules) {
    summary[rule.action] = {
      threshold: rule.threshold,
      satisfiedByRole: {},
      satisfied: false
    };
  }

  return summary;
}

function evaluateApprovalSummary(
  rules: Array<{
    action: string;
    threshold: number;
    rolesAllowed: string[];
  }>,
  approvals: Array<{ actorId: string | null; payload: unknown }>,
  actorRoles: Array<{ actorId: string; role: { name: string } }>
): Record<string, ApprovalSummary> {
  const actorRolesMap = new Map<string, string[]>();
  for (const actorRole of actorRoles) {
    const roles = actorRolesMap.get(actorRole.actorId) ?? [];
    roles.push(actorRole.role.name);
    actorRolesMap.set(actorRole.actorId, roles);
  }

  const summary = summarizeApprovals(rules);

  for (const rule of rules) {
    const relevantApprovals = approvals.filter((approval) => {
      const action = extractApprovalAction(approval.payload);
      return action === rule.action;
    });

    let allowedCount = 0;
    const satisfiedByRole: Record<string, number> = {};

    for (const approval of relevantApprovals) {
      const actorId = approval.actorId;
      if (!actorId) {
        continue;
      }
      const roles = actorRolesMap.get(actorId) ?? [];
      const allowedRoles = roles.filter((role) => rule.rolesAllowed.includes(role));
      if (allowedRoles.length === 0) {
        continue;
      }
      allowedCount += 1;
      for (const role of allowedRoles) {
        satisfiedByRole[role] = (satisfiedByRole[role] ?? 0) + 1;
      }
    }

    summary[rule.action] = {
      threshold: rule.threshold,
      satisfiedByRole,
      satisfied: allowedCount >= rule.threshold
    };
  }

  return summary;
}

function buildMaterialRequirementStatus(
  materials: MaterialAt[],
  requirements: Array<{ type: string; requiredTruth: RequiredTruth }>
): MaterialRequirementStatus[] {
  const bestTruthByType = new Map<string, TruthClass>();
  for (const material of materials) {
    const existing = bestTruthByType.get(material.type);
    if (!existing || truthRank[material.truthClass] > truthRank[existing]) {
      bestTruthByType.set(material.type, material.truthClass);
    }
  }

  return requirements.map((requirement) => {
    const currentTruth = bestTruthByType.get(requirement.type) ?? null;
    if (!currentTruth) {
      return {
        type: requirement.type,
        requiredTruth: requirement.requiredTruth,
        currentTruth: null,
        status: "MISSING"
      };
    }
    if (!isTruthSufficient(currentTruth, requirement.requiredTruth)) {
      return {
        type: requirement.type,
        requiredTruth: requirement.requiredTruth,
        currentTruth,
        status: "INSUFFICIENT"
      };
    }
    return {
      type: requirement.type,
      requiredTruth: requirement.requiredTruth,
      currentTruth,
      status: "OK"
    };
  });
}

async function computeSnapshotData(
  prisma: PrismaClientType,
  dealId: string,
  at: Date
) {
  const [rules, events, materials] = await Promise.all([
    prisma.authorityRule.findMany({
      where: { dealId }
    }),
    listEventsUpTo(prisma, dealId, at),
    listMaterialsUpTo(prisma, dealId, at)
  ]);

  const projection = projectDealLifecycle({
    initialDeal: {
      state: DealStates.Draft,
      stressMode: StressModes.SM0
    },
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt
    }))
  });

  const approvalEvents = events.filter((event) => event.type === "ApprovalGranted");
  const approvalActorIds = approvalEvents
    .map((event) => event.actorId)
    .filter((actorId): actorId is string => typeof actorId === "string");

  const actorRoles = await listActorRolesAt(prisma, dealId, at, approvalActorIds);

  const approvalSummary = evaluateApprovalSummary(
    rules.map((rule) => ({
      action: rule.action,
      threshold: rule.threshold,
      rolesAllowed: rule.rolesAllowed
    })),
    approvalEvents.map((event) => ({
      actorId: event.actorId,
      payload: event.payload
    })),
    actorRoles
  );

  const requiredFor: Record<string, MaterialRequirementStatus[]> = {};
  for (const [action, requirements] of Object.entries(materialRequirementsByAction)) {
    requiredFor[action] = buildMaterialRequirementStatus(materials, requirements);
  }

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  return {
    dealId,
    at: at.toISOString(),
    projection: {
      state: projection.state,
      stressMode: projection.stressMode
    },
    approvals: approvalSummary,
    materials: {
      list: materials.map((material) => ({
        id: material.id,
        type: material.type,
        truthClass: material.truthClass,
        data: material.data,
        createdAt: material.createdAt
      })),
      requiredFor
    },
    timeline: {
      eventsCount: events.length,
      lastEventAt: lastEvent ? lastEvent.createdAt : null,
      lastEventType: lastEvent ? lastEvent.type : null
    },
    integrity: {
      replayFrom: "events+materials",
      deterministic: true
    }
  };
}

type SnapshotData = Awaited<ReturnType<typeof computeSnapshotData>>;

async function buildEvidenceIndex(
  prisma: PrismaClientType,
  dealId: string,
  at: Date
): Promise<EvidenceIndex> {
  const [artifacts, links, events, materials] = await Promise.all([
    prisma.artifact.findMany({
      where: { dealId, createdAt: { lte: at } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    prisma.artifactLink.findMany({
      where: { dealId, createdAt: { lte: at } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    listEventsUpTo(prisma, dealId, at),
    prisma.materialObject.findMany({
      where: { dealId, createdAt: { lte: at } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  ]);

  const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const referencesByArtifact = new Map<string, EvidenceReference[]>();

  const addReference = (artifactId: string, reference: EvidenceReference) => {
    const current = referencesByArtifact.get(artifactId) ?? [];
    current.push(reference);
    referencesByArtifact.set(artifactId, current);
  };

  for (const link of links) {
    addReference(link.artifactId, {
      source: "artifactLink",
      eventId: link.eventId ?? undefined,
      materialId: link.materialId ?? undefined,
      tag: link.tag ?? undefined
    });
  }

  for (const event of events) {
    if (!Array.isArray(event.evidenceRefs)) {
      continue;
    }
    for (const ref of event.evidenceRefs) {
      if (typeof ref !== "string" || !artifactIds.has(ref)) {
        continue;
      }
      addReference(ref, {
        source: "eventEvidenceRef",
        eventId: event.id
      });
    }
  }

  for (const material of materials) {
    const data = normalizeMaterialData(material.data);
    const refs = Array.isArray(data.evidenceRefs)
      ? data.evidenceRefs.filter((ref) => typeof ref === "string")
      : [];
    for (const ref of refs) {
      if (!artifactIds.has(ref)) {
        continue;
      }
      addReference(ref, {
        source: "materialEvidenceRef",
        materialId: material.id
      });
    }
  }

  return {
    dealId,
    at: at.toISOString(),
    artifacts: artifacts.map((artifact) => ({
      artifactId: artifact.id,
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      sha256Hex: artifact.sha256Hex,
      uploaderId: artifact.uploaderId,
      createdAt: artifact.createdAt.toISOString(),
      references: referencesByArtifact.get(artifact.id) ?? []
    }))
  };
}

async function createCompliancePdfBuffer(
  snapshot: SnapshotData,
  evidenceIndex: EvidenceIndex
): Promise<Buffer> {
  if (isFastTestMode()) {
    return Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000211 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n270\n%%EOF\n",
      "utf8"
    );
  }

  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk as Buffer));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));
  });

  doc.fontSize(18).text("Compliance Snapshot", { underline: true });
  doc.moveDown();
  doc.fontSize(11).text(`Deal ID: ${snapshot.dealId}`);
  doc.text(`At: ${snapshot.at}`);
  doc.text(`State: ${snapshot.projection.state}`);
  doc.text(`Stress Mode: ${snapshot.projection.stressMode}`);
  doc.moveDown();

  doc.fontSize(12).text("Approvals");
  doc.fontSize(10);
  const approvalEntries = Object.entries(snapshot.approvals).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  if (approvalEntries.length === 0) {
    doc.text("No approval rules.");
  } else {
    for (const [action, summary] of approvalEntries) {
      doc.text(
        `${action}: ${summary.satisfied ? "satisfied" : "missing"} (threshold ${summary.threshold})`
      );
    }
  }
  doc.moveDown();

  doc.fontSize(12).text("Materials");
  doc.fontSize(10);
  const requiredEntries = Object.entries(snapshot.materials.requiredFor).sort(
    ([a], [b]) => a.localeCompare(b)
  );
  if (requiredEntries.length === 0) {
    doc.text("No material requirements.");
  } else {
    for (const [action, requirements] of requiredEntries) {
      const missingCount = requirements.filter((req) => req.status !== "OK").length;
      doc.text(`${action}: missing ${missingCount}`);
    }
  }
  doc.moveDown();

  doc.fontSize(12).text("Evidence Index");
  doc.fontSize(10);
  if (evidenceIndex.artifacts.length === 0) {
    doc.text("No artifacts uploaded.");
  } else {
    for (const artifact of evidenceIndex.artifacts) {
      doc.text(`${artifact.filename} (${artifact.sha256Hex.slice(0, 12)})`);
    }
  }

  doc.end();
  return done;
}

async function computeExplainData(
  prisma: PrismaClientType,
  dealId: string,
  at: Date,
  body: {
    action: string;
    actorId?: string | null;
    payload: Record<string, unknown>;
    authorityContext: Record<string, unknown>;
    evidenceRefs: string[];
  }
): Promise<ExplainReplayResponse> {
  const [rules, events, materials] = await Promise.all([
    prisma.authorityRule.findMany({
      where: { dealId }
    }),
    listEventsUpTo(prisma, dealId, at),
    listMaterialsUpTo(prisma, dealId, at)
  ]);

  const rule = rules.find((item) => item.action === body.action);
  if (!rule) {
    throw new Error("Unknown action");
  }

  const projection = projectDealLifecycle({
    initialDeal: {
      state: DealStates.Draft,
      stressMode: StressModes.SM0
    },
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt
    }))
  });

  const approvalEvents = events.filter((event) => event.type === "ApprovalGranted");
  const approvalActorIds = approvalEvents
    .map((event) => event.actorId)
    .filter((actorId): actorId is string => typeof actorId === "string");

  const actorIdsForLookup = [
    ...new Set(
      body.actorId ? [...approvalActorIds, body.actorId] : approvalActorIds
    )
  ];

  const actorRoles = await listActorRolesAt(prisma, dealId, at, actorIdsForLookup);

  const approvalSummary = evaluateApprovalSummary(
    rules.map((ruleItem) => ({
      action: ruleItem.action,
      threshold: ruleItem.threshold,
      rolesAllowed: ruleItem.rolesAllowed
    })),
    approvalEvents.map((event) => ({
      actorId: event.actorId,
      payload: event.payload
    })),
    actorRoles
  );

  const reasons: ExplainReason[] = [];
  if (!body.actorId) {
    reasons.push({
      type: "AUTHORITY",
      message: "actorId is required"
    });
  } else {
    const actorExists = await prisma.actor.findUnique({
      where: { id: body.actorId },
      select: { id: true }
    });
    if (!actorExists) {
      reasons.push({
        type: "AUTHORITY",
        message: "Actor not found"
      });
    } else {
      const actorRolesForActor = actorRoles.filter(
        (actorRole) => actorRole.actorId === body.actorId
      );
      if (actorRolesForActor.length === 0) {
        reasons.push({
          type: "AUTHORITY",
          message: "Actor has no role for this deal"
        });
      } else {
        const roleNames = actorRolesForActor.map((actorRole) => actorRole.role.name);
        const hasAllowedRole = roleNames.some((roleName) =>
          rule.rolesAllowed.includes(roleName)
        );
        if (!hasAllowedRole) {
          reasons.push({
            type: "AUTHORITY",
            message: "Actor role not permitted"
          });
        }
      }
    }
  }

  if (gateActions.has(body.action)) {
    const approvalForAction = approvalSummary[body.action];
    if (!approvalForAction || !approvalForAction.satisfied) {
      reasons.push({
        type: "APPROVAL_THRESHOLD",
        message: "Approval threshold not met."
      });
    }
  }

  const requirements = materialRequirementsByAction[body.action] ?? [];
  const requirementStatus = buildMaterialRequirementStatus(materials, requirements);
  if (requirements.length > 0) {
    const overrideUsed = await findValidOverrideAt(
      prisma,
      dealId,
      body.action,
      at
    );
    if (!overrideUsed) {
      for (const status of requirementStatus) {
        if (status.status === "MISSING") {
          reasons.push({
            type: "MISSING_MATERIAL",
            message: `Missing material ${status.type}.`,
            materialType: status.type,
            requiredTruth: status.requiredTruth,
            currentTruth: null
          });
        } else if (status.status === "INSUFFICIENT") {
          reasons.push({
            type: "INSUFFICIENT_TRUTH",
            message: `Material ${status.type} does not meet truth requirement.`,
            materialType: status.type,
            requiredTruth: status.requiredTruth,
            currentTruth: status.currentTruth
          });
        }
      }
    }
  }

  if (reasons.length > 0) {
    const baseExplain = await buildExplainBlock(prisma, dealId, body.action, reasons);
    return {
      ...baseExplain,
      at: at.toISOString(),
      inputsUsed: {
        approvalsAtT: approvalSummary[body.action] ?? null,
        materialsAtT: {
          list: materials,
          requirements: requirementStatus
        },
        dealStateAtT: {
          state: projection.state,
          stressMode: projection.stressMode
        }
      }
    };
  }

  return {
    status: "ALLOWED",
    action: body.action,
    at: at.toISOString(),
    projectionSummary: {
      state: projection.state,
      stressMode: projection.stressMode
    }
  };
}

async function findValidOverrideAt(
  prisma: PrismaClientType,
  dealId: string,
  action: string,
  at: Date
): Promise<boolean> {
  const gateEventType = materialGateActions.get(action);
  if (!gateEventType) {
    return false;
  }

  const overrides = await prisma.event.findMany({
    where: {
      dealId,
      type: "OverrideAttested",
      createdAt: { lte: at }
    },
    select: { payload: true, createdAt: true }
  });

  let latestOverride: Date | null = null;
  for (const override of overrides) {
    const payload = normalizeMaterialData(override.payload);
    const target = resolveOverrideTarget(payload);
    const reason = resolveOverrideReason(payload);
    if (target !== action || !reason) {
      continue;
    }
    if (!latestOverride || override.createdAt > latestOverride) {
      latestOverride = override.createdAt;
    }
  }

  if (!latestOverride) {
    return false;
  }

  const lastGateEvent = await prisma.event.findFirst({
    where: {
      dealId,
      type: gateEventType,
      createdAt: { lte: at }
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });

  if (!lastGateEvent) {
    return true;
  }

  return latestOverride > lastGateEvent.createdAt;
}

function formatZodError(error: ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path?.length ? issue.path.join(".") : "request";
  return `${path}: ${issue?.message ?? "invalid input"}`;
}

async function buildExplainBlock(
  prisma: PrismaClientType,
  dealId: string,
  action: string,
  reasons: ExplainReason[]
): Promise<ExplainBlock> {
  const [actionRule, overrideRule] = await Promise.all([
    prisma.authorityRule.findFirst({
      where: { dealId, action }
    }),
    prisma.authorityRule.findFirst({
      where: { dealId, action: "OVERRIDE" }
    })
  ]);

  const canBeFixedByRoles = actionRule?.rolesAllowed ?? [];
  const canBeOverriddenByRoles = overrideRule?.rolesAllowed ?? [];
  const hasApprovalReason = reasons.some(
    (reason) => reason.type === "APPROVAL_THRESHOLD"
  );
  const description = hasApprovalReason
    ? "Collect approvals for the required action."
    : "Provide required materials for the action.";

  return {
    action,
    status: "BLOCKED",
    reasons,
    nextSteps: [
      {
        description,
        canBeFixedByRoles,
        canBeOverriddenByRoles
      }
    ]
  };
}

async function findValidOverride(
  prisma: PrismaClientType,
  dealId: string,
  action: string,
  gateEventType: string
): Promise<boolean> {
  const overrides = await prisma.event.findMany({
    where: { dealId, type: "OverrideAttested" },
    select: { payload: true, createdAt: true }
  });

  let latestOverride: Date | null = null;
  for (const override of overrides) {
    const payload =
      (override.payload as Record<string, unknown> | null) ?? null;
    if (!payload) {
      continue;
    }
    const target = resolveOverrideTarget(payload);
    const reason = resolveOverrideReason(payload);
    if (target !== action || !reason) {
      continue;
    }
    if (!latestOverride || override.createdAt > latestOverride) {
      latestOverride = override.createdAt;
    }
  }

  if (!latestOverride) {
    return false;
  }

  const lastGateEvent = await prisma.event.findFirst({
    where: { dealId, type: gateEventType },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });

  if (!lastGateEvent) {
    return true;
  }

  return latestOverride > lastGateEvent.createdAt;
}

async function buildMaterialReasons(
  prisma: PrismaClientType,
  dealId: string,
  requirements: Array<{ type: string; requiredTruth: RequiredTruth }>
): Promise<ExplainReason[]> {
  const requiredTypes = [...new Set(requirements.map((req) => req.type))];
  const materials = await prisma.materialObject.findMany({
    where: {
      dealId,
      type: { in: requiredTypes }
    },
    select: {
      type: true,
      truthClass: true
    }
  });

  const bestTruthByType = new Map<string, TruthClass>();
  for (const material of materials) {
    const truth = material.truthClass as TruthClass;
    const existing = bestTruthByType.get(material.type);
    if (!existing || truthRank[truth] > truthRank[existing]) {
      bestTruthByType.set(material.type, truth);
    }
  }

  const reasons: ExplainReason[] = [];
  for (const requirement of requirements) {
    const currentTruth = bestTruthByType.get(requirement.type) ?? null;
    if (!currentTruth) {
      reasons.push({
        type: "MISSING_MATERIAL",
        message: `Missing material ${requirement.type}.`,
        materialType: requirement.type,
        requiredTruth: requirement.requiredTruth,
        currentTruth: null
      });
      continue;
    }

    if (!isTruthSufficient(currentTruth, requirement.requiredTruth)) {
      reasons.push({
        type: "INSUFFICIENT_TRUTH",
        message: `Material ${requirement.type} does not meet truth requirement.`,
        materialType: requirement.type,
        requiredTruth: requirement.requiredTruth,
        currentTruth
      });
    }
  }

  return reasons;
}

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });
  const prisma = createPrismaClient();

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      cb(null, corsAllowedOrigins.includes(origin));
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204
  });

  app.register(multipart);

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.post("/deals", async (request, reply) => {
    const result = createDealSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ message: formatZodError(result.error) });
    }

    const deal = await prisma.$transaction(async (tx) => {
      const createdDeal = await tx.deal.create({
        data: {
          name: result.data.name,
          state: DealStates.Draft,
          stressMode: StressModes.SM0
        }
      });

      await tx.authorityRule.createMany({
        data: defaultAuthorityRules.map((rule) => ({
          dealId: createdDeal.id,
          action: rule.action,
          threshold: rule.threshold,
          rolesAllowed: rule.rolesAllowed,
          rolesRequired: rule.rolesRequired
        }))
      });

      return createdDeal;
    });

    return reply.code(201).send(deal);
  });

  app.post("/deals/:dealId/actors", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const bodyResult = createActorSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ message: formatZodError(bodyResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const roleName = bodyResult.data.role;

    const actor = await prisma.$transaction(async (tx) => {
      const createdActor = await tx.actor.create({
        data: {
          name: bodyResult.data.name,
          type: bodyResult.data.type
        }
      });

      let role = await tx.role.findFirst({
        where: { name: roleName, orgId: null }
      });
      if (!role) {
        role = await tx.role.create({
          data: {
            name: roleName,
            orgId: null
          }
        });
      }

      await tx.actorRole.create({
        data: {
          actorId: createdActor.id,
          roleId: role.id,
          dealId: paramsResult.data.dealId
        }
      });

      return createdActor;
    });

    return reply.code(201).send({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      createdAt: actor.createdAt,
      roles: [roleName],
      dealId: paramsResult.data.dealId
    });
  });

  app.get("/deals/:dealId/actors", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const actorRoles = await prisma.actorRole.findMany({
      where: { dealId: paramsResult.data.dealId },
      include: { actor: true, role: true }
    });

    const actorMap = new Map<
      string,
      {
        id: string;
        name: string;
        type: string;
        roles: Set<string>;
        createdAt: Date;
      }
    >();

    for (const actorRole of actorRoles) {
      const actorId = actorRole.actorId;
      const existing = actorMap.get(actorId);
      if (!existing) {
        actorMap.set(actorId, {
          id: actorRole.actor.id,
          name: actorRole.actor.name,
          type: actorRole.actor.type,
          roles: new Set([actorRole.role.name]),
          createdAt: actorRole.actor.createdAt
        });
      } else {
        existing.roles.add(actorRole.role.name);
      }
    }

    const response = Array.from(actorMap.values()).map((actor) => ({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      roles: Array.from(actor.roles),
      createdAt: actor.createdAt
    }));

    return reply.code(200).send(response);
  });

  app.get("/deals/:dealId/actors/:actorId", async (request, reply) => {
    const paramsResult = actorParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const actorRoles = await prisma.actorRole.findMany({
      where: {
        dealId: paramsResult.data.dealId,
        actorId: paramsResult.data.actorId
      },
      include: { actor: true, role: true }
    });

    if (actorRoles.length === 0) {
      return reply.code(404).send({ message: "Actor not found" });
    }

    const actor = actorRoles[0].actor;
    const roles = Array.from(
      new Set(actorRoles.map((actorRole) => actorRole.role.name))
    );

    return reply.code(200).send({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      roles,
      createdAt: actor.createdAt
    });
  });

  app.post("/deals/:dealId/actors/:actorId/roles", async (request, reply) => {
    const paramsResult = actorParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const bodyResult = assignRoleSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ message: formatZodError(bodyResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const actor = await prisma.actor.findUnique({
      where: { id: paramsResult.data.actorId },
      select: { id: true }
    });
    if (!actor) {
      return reply.code(404).send({ message: "Actor not found" });
    }

    const roleName = bodyResult.data.role;
    let role = await prisma.role.findFirst({
      where: { name: roleName, orgId: null }
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          name: roleName,
          orgId: null
        }
      });
    }

    await prisma.actorRole.create({
      data: {
        actorId: paramsResult.data.actorId,
        roleId: role.id,
        dealId: paramsResult.data.dealId
      }
    });

    return reply.code(200).send({ ok: true });
  });

  app.post("/deals/:dealId/events", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const bodyResult = createEventSchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.code(400).send({ message: formatZodError(bodyResult.error) });
    }

    if (!allowedEventTypeSet.has(bodyResult.data.type)) {
      return reply.code(400).send({ message: "Unknown event type" });
    }

    const overrideTarget =
      bodyResult.data.type === "OverrideAttested"
        ? resolveOverrideTarget(bodyResult.data.payload)
        : undefined;
    const overrideReason =
      bodyResult.data.type === "OverrideAttested"
        ? resolveOverrideReason(bodyResult.data.payload)
        : undefined;
    if (
      bodyResult.data.type === "OverrideAttested" &&
      (!overrideTarget || !overrideReason)
    ) {
      return reply
        .code(400)
        .send({ message: "Override action and reason are required" });
    }

    const action = resolveAction(bodyResult.data.type, bodyResult.data.payload);
    if (!action) {
      const message =
        bodyResult.data.type === "ApprovalGranted" ||
        bodyResult.data.type === "ApprovalDenied"
          ? "Approval action is required"
          : "Action is required";
      return reply.code(400).send({ message });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true, state: true, stressMode: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const actor = await prisma.actor.findUnique({
      where: { id: bodyResult.data.actorId },
      select: { id: true }
    });
    if (!actor) {
      return reply.code(400).send({ message: "Actor not found" });
    }

    const actorRoles = await prisma.actorRole.findMany({
      where: {
        actorId: bodyResult.data.actorId,
        dealId: paramsResult.data.dealId
      },
      include: { role: true }
    });
    if (actorRoles.length === 0) {
      return reply.code(403).send({ message: "Actor has no role for this deal" });
    }

    const rule = await prisma.authorityRule.findFirst({
      where: {
        dealId: paramsResult.data.dealId,
        action
      }
    });
    if (!rule) {
      return reply.code(403).send({ message: "Authority rule not found" });
    }

    const roleNames = actorRoles.map((actorRole) => actorRole.role.name);
    const hasAllowedRole = roleNames.some((role) =>
      rule.rolesAllowed.includes(role)
    );
    if (!hasAllowedRole) {
      return reply.code(403).send({ message: "Actor role not permitted" });
    }

    if (gateEventTypes.has(bodyResult.data.type)) {
      const approvals = await prisma.event.findMany({
        where: {
          dealId: paramsResult.data.dealId,
          type: "ApprovalGranted",
          payload: {
            path: ["action"],
            equals: action
          }
        },
        select: { actorId: true }
      });

      const approvalActorIds = approvals
        .map((approval) => approval.actorId)
        .filter((actorId): actorId is string => typeof actorId === "string");

      if (approvalActorIds.length < rule.threshold) {
        const explainBlock = await buildExplainBlock(prisma, deal.id, action, [
          {
            type: "APPROVAL_THRESHOLD",
            message: "Approval threshold not met."
          }
        ]);
        return reply.code(409).send(explainBlock);
      }

      const approvalRoles = await prisma.actorRole.findMany({
        where: {
          dealId: paramsResult.data.dealId,
          actorId: { in: approvalActorIds }
        },
        include: { role: true }
      });

      const allowedActorIds = new Set(
        approvalRoles
          .filter((actorRole) => rule.rolesAllowed.includes(actorRole.role.name))
          .map((actorRole) => actorRole.actorId)
      );

      const allowedApprovalCount = approvals.filter(
        (approval) =>
          approval.actorId !== null && allowedActorIds.has(approval.actorId)
      ).length;

      if (allowedApprovalCount < rule.threshold) {
        const explainBlock = await buildExplainBlock(prisma, deal.id, action, [
          {
            type: "APPROVAL_THRESHOLD",
            message: "Approval threshold not met."
          }
        ]);
        return reply.code(409).send(explainBlock);
      }
    }

    let overrideUsed = false;
    if (materialGateEventTypes.has(bodyResult.data.type)) {
      const requirements = materialRequirementsByAction[action] ?? [];
      if (requirements.length > 0) {
        overrideUsed = await findValidOverride(
          prisma,
          deal.id,
          action,
          bodyResult.data.type
        );
        if (!overrideUsed) {
          const reasons = await buildMaterialReasons(
            prisma,
            deal.id,
            requirements
          );
          if (reasons.length > 0) {
            const explainBlock = await buildExplainBlock(
              prisma,
              deal.id,
              action,
              reasons
            );
            return reply.code(409).send(explainBlock);
          }
        }
      }
    }

    const finalAuthorityContext = overrideUsed
      ? {
          ...bodyResult.data.authorityContext,
          overrideUsed: true,
          overrideAction: action
        }
      : bodyResult.data.authorityContext;

    const event = await prisma.event.create({
      data: {
        dealId: paramsResult.data.dealId,
        type: bodyResult.data.type,
        actorId: bodyResult.data.actorId,
        payload: bodyResult.data.payload,
        authorityContext: finalAuthorityContext,
        evidenceRefs: bodyResult.data.evidenceRefs
      }
    });

    const events = await prisma.event.findMany({
      where: { dealId: paramsResult.data.dealId },
      select: { id: true, type: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    const projection = projectDealLifecycle({
      initialDeal: {
        state: DealStates.Draft,
        stressMode: StressModes.SM0
      },
      events
    });

    await prisma.deal.update({
      where: { id: paramsResult.data.dealId },
      data: {
        state: projection.state,
        stressMode: projection.stressMode
      }
    });

    return reply.code(201).send(event);
  });

  app.get("/deals/:dealId", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: {
        id: true,
        name: true,
        state: true,
        stressMode: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    return reply.code(200).send(deal);
  });

  app.get("/deals/:dealId/events", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const events = await prisma.event.findMany({
      where: { dealId: paramsResult.data.dealId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    return reply.code(200).send(events);
  });

  app.get("/deals/:dealId/snapshot", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const atResult = resolveAtTimestamp(request.query, snapshotQuerySchema);
    if (!atResult.ok) {
      return reply.code(400).send({ message: atResult.message });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const snapshot = await computeSnapshotData(
      prisma,
      paramsResult.data.dealId,
      atResult.at
    );

    return reply.code(200).send(snapshot);
  });

  app.post("/deals/:dealId/explain", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const atResult = resolveAtTimestamp(request.query, explainQuerySchema);
    if (!atResult.ok) {
      return reply.code(400).send({ message: atResult.message });
    }

    const bodyResult = explainBodySchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.code(400).send({ message: formatZodError(bodyResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    try {
      const response = await computeExplainData(
        prisma,
        paramsResult.data.dealId,
        atResult.at,
        {
          action: bodyResult.data.action,
          actorId: bodyResult.data.actorId ?? null,
          payload: bodyResult.data.payload,
          authorityContext: bodyResult.data.authorityContext,
          evidenceRefs: bodyResult.data.evidenceRefs
        }
      );
      return reply.code(200).send(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Explain failed";
      const status = message === "Unknown action" ? 400 : 500;
      return reply.code(status).send({ message });
    }
  });

  app.get("/deals/:dealId/materials", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const materials = await prisma.materialObject.findMany({
      where: { dealId: paramsResult.data.dealId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    return reply.code(200).send(materials);
  });

  app.post("/deals/:dealId/materials", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const bodyResult = createMaterialSchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.code(400).send({ message: formatZodError(bodyResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const material = await prisma.$transaction(async (tx) => {
      const created = await tx.materialObject.create({
        data: {
          dealId: paramsResult.data.dealId,
          type: bodyResult.data.type,
          truthClass: bodyResult.data.truthClass,
          data: {
            evidenceRefs: bodyResult.data.evidenceRefs,
            meta: bodyResult.data.meta
          }
        }
      });

      await tx.materialRevision.create({
        data: {
          materialId: created.id,
          dealId: paramsResult.data.dealId,
          type: created.type,
          truthClass: created.truthClass,
          data: created.data
        }
      });

      return created;
    });

    return reply.code(201).send(material);
  });

  app.patch("/deals/:dealId/materials/:materialId", async (request, reply) => {
    const paramsResult = materialParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ message: formatZodError(paramsResult.error) });
    }

    const bodyResult = updateMaterialSchema.safeParse(request.body ?? {});
    if (!bodyResult.success) {
      return reply.code(400).send({ message: formatZodError(bodyResult.error) });
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return reply.code(404).send({ message: "Deal not found" });
    }

    const material = await prisma.materialObject.findFirst({
      where: {
        id: paramsResult.data.materialId,
        dealId: paramsResult.data.dealId
      }
    });
    if (!material) {
      return reply.code(404).send({ message: "Material not found" });
    }

    const existingData = normalizeMaterialData(material.data);
    const nextData = { ...existingData };
    if (bodyResult.data.evidenceRefs !== undefined) {
      nextData.evidenceRefs = bodyResult.data.evidenceRefs;
    }
    if (bodyResult.data.meta !== undefined) {
      nextData.meta = bodyResult.data.meta;
    }
    const nextTruthClass = bodyResult.data.truthClass ?? material.truthClass;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedMaterial = await tx.materialObject.update({
        where: { id: paramsResult.data.materialId },
        data: {
          truthClass: bodyResult.data.truthClass,
          data: nextData
        }
      });

      await tx.materialRevision.create({
        data: {
          materialId: updatedMaterial.id,
          dealId: paramsResult.data.dealId,
          type: updatedMaterial.type,
          truthClass: nextTruthClass,
          data: nextData
        }
      });

      return updatedMaterial;
    });

    return reply.code(200).send(updated);
  });

  app.get("/deals/:dealId/artifacts", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return sendError(reply, request, 400, formatZodError(paramsResult.error));
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return sendError(reply, request, 404, "Deal not found");
    }

    const artifacts = await prisma.artifact.findMany({
      where: { dealId: paramsResult.data.dealId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    return reply.code(200).send(
      artifacts.map((artifact) => ({
        artifactId: artifact.id,
        dealId: artifact.dealId,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        sha256Hex: artifact.sha256Hex,
        uploaderId: artifact.uploaderId,
        createdAt: artifact.createdAt
      }))
    );
  });

  app.post("/deals/:dealId/artifacts", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return sendError(reply, request, 400, formatZodError(paramsResult.error));
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return sendError(reply, request, 404, "Deal not found");
    }

    let uploaderId: string | null = null;
    const headerUploader = request.headers["x-uploader-id"];
    if (typeof headerUploader === "string" && headerUploader.trim()) {
      const uploaderResult = uploaderIdSchema.safeParse(headerUploader.trim());
      if (!uploaderResult.success) {
        return sendError(reply, request, 400, formatZodError(uploaderResult.error));
      }
      uploaderId = uploaderResult.data;
    }

    let fileBuffer: Buffer | null = null;
    let fileMeta: { filename: string; mimeType: string } | null = null;

    const parts = request.parts();
    for await (const rawPart of parts) {
      const part = rawPart as MultipartPart;
      if (part.type === "file") {
        if (!fileBuffer && part.fieldname === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk as Buffer);
          }
          fileBuffer = Buffer.concat(chunks);
          fileMeta = {
            filename: safeFilename(part.filename),
            mimeType: part.mimetype || "application/octet-stream"
          };
        } else {
          for await (const _ of part.file) {
            // drain extra file streams
          }
        }
        continue;
      }
      if (
        part.type === "field" &&
        part.fieldname === "uploaderId" &&
        typeof part.value === "string" &&
        part.value.trim()
      ) {
        uploaderId = part.value.trim();
      }
    }

    if (!fileBuffer || !fileMeta) {
      return sendError(reply, request, 400, "file is required");
    }

    if (uploaderId) {
      const uploaderResult = uploaderIdSchema.safeParse(uploaderId);
      if (!uploaderResult.success) {
        return sendError(reply, request, 400, formatZodError(uploaderResult.error));
      }
      uploaderId = uploaderResult.data;
    }

    const filename = fileMeta.filename;
    const mimeType = fileMeta.mimeType;
    const sha256Hex = hashBuffer(fileBuffer);

    const existingArtifact = await prisma.artifact.findUnique({
      where: { sha256Hex }
    });
    if (existingArtifact) {
      if (existingArtifact.dealId !== paramsResult.data.dealId) {
        return sendError(
          reply,
          request,
          409,
          "Artifact already exists for another deal"
        );
      }
      return reply.code(201).send({
        artifactId: existingArtifact.id,
        dealId: existingArtifact.dealId,
        filename: existingArtifact.filename,
        mimeType: existingArtifact.mimeType,
        sizeBytes: existingArtifact.sizeBytes,
        sha256Hex: existingArtifact.sha256Hex,
        uploaderId: existingArtifact.uploaderId,
        createdAt: existingArtifact.createdAt
      });
    }

    const artifactId = randomUUID();
    const storageKey = buildArtifactStorageKey(
      paramsResult.data.dealId,
      artifactId,
      filename
    );
    const diskPath = resolveArtifactPath(storageKey);
    await ensureDir(dirname(diskPath));
    await fs.writeFile(diskPath, fileBuffer);

    const artifact = await prisma.artifact.create({
      data: {
        id: artifactId,
        dealId: paramsResult.data.dealId,
        filename,
        mimeType,
        sizeBytes: fileBuffer.length,
        sha256Hex,
        storageKey,
        uploaderId
      }
    });

    return reply.code(201).send({
      artifactId: artifact.id,
      dealId: artifact.dealId,
      filename: artifact.filename,
      mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        sha256Hex: artifact.sha256Hex,
        uploaderId: artifact.uploaderId,
        createdAt: artifact.createdAt
      });
  });

  app.get(
    "/deals/:dealId/artifacts/:artifactId/download",
    async (request, reply) => {
      const paramsResult = artifactParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return sendError(reply, request, 400, formatZodError(paramsResult.error));
      }

      const artifact = await prisma.artifact.findFirst({
        where: {
          id: paramsResult.data.artifactId,
          dealId: paramsResult.data.dealId
        }
      });
      if (!artifact) {
        return sendError(reply, request, 404, "Artifact not found");
      }

      const filePath = resolveArtifactPath(artifact.storageKey);
      try {
        await fs.stat(filePath);
      } catch {
        return sendError(reply, request, 404, "Artifact file missing");
      }

      reply.header("Content-Type", artifact.mimeType);
      reply.header(
        "Content-Disposition",
        `attachment; filename="${artifact.filename}"`
      );
      if (isFastTestMode()) {
        const buffer = await fs.readFile(filePath);
        return reply.send(buffer);
      }
      return reply.send(createReadStream(filePath));
    }
  );

  app.post(
    "/deals/:dealId/artifacts/:artifactId/link",
    async (request, reply) => {
      const paramsResult = artifactParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return sendError(reply, request, 400, formatZodError(paramsResult.error));
      }

      const bodyResult = artifactLinkSchema.safeParse(request.body ?? {});
      if (!bodyResult.success) {
        return sendError(reply, request, 400, formatZodError(bodyResult.error));
      }

      const deal = await prisma.deal.findUnique({
        where: { id: paramsResult.data.dealId },
        select: { id: true }
      });
      if (!deal) {
        return sendError(reply, request, 404, "Deal not found");
      }

      const artifact = await prisma.artifact.findFirst({
        where: {
          id: paramsResult.data.artifactId,
          dealId: paramsResult.data.dealId
        },
        select: { id: true }
      });
      if (!artifact) {
        return sendError(reply, request, 404, "Artifact not found");
      }

      if (bodyResult.data.eventId) {
        const event = await prisma.event.findFirst({
          where: {
            id: bodyResult.data.eventId,
            dealId: paramsResult.data.dealId
          },
          select: { id: true }
        });
        if (!event) {
          return sendError(reply, request, 404, "Event not found");
        }
      }

      if (bodyResult.data.materialId) {
        const material = await prisma.materialObject.findFirst({
          where: {
            id: bodyResult.data.materialId,
            dealId: paramsResult.data.dealId
          },
          select: { id: true }
        });
        if (!material) {
          return sendError(reply, request, 404, "Material not found");
        }
      }

      const link = await prisma.artifactLink.create({
        data: {
          dealId: paramsResult.data.dealId,
          artifactId: paramsResult.data.artifactId,
          eventId: bodyResult.data.eventId,
          materialId: bodyResult.data.materialId,
          tag: bodyResult.data.tag
        }
      });

      return reply.code(201).send(link);
    }
  );

  app.get("/deals/:dealId/proofpack", async (request, reply) => {
    const paramsResult = dealParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      return sendError(reply, request, 400, formatZodError(paramsResult.error));
    }

    const queryResult = proofpackQuerySchema.safeParse(request.query ?? {});
    if (!queryResult.success) {
      return sendError(reply, request, 400, formatZodError(queryResult.error));
    }

    const atResult = resolveAtTimestamp(
      { at: queryResult.data.at },
      snapshotQuerySchema
    );
    if (!atResult.ok) {
      return sendError(reply, request, 400, atResult.message);
    }

    const deal = await prisma.deal.findUnique({
      where: { id: paramsResult.data.dealId },
      select: { id: true }
    });
    if (!deal) {
      return sendError(reply, request, 404, "Deal not found");
    }

    const actionList = parseActions(queryResult.data.actions);
    const actions = actionList.length > 0 ? actionList : ["FINALIZE_CLOSING"];

    const snapshot = await computeSnapshotData(
      prisma,
      paramsResult.data.dealId,
      atResult.at
    );

    const explainFiles: Array<{ path: string; buffer: Buffer }> = [];
    for (const action of actions) {
      try {
        const explain = await computeExplainData(
          prisma,
          paramsResult.data.dealId,
          atResult.at,
          {
            action,
            actorId: null,
            payload: {},
            authorityContext: {},
            evidenceRefs: []
          }
        );
        explainFiles.push({
          path: `explains/${action}.json`,
          buffer: Buffer.from(JSON.stringify(explain, null, 2))
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Explain failed";
        return sendError(reply, request, 400, message);
      }
    }

    const evidenceIndex = await buildEvidenceIndex(
      prisma,
      paramsResult.data.dealId,
      atResult.at
    );

    const snapshotBuffer = Buffer.from(JSON.stringify(snapshot, null, 2));
    const evidenceBuffer = Buffer.from(JSON.stringify(evidenceIndex, null, 2));
    const pdfBuffer = await createCompliancePdfBuffer(snapshot, evidenceIndex);

    const files = [
      { path: "snapshot.json", buffer: snapshotBuffer },
      ...explainFiles,
      { path: "evidence-index.json", buffer: evidenceBuffer },
      { path: "compliance-snapshot.pdf", buffer: pdfBuffer }
    ];

    const manifest = {
      generatedAt: new Date().toISOString(),
      dealId: paramsResult.data.dealId,
      at: atResult.at.toISOString(),
      deterministicClaim: true,
      replayInputs: ["events", "materialRevisions", "artifacts"],
      files: files.map((file) => ({
        path: file.path,
        sha256Hex: hashBuffer(file.buffer)
      }))
    };

    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
    const safeAt = atResult.at.toISOString().replace(/:/g, "-");

    reply.header("Content-Type", "application/zip");
    reply.header(
      "Content-Disposition",
      `attachment; filename="proofpack-${paramsResult.data.dealId}-${safeAt}.zip"`
    );

    if (isFastTestMode()) {
      const archive = archiver("zip", { zlib: { level: 9 } });
      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];

      const done = new Promise<Buffer>((resolve, reject) => {
        passThrough.on("data", (chunk) => chunks.push(chunk as Buffer));
        passThrough.on("end", () => resolve(Buffer.concat(chunks)));
        passThrough.on("error", (err) => reject(err));
        archive.on("error", (err) => reject(err));
      });

      archive.pipe(passThrough);
      for (const file of files) {
        archive.append(file.buffer, { name: file.path });
      }
      archive.append(manifestBuffer, { name: "manifest.json" });
      await archive.finalize();
      const zipBuffer = await done;
      return reply.send(zipBuffer);
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      request.log.error(err, "proofpack archive error");
      if (!reply.sent) {
        sendError(reply, request, 500, "Proofpack export failed");
      } else {
        reply.raw.destroy(err);
      }
    });
    archive.pipe(reply.raw);
    for (const file of files) {
      archive.append(file.buffer, { name: file.path });
    }
    archive.append(manifestBuffer, { name: "manifest.json" });
    await archive.finalize();
    return reply;
  });

  return app;
}

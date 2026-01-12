import Fastify, { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { AllowedEventTypes, DealStates, StressModes } from "@kernel/shared";
import { createPrismaClient } from "./prisma";
import { projectDealLifecycle } from "./projection";

type PrismaClientType = ReturnType<typeof createPrismaClient>;

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
  type: z.enum(["HUMAN", "SYSTEM"])
});

const assignRoleSchema = z.object({
  role: z.string().trim().min(1, "role is required").max(50, "role is too long")
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

    const actor = await prisma.actor.create({
      data: {
        name: bodyResult.data.name,
        type: bodyResult.data.type
      }
    });

    return reply.code(201).send(actor);
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

  return app;
}

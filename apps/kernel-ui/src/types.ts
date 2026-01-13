export type Deal = {
  id: string;
  name: string;
  state: string;
  stressMode: string;
  createdAt: string;
  updatedAt: string;
};

export type Event = {
  id: string;
  dealId: string;
  type: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  authorityContext: Record<string, unknown>;
  evidenceRefs: string[];
  createdAt: string;
  overrideUsed?: boolean;
};

export type EventSummary = {
  id: string;
  type: string;
  createdAt: string;
};

export type ActorSummary = {
  id: string;
  name: string;
  type: "HUMAN" | "SYSTEM";
  roles: string[];
  createdAt?: string;
  dealId?: string;
};

export type ExplainBlockReason = {
  type: string;
  message: string;
  materialType?: string;
  requiredTruth?: "DOC" | "HUMAN";
  currentTruth?: "AI" | "HUMAN" | "DOC" | null;
  satisfiedByOverride?: boolean;
};

export type ExplainBlockNextStep = {
  description: string;
  canBeFixedByRoles: string[];
  canBeOverriddenByRoles: string[];
};

export type ExplainBlock = {
  action: string;
  status: "BLOCKED";
  reasons: ExplainBlockReason[];
  nextSteps: ExplainBlockNextStep[];
};

export type MaterialObject = {
  id: string;
  dealId: string;
  type: string;
  data: Record<string, unknown> | null;
  truthClass: "DOC" | "HUMAN" | "AI";
  asOf: string | null;
  sourceRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaterialRequirementStatus = {
  type: string;
  requiredTruth: "DOC" | "HUMAN";
  currentTruth: "AI" | "HUMAN" | "DOC" | null;
  status: "OK" | "MISSING" | "INSUFFICIENT";
};

export type SnapshotResponse = {
  dealId: string;
  at: string;
  projection: {
    state: string;
    stressMode: string;
  };
  approvals: Record<
    string,
    {
      threshold: number;
      satisfiedByRole: Record<string, number>;
      satisfied: boolean;
    }
  >;
  materials: {
    list: Array<{
      id: string;
      type: string;
      truthClass: "DOC" | "HUMAN" | "AI";
      data: Record<string, unknown>;
      createdAt: string;
    }>;
    requiredFor: Record<string, MaterialRequirementStatus[]>;
  };
  timeline: {
    eventsCount: number;
    lastEventAt: string | null;
    lastEventType: string | null;
  };
  integrity: {
    replayFrom: string;
    deterministic: boolean;
  };
};

export type ExplainAllowedResponse = {
  status: "ALLOWED";
  action: string;
  at: string;
  projectionSummary: {
    state: string;
    stressMode: string;
  };
  requiredNext?: unknown;
};

export type ExplainBlockedResponse = ExplainBlock & {
  at: string;
  inputsUsed: {
    approvalsAtT: {
      threshold: number;
      satisfiedByRole: Record<string, number>;
      satisfied: boolean;
    } | null;
    materialsAtT: {
      list: Array<{
        id: string;
        type: string;
        truthClass: "DOC" | "HUMAN" | "AI";
        data: Record<string, unknown>;
        createdAt: string;
      }>;
      requirements: MaterialRequirementStatus[];
    };
    dealStateAtT: {
      state: string;
      stressMode: string;
    };
  };
};

export type ExplainReplayResponse = ExplainAllowedResponse | ExplainBlockedResponse;

export type Artifact = {
  artifactId: string;
  dealId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hex: string;
  uploaderId: string | null;
  createdAt: string;
};

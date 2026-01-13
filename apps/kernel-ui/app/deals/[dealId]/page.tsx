"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  createActor,
  createMaterial,
  exportProofPackUrl,
  explainAt,
  getDeal,
  listActors,
  listEvents,
  listMaterials,
  postEvent,
  type KernelResponse
} from "@/lib/kernelClient";
import { KernelErrorPanel } from "@/components/KernelErrorPanel";
import { useActorSession } from "@/context/ActorSessionContext";
import type {
  ActorSummary,
  Deal,
  Event,
  ExplainBlock,
  ExplainReplayResponse,
  MaterialObject
} from "@/types";

const demoRoles = ["GP", "LENDER", "ESCROW"] as const;
type DemoRole = (typeof demoRoles)[number];

type MilestoneAction = {
  action: "FINALIZE_CLOSING" | "ACTIVATE_OPERATIONS";
  eventType: "ClosingFinalized" | "OperationsActivated";
  title: string;
  ctaLabel: string;
};

type TaskItem = {
  id: string;
  kind: "material" | "approval";
  label: string;
  materialType?: string;
  action?: "FINALIZE_CLOSING" | "ACTIVATE_OPERATIONS";
};

export default function DealHomePage() {
  const params = useParams();
  const dealId = typeof params?.dealId === "string" ? params.dealId : "";
  const { session, setSession, clearSession } = useActorSession();

  const [selectedRole, setSelectedRole] = useState<DemoRole>("GP");
  const [dealResponse, setDealResponse] = useState<KernelResponse<Deal> | null>(null);
  const [actorsResponse, setActorsResponse] = useState<KernelResponse<ActorSummary[]> | null>(null);
  const [materialsResponse, setMaterialsResponse] = useState<KernelResponse<MaterialObject[]> | null>(null);
  const [eventsResponse, setEventsResponse] = useState<KernelResponse<Event[]> | null>(null);
  const [explainResponse, setExplainResponse] = useState<KernelResponse<ExplainReplayResponse> | null>(null);
  const [explainBlock, setExplainBlock] = useState<ExplainBlock | null>(null);
  const [actionError, setActionError] = useState<KernelResponse<unknown> | null>(null);
  const [seedError, setSeedError] = useState<KernelResponse<unknown> | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedAttempted, setSeedAttempted] = useState(false);

  const milestone = useMemo(
    () => resolveMilestone(dealResponse?.ok ? dealResponse.data : null),
    [dealResponse]
  );

  const actors = useMemo(() => normalizeActors(actorsResponse), [actorsResponse]);
  const actorByRole = useMemo(() => {
    const map = new Map<DemoRole, ActorSummary>();
    for (const actor of actors) {
      for (const role of actor.roles) {
        if (demoRoles.includes(role as DemoRole) && !map.has(role as DemoRole)) {
          map.set(role as DemoRole, actor);
        }
      }
    }
    return map;
  }, [actors]);

  const selectedActor = actorByRole.get(selectedRole) ?? null;

  const tasks = useMemo(() => {
    if (!explainBlock) {
      return [] as TaskItem[];
    }
    return deriveTasksFromExplainBlock(explainBlock);
  }, [explainBlock]);

  const otherBlockers = useMemo(() => {
    if (!explainBlock) {
      return [];
    }
    return explainBlock.reasons.filter(
      (reason) =>
        reason.type !== "MISSING_MATERIAL" &&
        reason.type !== "INSUFFICIENT_TRUTH" &&
        reason.type !== "APPROVAL_THRESHOLD"
    );
  }, [explainBlock]);

  const recentEvents = useMemo(() => {
    if (!eventsResponse || !eventsResponse.ok || !eventsResponse.data) {
      return [];
    }
    const sorted = [...eventsResponse.data].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.slice(0, 5);
  }, [eventsResponse]);

  const loadDeal = useCallback(async () => {
    if (!dealId) {
      return;
    }
    const response = await getDeal<Deal>(dealId);
    setDealResponse(response);
  }, [dealId]);

  const loadActors = useCallback(async () => {
    if (!dealId) {
      return;
    }
    const response = await listActors<ActorSummary[]>(dealId);
    setActorsResponse(response);
  }, [dealId]);

  const loadMaterials = useCallback(async () => {
    if (!dealId) {
      return;
    }
    const response = await listMaterials<MaterialObject[]>(dealId);
    setMaterialsResponse(response);
  }, [dealId]);

  const loadEvents = useCallback(async () => {
    if (!dealId) {
      return;
    }
    const response = await listEvents<Event[]>(dealId);
    setEventsResponse(response);
  }, [dealId]);

  const loadExplain = useCallback(async () => {
    if (!dealId || !milestone) {
      return;
    }
    const response = await explainAt<ExplainReplayResponse>(dealId, undefined, {
      action: milestone.action,
      actorId: selectedActor?.id ?? null,
      payload: {},
      authorityContext: {},
      evidenceRefs: []
    });
    setExplainResponse(response);
    if (response.ok && response.data && response.data.status === "BLOCKED") {
      setExplainBlock(response.data as ExplainBlock);
      return;
    }
    setExplainBlock(null);
  }, [dealId, milestone, selectedActor]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadDeal(), loadActors(), loadMaterials(), loadEvents()]);
  }, [loadDeal, loadActors, loadMaterials, loadEvents]);

  useEffect(() => {
    if (!dealId) {
      return;
    }
    const storedRole = loadStoredRole(dealId);
    setSelectedRole(storedRole ?? "GP");
  }, [dealId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!dealId || !actorsResponse || !actorsResponse.ok) {
      return;
    }
    if (actors.length > 0 || seeding || seedAttempted) {
      return;
    }

    const seed = async () => {
      setSeeding(true);
      setSeedAttempted(true);
      const responses = await Promise.all([
        createActor<ActorSummary>(dealId, {
          name: "Demo GP",
          type: "HUMAN",
          role: "GP"
        }),
        createActor<ActorSummary>(dealId, {
          name: "Demo Lender",
          type: "HUMAN",
          role: "LENDER"
        }),
        createActor<ActorSummary>(dealId, {
          name: "Demo Escrow",
          type: "HUMAN",
          role: "ESCROW"
        })
      ]);

      const failure = responses.find((response) => !response.ok) ?? null;
      if (failure) {
        setSeedError(failure);
      } else {
        setSeedError(null);
      }

      await loadActors();
      setSeeding(false);
    };

    seed();
  }, [dealId, actorsResponse, actors.length, seeding, seedAttempted, loadActors]);

  useEffect(() => {
    if (!actorsResponse || !actorsResponse.ok) {
      return;
    }
    if (selectedActor) {
      if (!session || session.actorId !== selectedActor.id || session.role !== selectedRole) {
        setSession({
          actorId: selectedActor.id,
          actorName: selectedActor.name,
          role: selectedRole
        });
      }
      return;
    }
    if (actors.length > 0) {
      clearSession("Selected role has no actor linked yet.");
    }
  }, [actorsResponse, selectedActor, selectedRole, session, setSession, clearSession, actors.length]);

  useEffect(() => {
    if (!dealId) {
      return;
    }
    storeRole(dealId, selectedRole);
  }, [dealId, selectedRole]);

  useEffect(() => {
    loadExplain();
  }, [loadExplain]);

  const handleSelectRole = (role: DemoRole) => {
    setSelectedRole(role);
  };

  const handleAddMaterial = async (materialType: string) => {
    if (!dealId) {
      return;
    }
    setActionError(null);
    const response = await createMaterial<MaterialObject>(dealId, {
      type: materialType,
      truthClass: "DOC",
      evidenceRefs: [],
      meta: { source: "demo-ui" }
    });
    if (!response.ok) {
      setActionError(response);
      return;
    }
    await refreshAll();
    await loadExplain();
  };

  const handleApprove = async () => {
    if (!dealId || !milestone) {
      return;
    }
    if (!selectedActor) {
      setActionError(buildClientError("Actor session is required to approve.", milestonePath(dealId)));
      return;
    }
    setActionError(null);
    const response = await postEvent<Event>(dealId, {
      type: "ApprovalGranted",
      actorId: selectedActor.id,
      payload: {
        action: milestone.action,
        role: selectedRole
      },
      authorityContext: {},
      evidenceRefs: []
    });
    if (!response.ok) {
      setActionError(response);
      return;
    }
    await refreshAll();
    await loadExplain();
  };

  const handleRetryMilestone = async () => {
    if (!dealId || !milestone) {
      return;
    }
    if (!selectedActor) {
      setActionError(buildClientError("Actor session is required to perform this action.", milestonePath(dealId)));
      return;
    }
    setActionError(null);
    const response = await postEvent<Event>(dealId, {
      type: milestone.eventType,
      actorId: selectedActor.id,
      payload: {},
      authorityContext: {},
      evidenceRefs: []
    });

    if (response.ok) {
      await refreshAll();
      await loadExplain();
      return;
    }

    const blocked = extractExplainBlock(response.data);
    if (blocked) {
      setExplainBlock(blocked);
      return;
    }
    setActionError(response);
  };

  const exportProofPack = () => {
    if (!dealId) {
      return;
    }
    const url = exportProofPackUrl(dealId, new Date().toISOString());
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {dealResponse?.ok && dealResponse.data ? dealResponse.data.name : "Deal Home"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Deal ID: {dealId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatePill label={dealResponse?.ok ? dealResponse.data?.state : undefined} />
            <StatePill label={dealResponse?.ok ? dealResponse.data?.stressMode : undefined} variant="stress" />
            <div className="text-xs text-slate-500">
              Last updated: {dealResponse?.ok && dealResponse.data ? formatDate(dealResponse.data.updatedAt) : "—"}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo login</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {demoRoles.map((role) => (
              <button
                key={role}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  selectedRole === role
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => handleSelectRole(role)}
              >
                {role}
              </button>
            ))}
            <div className="text-xs text-slate-500">
              Acting as: {selectedActor ? `${selectedActor.name} (${selectedRole})` : "—"}
            </div>
          </div>
          {seeding && (
            <p className="mt-2 text-xs text-slate-500">Seeding demo actors...</p>
          )}
          {seedError && (
            <ErrorNotice title="Demo actor seeding failed" path={actorsPath(dealId)} response={seedError} />
          )}
          {actorsResponse && !actorsResponse.ok && (
            <ErrorNotice title="Actor fetch failed" path={actorsPath(dealId)} response={actorsResponse} />
          )}
        </div>
        {dealResponse && !dealResponse.ok && (
          <ErrorNotice title="Deal fetch failed" path={`/deals/${dealId}`} response={dealResponse} />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Next step</h2>
          {milestone ? (
            <div className="mt-4 space-y-3">
              <div className="text-lg font-semibold text-slate-900">{milestone.title}</div>
              <p className="text-sm text-slate-600">
                Use the primary action or resolve blockers below.
              </p>
              <button
                className="w-fit rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={handleRetryMilestone}
              >
                {milestone.ctaLabel}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No primary action for this deal state.</p>
          )}
          {actionError && (
            <div className="mt-4">
              <ErrorNotice title="Action failed" path={milestonePath(dealId)} response={actionError} />
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What's blocking?</h2>
          {explainResponse && !explainResponse.ok && (
            <ErrorNotice title="Explain failed" path={explainPath(dealId)} response={explainResponse} />
          )}
          {materialsResponse && !materialsResponse.ok && (
            <ErrorNotice title="Materials fetch failed" path={`/deals/${dealId}/materials`} response={materialsResponse} />
          )}
          {tasks.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No blockers detected for the next action.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="text-sm font-medium text-slate-800">{task.label}</div>
                  {task.kind === "material" && task.materialType && (
                    <button
                      className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                      onClick={() => handleAddMaterial(task.materialType ?? "")}
                    >
                      Add now
                    </button>
                  )}
                  {task.kind === "approval" && (
                    <button
                      className="rounded-md bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                      onClick={handleApprove}
                    >
                      Approve as {selectedRole}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {otherBlockers.length > 0 && (
            <div className="mt-4 text-xs text-slate-600">
              Additional blockers present. Use "View technical" for details.
            </div>
          )}

          {explainBlock && (
            <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-900">
                View technical
              </summary>
              <pre className="mt-2">{JSON.stringify(explainBlock, null, 2)}</pre>
            </details>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent activity</h2>
        {eventsResponse && !eventsResponse.ok && (
          <ErrorNotice title="Events fetch failed" path={eventsPath(dealId)} response={eventsResponse} />
        )}
        {recentEvents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No recent events.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {recentEvents.map((event) => (
              <div key={event.id} className="rounded-md border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-900">
                  {humanizeEvent(event.type)}
                </div>
                <div className="text-xs text-slate-500">{formatDate(event.createdAt)}</div>
                <details className="mt-2 text-xs text-slate-700">
                  <summary className="cursor-pointer">Details</summary>
                  <pre className="mt-2">{JSON.stringify(event, null, 2)}</pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Proof & Evidence</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            href={`/deals/${dealId}/dataroom`}
          >
            Data Room
          </Link>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            onClick={exportProofPack}
          >
            Export Proof Pack
          </button>
          <Link
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            href={`/deals/${dealId}/playback`}
          >
            Playback
          </Link>
        </div>
        <div className="mt-4 text-xs text-slate-600">
          Truth badges: <span className="ml-2">✅ DOC</span>{" "}
          <span className="ml-2">👤 HUMAN</span> <span className="ml-2">🤖 AI</span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Advanced</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link className="underline" href={`/deals/${dealId}/timeline`}>Timeline</Link>
          <Link className="underline" href={`/deals/${dealId}/materials`}>Materials</Link>
          <Link className="underline" href={`/deals/${dealId}/action`}>Action</Link>
          <Link className="underline" href={`/deals/${dealId}/playback`}>Playback</Link>
          <Link className="underline" href={`/deals/${dealId}/dataroom`}>Data Room</Link>
        </div>
      </section>
    </div>
  );
}

function normalizeActors(response: KernelResponse<ActorSummary[]> | null): ActorSummary[] {
  if (!response || !response.ok || !Array.isArray(response.data)) {
    return [];
  }
  return response.data.filter((actor) => actor && typeof actor.id === "string");
}

function resolveMilestone(deal: Deal | null): MilestoneAction | null {
  if (!deal) {
    return null;
  }
  if (deal.state === "Exited" || deal.state === "Terminated") {
    return null;
  }
  if (deal.state === "Closed") {
    return {
      action: "ACTIVATE_OPERATIONS",
      eventType: "OperationsActivated",
      title: "Activate operations",
      ctaLabel: "Activate Operations"
    };
  }
  return {
    action: "FINALIZE_CLOSING",
    eventType: "ClosingFinalized",
    title: "Finalize closing",
    ctaLabel: "Finalize Closing"
  };
}

function deriveTasksFromExplainBlock(block: ExplainBlock): TaskItem[] {
  const tasks: TaskItem[] = [];
  const materialTypes = new Set<string>();
  let needsApproval = false;

  for (const reason of block.reasons) {
    if (reason.type === "MISSING_MATERIAL" || reason.type === "INSUFFICIENT_TRUTH") {
      if (reason.materialType) {
        materialTypes.add(reason.materialType);
      }
    }
    if (reason.type === "APPROVAL_THRESHOLD") {
      needsApproval = true;
    }
  }

  for (const materialType of materialTypes) {
    tasks.push({
      id: `material-${materialType}`,
      kind: "material",
      label: `Add ${materialType} (DOC)`,
      materialType
    });
  }

  if (needsApproval) {
    const action = block.action === "ACTIVATE_OPERATIONS" ? "ACTIVATE_OPERATIONS" : "FINALIZE_CLOSING";
    tasks.push({
      id: "approval",
      kind: "approval",
      label: `Approval needed for ${action.replace("_", " ")}`,
      action
    });
  }

  return tasks;
}

function extractExplainBlock(data: unknown): ExplainBlock | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (record.status !== "BLOCKED") {
    return null;
  }
  if (!Array.isArray(record.reasons)) {
    return null;
  }
  return record as ExplainBlock;
}

function loadStoredRole(dealId: string): DemoRole | null {
  try {
    const raw = localStorage.getItem(`demoRole:${dealId}`);
    if (!raw) {
      return null;
    }
    if (demoRoles.includes(raw as DemoRole)) {
      return raw as DemoRole;
    }
  } catch {
    return null;
  }
  return null;
}

function storeRole(dealId: string, role: DemoRole) {
  try {
    localStorage.setItem(`demoRole:${dealId}`, role);
  } catch {
    // ignore storage errors
  }
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function humanizeEvent(type: string): string {
  const map: Record<string, string> = {
    ApprovalGranted: "Approval recorded",
    ClosingFinalized: "Closing finalized",
    OperationsActivated: "Operations activated",
    DealApproved: "Deal approved",
    ReviewOpened: "Review opened",
    MaterialChangeDetected: "Material change detected"
  };
  return map[type] ?? "Event recorded";
}

function StatePill({
  label,
  variant
}: {
  label?: string;
  variant?: "stress";
}) {
  if (!label) {
    return (
      <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
        —
      </span>
    );
  }
  const styles =
    variant === "stress"
      ? "bg-amber-100 text-amber-900"
      : "bg-emerald-100 text-emerald-900";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>
      {label}
    </span>
  );
}

function ErrorNotice({
  title,
  response,
  path
}: {
  title: string;
  response: KernelResponse<unknown>;
  path: string;
}) {
  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <div className="font-semibold">{title}</div>
      <details className="mt-2">
        <summary className="cursor-pointer">Technical details</summary>
        <KernelErrorPanel title={title} path={path} response={response} />
      </details>
    </div>
  );
}

function buildClientError(message: string, path: string): KernelResponse<unknown> {
  return {
    ok: false,
    status: 0,
    data: { error: "CLIENT_ERROR", message, path }
  };
}

function actorsPath(dealId: string) {
  return `/deals/${dealId}/actors`;
}

function eventsPath(dealId: string) {
  return `/deals/${dealId}/events`;
}

function explainPath(dealId: string) {
  return `/deals/${dealId}/explain`;
}

function milestonePath(dealId: string) {
  return `/deals/${dealId}/events`;
}

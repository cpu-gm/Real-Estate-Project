"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  explainAt,
  exportProofPackUrl,
  getSnapshot,
  listEvents,
  type KernelResponse
} from "@/lib/kernelClient";
import { KernelErrorPanel } from "@/components/KernelErrorPanel";
import { ExplainBlockView } from "@/components/ExplainBlockView";
import { useActorSession } from "@/context/ActorSessionContext";
import type {
  EventSummary,
  ExplainBlockedResponse,
  ExplainReplayResponse,
  SnapshotResponse
} from "@/types";

const explainActions = [
  { label: "ClosingFinalized", value: "FINALIZE_CLOSING" },
  { label: "DealApproved", value: "APPROVE_DEAL" }
];

const truthRank: Record<string, number> = {
  AI: 1,
  HUMAN: 2,
  DOC: 3
};

export default function DealPlaybackPage() {
  const params = useParams();
  const dealId = resolveDealId(params?.dealId);
  const { session } = useActorSession();

  const [atInput, setAtInput] = useState("");
  const [snapshotResponse, setSnapshotResponse] = useState<KernelResponse<SnapshotResponse> | null>(null);
  const [eventsResponse, setEventsResponse] = useState<KernelResponse<EventSummary[]> | null>(null);
  const [scrubIndex, setScrubIndex] = useState(0);
  const [t1Input, setT1Input] = useState("");
  const [t2Input, setT2Input] = useState("");
  const [snapshotT1, setSnapshotT1] = useState<KernelResponse<SnapshotResponse> | null>(null);
  const [snapshotT2, setSnapshotT2] = useState<KernelResponse<SnapshotResponse> | null>(null);
  const [explainT1, setExplainT1] = useState<KernelResponse<ExplainReplayResponse> | null>(null);
  const [explainT2, setExplainT2] = useState<KernelResponse<ExplainReplayResponse> | null>(null);
  const [action, setAction] = useState(explainActions[0]?.value ?? "FINALIZE_CLOSING");
  const [actorId, setActorId] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [proofpackInfo, setProofpackInfo] = useState<{ url: string; at: string } | null>(null);
  const [proofpackError, setProofpackError] = useState<string | null>(null);

  const atIso = useMemo(() => toIsoFromLocal(atInput), [atInput]);
  const t1Iso = useMemo(() => toIsoFromLocal(t1Input), [t1Input]);
  const t2Iso = useMemo(() => toIsoFromLocal(t2Input), [t2Input]);

  useEffect(() => {
    setAtInput((current) => current || toDatetimeLocalValue(new Date()));
  }, []);

  useEffect(() => {
    if (!dealId) {
      return;
    }
    let active = true;
    const load = async () => {
      const response = await listEvents<EventSummary[]>(dealId);
      if (active) {
        setEventsResponse(response);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [dealId]);

  const events = useMemo(() => normalizeEvents(eventsResponse), [eventsResponse]);

  useEffect(() => {
    if (events.length > 0) {
      setScrubIndex((current) => (current >= events.length ? events.length - 1 : current));
      setT1Input((current) => current || toDatetimeLocalValue(new Date(events[0].createdAt)));
      setT2Input((current) => current || toDatetimeLocalValue(new Date(events[events.length - 1].createdAt)));
      return;
    }
    const now = toDatetimeLocalValue(new Date());
    setT1Input((current) => current || now);
    setT2Input((current) => current || now);
  }, [events]);

  const loadSnapshot = async () => {
    setClientError(null);
    if (!dealId) {
      setClientError("Deal ID is required.");
      return;
    }
    const response = await getSnapshot<SnapshotResponse>(dealId, atIso);
    setSnapshotResponse(response);
  };

  const exportProofPack = () => {
    setProofpackError(null);
    if (!dealId) {
      setProofpackError("Deal ID is required.");
      return;
    }
    if (!atIso) {
      setProofpackError("At time is required.");
      return;
    }
    const url = exportProofPackUrl(dealId, atIso);
    window.open(url, "_blank", "noopener");
    setProofpackInfo({ url, at: atIso });
  };

  const runExplainSingle = async (target: "t1" | "t2") => {
    setClientError(null);
    if (!dealId) {
      setClientError("Deal ID is required.");
      return;
    }
    if (!action) {
      setClientError("Action is required.");
      return;
    }
    const at = target === "t1" ? t1Iso : t2Iso;
    if (!at) {
      setClientError(`${target.toUpperCase()} timestamp is required.`);
      return;
    }
    const effectiveActorId = actorId.trim() || session?.actorId || null;
    const response = await explainAt<ExplainReplayResponse>(dealId, at, {
      action,
      actorId: effectiveActorId,
      payload: {},
      authorityContext: {},
      evidenceRefs: []
    });
    if (target === "t1") {
      setExplainT1(response);
    } else {
      setExplainT2(response);
    }
  };

  const setRelativeTime = (offsetMs: number) => {
    const date = new Date(Date.now() + offsetMs);
    setAtInput(toDatetimeLocalValue(date));
  };

  const setNow = () => {
    setAtInput(toDatetimeLocalValue(new Date()));
  };

  const jumpToIndex = (index: number) => {
    const event = events[index];
    if (!event) {
      return;
    }
    setScrubIndex(index);
    setAtInput(toDatetimeLocalValue(new Date(event.createdAt)));
  };

  const loadDiff = async () => {
    setClientError(null);
    if (!dealId) {
      setClientError("Deal ID is required.");
      return;
    }
    if (!t1Iso || !t2Iso) {
      setClientError("T1 and T2 must be valid timestamps.");
      return;
    }
    const [left, right] = await Promise.all([
      getSnapshot<SnapshotResponse>(dealId, t1Iso),
      getSnapshot<SnapshotResponse>(dealId, t2Iso)
    ]);
    setSnapshotT1(left);
    setSnapshotT2(right);
  };

  const diff = useMemo(() => {
    if (!snapshotT1?.ok || !snapshotT2?.ok || !snapshotT1.data || !snapshotT2.data) {
      return null;
    }
    return computeSnapshotDiff(snapshotT1.data, snapshotT2.data);
  }, [snapshotT1, snapshotT2]);

  const reasonDelta = useMemo(() => {
    if (!explainT1?.ok || !explainT2?.ok || !explainT1.data || !explainT2.data) {
      return null;
    }
    return computeReasonDelta(explainT1.data, explainT2.data);
  }, [explainT1, explainT2]);

  const scrubTimeValue = useMemo(() => {
    if (events[scrubIndex]) {
      return toDatetimeLocalValue(new Date(events[scrubIndex].createdAt));
    }
    return atInput;
  }, [events, scrubIndex, atInput]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Playback</h1>
        <p className="mt-1 text-sm text-slate-500">Deal ID: {dealId || "None"}</p>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm text-slate-700">
            At time
            <input
              type="datetime-local"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={atInput}
              onChange={(event) => setAtInput(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => jumpToIndex(0)}
              disabled={events.length === 0}
            >
              Jump to first
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => jumpToIndex(events.length - 1)}
              disabled={events.length === 0}
            >
              Jump to last
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={setNow}
            >
              Now
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => setRelativeTime(-5 * 60 * 1000)}
            >
              -5m
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => setRelativeTime(-60 * 60 * 1000)}
            >
              -1h
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => setRelativeTime(-24 * 60 * 60 * 1000)}
            >
              -1d
            </button>
          </div>
          <button
            className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={loadSnapshot}
          >
            Load Snapshot
          </button>
          <button
            className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            onClick={exportProofPack}
          >
            Export Proof Pack
          </button>
          {clientError && <p className="text-sm text-red-600">{clientError}</p>}
          {proofpackError && <p className="text-sm text-red-600">{proofpackError}</p>}
          {proofpackInfo && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">Proof Pack requested</div>
              <div>At: {proofpackInfo.at}</div>
              <div>URL: {proofpackInfo.url}</div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Timeline</h2>
        {eventsResponse && !eventsResponse.ok && (
          <KernelErrorPanel
            title="Events fetch failed"
            path={buildEventsPath(dealId)}
            response={eventsResponse}
          />
        )}
        {eventsResponse && eventsResponse.ok && (
          <div className="mt-4 space-y-4">
            <label className="grid gap-2 text-sm text-slate-700">
              Scrubber
              <input
                type="range"
                min={0}
                max={Math.max(events.length - 1, 0)}
                value={events.length ? scrubIndex : 0}
                onChange={(event) => jumpToIndex(Number(event.target.value))}
                disabled={events.length === 0}
              />
            </label>
            <div className="text-xs text-slate-600">
              Selected: {events[scrubIndex]?.type ?? "None"} {events[scrubIndex] ? "@" : ""}
              {events[scrubIndex] ? formatDisplayTime(events[scrubIndex].createdAt) : ""}
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
              {events.length === 0 ? (
                <p className="p-3 text-xs text-slate-500">No events available.</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {events.map((event, index) => (
                    <button
                      key={event.id}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50"
                      onClick={() => jumpToIndex(index)}
                    >
                      <span className="font-medium text-slate-800">{event.type}</span>
                      <span className="text-slate-500">{formatDisplayTime(event.createdAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Snapshot Summary</h2>
        {!snapshotResponse && <p className="mt-2 text-sm text-slate-600">No snapshot loaded.</p>}
        {snapshotResponse && !snapshotResponse.ok && (
          <KernelErrorPanel
            title="Snapshot failed"
            path={buildSnapshotPath(dealId, atIso)}
            response={snapshotResponse}
          />
        )}
        {snapshotResponse && snapshotResponse.ok && snapshotResponse.data && (
          <div className="mt-4 space-y-4 text-sm text-slate-700">
            <div className="grid gap-2">
              <div>
                <span className="font-semibold">State:</span> {snapshotResponse.data.projection.state}
              </div>
              <div>
                <span className="font-semibold">Stress Mode:</span> {snapshotResponse.data.projection.stressMode}
              </div>
              <div>
                <span className="font-semibold">Last Event:</span> {snapshotResponse.data.timeline.lastEventType ?? "None"}
              </div>
              <div>
                <span className="font-semibold">Last Event At:</span> {snapshotResponse.data.timeline.lastEventAt ?? "None"}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Compare T1 vs T2</h2>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm text-slate-700">
            T1
            <input
              type="datetime-local"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={t1Input}
              onChange={(event) => setT1Input(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            T2
            <input
              type="datetime-local"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={t2Input}
              onChange={(event) => setT2Input(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => setT1Input(scrubTimeValue)}
            >
              Set T1 to scrubber
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => setT2Input(scrubTimeValue)}
            >
              Set T2 to scrubber
            </button>
          </div>
          <button
            className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={loadDiff}
          >
            Load Diff
          </button>
        </div>

        {snapshotT1 && !snapshotT1.ok && (
          <KernelErrorPanel
            title="Snapshot T1 failed"
            path={buildSnapshotPath(dealId, t1Iso)}
            response={snapshotT1}
          />
        )}
        {snapshotT2 && !snapshotT2.ok && (
          <KernelErrorPanel
            title="Snapshot T2 failed"
            path={buildSnapshotPath(dealId, t2Iso)}
            response={snapshotT2}
          />
        )}

        {diff && (
          <div className="mt-4 space-y-4 text-sm text-slate-700">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">State Diff</h3>
              <div className="mt-2 text-sm">
                State: {diff.state.from} -> {diff.state.to}
              </div>
              <div className="text-sm">
                Stress: {diff.stressMode.from} -> {diff.stressMode.to}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approvals Diff</h3>
              {diff.approvals.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No approval changes.</p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {diff.approvals.map((approval) => (
                    <div key={approval.action} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="font-semibold text-slate-900">{approval.action}</div>
                      <div className="text-xs text-slate-600">
                        Satisfied: {String(approval.from)} -> {String(approval.to)}
                      </div>
                      {approval.rolesGained.length > 0 && (
                        <div className="text-xs text-slate-600">
                          Roles gained: {approval.rolesGained.join(", ")}
                        </div>
                      )}
                      {approval.rolesLost.length > 0 && (
                        <div className="text-xs text-slate-600">
                          Roles lost: {approval.rolesLost.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Materials Diff</h3>
              <div className="mt-2 grid gap-2">
                {diff.materials.added.length === 0 && diff.materials.upgraded.length === 0 && diff.materials.missing.length === 0 && (
                  <p className="text-xs text-slate-500">No material changes.</p>
                )}
                {diff.materials.added.length > 0 && (
                  <div className="text-xs text-slate-600">
                    Added: {diff.materials.added.join(", ")}
                  </div>
                )}
                {diff.materials.upgraded.length > 0 && (
                  <div className="text-xs text-slate-600">
                    Upgraded: {diff.materials.upgraded.map((item) => `${item.type} ${item.from} -> ${item.to}`).join(", ")}
                  </div>
                )}
                {diff.materials.missing.length > 0 && (
                  <div className="text-xs text-slate-600">
                    Missing counts: {diff.materials.missing.map((item) => `${item.action} ${item.from} -> ${item.to}`).join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Why Changed?</h2>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm text-slate-700">
            Action
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              {explainActions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            Actor ID (optional)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
            />
            {!actorId && session?.actorId && (
              <span className="text-xs text-slate-500">Using actor session: {session.actorId}</span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => runExplainSingle("t1")}
            >
              Explain at T1
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => runExplainSingle("t2")}
            >
              Explain at T2
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">T1</h3>
            {explainT1 && !explainT1.ok && (
              <KernelErrorPanel
                title="Explain T1 failed"
                path={buildExplainPath(dealId, t1Iso)}
                response={explainT1}
              />
            )}
            {explainT1 && explainT1.ok && explainT1.data && (
              <ExplainResultPanel result={explainT1.data} />
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">T2</h3>
            {explainT2 && !explainT2.ok && (
              <KernelErrorPanel
                title="Explain T2 failed"
                path={buildExplainPath(dealId, t2Iso)}
                response={explainT2}
              />
            )}
            {explainT2 && explainT2.ok && explainT2.data && (
              <ExplainResultPanel result={explainT2.data} />
            )}
          </div>
        </div>

        {reasonDelta && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <div className="font-semibold text-slate-900">Reason Delta</div>
            {reasonDelta.cleared.length > 0 && (
              <div className="mt-1">Cleared: {reasonDelta.cleared.join(", ")}</div>
            )}
            {reasonDelta.added.length > 0 && (
              <div className="mt-1">Added: {reasonDelta.added.join(", ")}</div>
            )}
            {reasonDelta.cleared.length === 0 && reasonDelta.added.length === 0 && (
              <div className="mt-1">No reason changes.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ExplainResultPanel({ result }: { result: ExplainReplayResponse }) {
  if (result.status === "BLOCKED") {
    return <ExplainBlockView block={result as ExplainBlockedResponse} />;
  }
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <div className="font-semibold">ALLOWED</div>
      <pre className="mt-2 bg-white text-xs text-emerald-900">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function normalizeEvents(response: KernelResponse<EventSummary[]> | null): EventSummary[] {
  if (!response || !response.ok || !Array.isArray(response.data)) {
    return [];
  }
  const normalized = response.data
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.type !== "string" || typeof record.createdAt !== "string") {
        return null;
      }
      return {
        id: record.id,
        type: record.type,
        createdAt: record.createdAt
      } as EventSummary;
    })
    .filter((item): item is EventSummary => Boolean(item))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return normalized.length > 200 ? normalized.slice(-200) : normalized;
}

function formatDisplayTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoFromLocal(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function resolveDealId(value: string | string[] | undefined): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return resolveDealId(value[0]);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("<") || trimmed.includes(">") || trimmed.toLowerCase() === "dealid") {
    return "";
  }
  return trimmed;
}

function buildSnapshotPath(dealId: string, atIso?: string): string {
  if (!dealId) {
    return "/deals/unknown/snapshot";
  }
  if (!atIso) {
    return `/deals/${dealId}/snapshot`;
  }
  return `/deals/${dealId}/snapshot?at=${encodeURIComponent(atIso)}`;
}

function buildExplainPath(dealId: string, atIso?: string): string {
  if (!dealId) {
    return "/deals/unknown/explain";
  }
  if (!atIso) {
    return `/deals/${dealId}/explain`;
  }
  return `/deals/${dealId}/explain?at=${encodeURIComponent(atIso)}`;
}

function buildEventsPath(dealId: string): string {
  if (!dealId) {
    return "/deals/unknown/events";
  }
  return `/deals/${dealId}/events`;
}

function computeSnapshotDiff(left: SnapshotResponse, right: SnapshotResponse) {
  const approvals = new Map<string, { from: boolean; to: boolean; rolesGained: string[]; rolesLost: string[] }>();
  const allActions = new Set([...Object.keys(left.approvals), ...Object.keys(right.approvals)]);
  for (const action of allActions) {
    const leftApproval = left.approvals[action];
    const rightApproval = right.approvals[action];
    const from = leftApproval?.satisfied ?? false;
    const to = rightApproval?.satisfied ?? false;
    if (from === to && !leftApproval && !rightApproval) {
      continue;
    }
    const leftRoles = leftApproval ? Object.keys(leftApproval.satisfiedByRole) : [];
    const rightRoles = rightApproval ? Object.keys(rightApproval.satisfiedByRole) : [];
    const rolesGained = rightRoles.filter((role) => !leftRoles.includes(role));
    const rolesLost = leftRoles.filter((role) => !rightRoles.includes(role));
    approvals.set(action, { from, to, rolesGained, rolesLost });
  }

  const leftMaterialTruth = summarizeMaterials(left.materials.list);
  const rightMaterialTruth = summarizeMaterials(right.materials.list);

  const added: string[] = [];
  const upgraded: Array<{ type: string; from: string; to: string }> = [];
  for (const [type, rightTruth] of rightMaterialTruth.entries()) {
    const leftTruth = leftMaterialTruth.get(type);
    if (!leftTruth) {
      added.push(type);
      continue;
    }
    if (truthRank[rightTruth] > truthRank[leftTruth]) {
      upgraded.push({ type, from: leftTruth, to: rightTruth });
    }
  }

  const missing: Array<{ action: string; from: number; to: number }> = [];
  const allRequiredActions = new Set([
    ...Object.keys(left.materials.requiredFor),
    ...Object.keys(right.materials.requiredFor)
  ]);
  for (const action of allRequiredActions) {
    const leftMissing = countMissing(left.materials.requiredFor[action] ?? []);
    const rightMissing = countMissing(right.materials.requiredFor[action] ?? []);
    if (leftMissing !== rightMissing) {
      missing.push({ action, from: leftMissing, to: rightMissing });
    }
  }

  return {
    state: {
      from: left.projection.state,
      to: right.projection.state
    },
    stressMode: {
      from: left.projection.stressMode,
      to: right.projection.stressMode
    },
    approvals: Array.from(approvals.entries()).map(([action, data]) => ({
      action,
      from: data.from,
      to: data.to,
      rolesGained: data.rolesGained,
      rolesLost: data.rolesLost
    })),
    materials: {
      added,
      upgraded,
      missing
    }
  };
}

function summarizeMaterials(materials: SnapshotResponse["materials"]["list"]) {
  const map = new Map<string, string>();
  for (const material of materials) {
    const current = map.get(material.type);
    if (!current || truthRank[material.truthClass] > truthRank[current]) {
      map.set(material.type, material.truthClass);
    }
  }
  return map;
}

function countMissing(requirements: SnapshotResponse["materials"]["requiredFor"][string]) {
  return requirements.filter((req) => req.status !== "OK").length;
}

function computeReasonDelta(t1: ExplainReplayResponse, t2: ExplainReplayResponse) {
  const t1Reasons = extractReasonKeys(t1);
  const t2Reasons = extractReasonKeys(t2);

  if (t1.status === "BLOCKED" && t2.status !== "BLOCKED") {
    return { cleared: t1Reasons, added: [] };
  }

  if (t1.status !== "BLOCKED" && t2.status === "BLOCKED") {
    return { cleared: [], added: t2Reasons };
  }

  const cleared = t1Reasons.filter((reason) => !t2Reasons.includes(reason));
  const added = t2Reasons.filter((reason) => !t1Reasons.includes(reason));

  return { cleared, added };
}

function extractReasonKeys(result: ExplainReplayResponse): string[] {
  if (result.status !== "BLOCKED") {
    return [];
  }
  return result.reasons.map((reason) => {
    const material = reason.materialType ? `:${reason.materialType}` : "";
    return `${reason.type}${material}`;
  });
}

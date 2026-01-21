"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { kernelRequest, type KernelResponse } from "@/lib/kernelClient";
import { ExplainBlockView } from "@/components/ExplainBlockView";
import { KernelErrorPanel } from "@/components/KernelErrorPanel";
import { ALLOWED_ACTIONS } from "@/uxContract";
import type { Event, ExplainBlock } from "@/types";
import { useActorSession } from "@/context/ActorSessionContext";

const actionOptions = Object.values(ALLOWED_ACTIONS);

export default function DealActionPage() {
  const params = useParams();
  const dealId = params?.dealId as string;

  const [actionType, setActionType] = useState(actionOptions[0] ?? "");
  const [actorId, setActorId] = useState("");
  const [evidenceRefs, setEvidenceRefs] = useState("");
  const [payloadText, setPayloadText] = useState("{}");
  const [authorityText, setAuthorityText] = useState("{}");
  const [result, setResult] = useState<KernelResponse<Event> | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [manualOverride, setManualOverride] = useState(false);
  const [lastSubmittedActorId, setLastSubmittedActorId] = useState<string | null>(null);
  const eventPath = `/deals/${dealId}/events`;
  const { session } = useActorSession();

  useEffect(() => {
    if (!session?.actorId) {
      if (!manualOverride) {
        setActorId("");
      }
      return;
    }
    if (!manualOverride) {
      setActorId(session.actorId);
    }
  }, [session?.actorId, manualOverride]);

  const payloadParse = useMemo(() => safeParseJson(payloadText), [payloadText]);
  const authorityParse = useMemo(() => safeParseJson(authorityText), [authorityText]);

  const evidenceArray = useMemo(() => {
    return evidenceRefs
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }, [evidenceRefs]);

  const submit = async () => {
    setClientError(null);

    if (!actionType) {
      setClientError("Select an action type.");
      return;
    }

    if (!payloadParse.ok) {
      setClientError("Payload must be valid JSON.");
      return;
    }

    if (!authorityParse.ok) {
      setClientError("Authority context must be valid JSON.");
      return;
    }

    const fallbackActorId = session?.actorId ?? "";
    const effectiveActorId = actorId.trim() || fallbackActorId;

    if (!effectiveActorId) {
      setClientError("Actor ID is required.");
      return;
    }

    const body = {
      type: actionType,
      actorId: effectiveActorId,
      payload: payloadParse.value ?? {},
      authorityContext: authorityParse.value ?? {},
      evidenceRefs: evidenceArray
    };

    setLastSubmittedActorId(effectiveActorId);
    const response = await kernelRequest<Event>(eventPath, {
      method: "POST",
      body
    });

    setResult(response);
  };

  const renderRaw = (value: unknown) => {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value, null, 2);
  };

  const explainBlock =
    result &&
    result.status === 409 &&
    result.data &&
    typeof result.data === "object" &&
    (result.data as ExplainBlock).status === "BLOCKED"
      ? (result.data as ExplainBlock)
      : null;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Next Action</h1>
        <p className="mt-1 text-sm text-slate-500">Deal ID: {dealId}</p>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm text-slate-700">
            Action Type
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={actionType}
              onChange={(event) => setActionType(event.target.value)}
            >
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            Actor ID
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="actor-id"
              value={actorId}
              onChange={(event) => {
                const value = event.target.value;
                setActorId(value);
                if (!value.trim()) {
                  setManualOverride(false);
                  return;
                }
                if (session?.actorId && value.trim() === session.actorId) {
                  setManualOverride(false);
                } else {
                  setManualOverride(true);
                }
              }}
            />
            {session?.actorId && !manualOverride && (
              <span className="text-xs text-slate-500">
                Auto-filled from actor session.
              </span>
            )}
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            Evidence Refs (comma-separated)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="ref-1, ref-2"
              value={evidenceRefs}
              onChange={(event) => setEvidenceRefs(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            Payload JSON
            <textarea
              className="min-h-[120px] rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            Authority Context JSON
            <textarea
              className="min-h-[120px] rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={authorityText}
              onChange={(event) => setAuthorityText(event.target.value)}
            />
          </label>

          {clientError && <p className="text-sm text-red-600">{clientError}</p>}

          <button
            className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={submit}
          >
            Submit Action
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Result</h2>
        {!result ? (
          <p className="mt-2 text-sm text-slate-600">No action submitted yet.</p>
        ) : result.ok ? (
          <div className="mt-3">
            <p className="text-sm font-semibold text-emerald-700">Accepted</p>
            {lastSubmittedActorId && (
              <p className="mt-1 text-xs text-slate-600">
                Submitted actorId: {lastSubmittedActorId}
              </p>
            )}
            <pre className="mt-2">{renderRaw(result.data)}</pre>
          </div>
        ) : explainBlock ? (
          <div className="mt-3 space-y-3">
            <ExplainBlockView block={explainBlock} />
            <KernelErrorPanel title="Request blocked" path={eventPath} response={result} />
          </div>
        ) : (
          <KernelErrorPanel title="Request failed" path={eventPath} response={result} />
        )}
      </section>
    </div>
  );
}

function safeParseJson(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { ok: true, value: parsed as Record<string, unknown> };
    }
    return { ok: true, value: {} };
  } catch {
    return { ok: false };
  }
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { kernelRequest, type KernelResponse } from "@/lib/kernelClient";
import { KernelErrorPanel } from "@/components/KernelErrorPanel";
import { useActorSession } from "@/context/ActorSessionContext";

type ActorOption = {
  id: string;
  name: string;
  role: string;
};

export function ActorSessionSelector({ onClose }: { onClose?: () => void }) {
  const { dealId, session, setSession, clearSession, warning, setWarning } = useActorSession();
  const [actorsResponse, setActorsResponse] = useState<KernelResponse<unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const actorsPath = `/deals/${dealId}/actors`;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const response = await kernelRequest<unknown>(actorsPath);
      if (!active) {
        return;
      }
      setActorsResponse(response);
      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [actorsPath]);

  const actorOptions = useMemo(() => {
    if (!actorsResponse || !actorsResponse.ok) {
      return [] as ActorOption[];
    }
    return normalizeActorOptions(actorsResponse.data);
  }, [actorsResponse]);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (actorsResponse && actorsResponse.ok) {
      const exists = actorOptions.some((option) => option.id === session.actorId);
      if (!exists) {
        clearSession("Saved actor session is no longer valid.");
      }
    }
  }, [session, actorsResponse, actorOptions, clearSession]);

  const selectedId = session?.actorId ?? "";

  const handleSelect = (value: string) => {
    setWarning(null);
    if (!value) {
      clearSession();
      return;
    }
    const selected = actorOptions.find((option) => option.id === value);
    if (!selected) {
      clearSession("Selected actor is not available.");
      return;
    }
    setSession({
      actorId: selected.id,
      actorName: selected.name,
      role: selected.role
    });
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Actor Session</h3>
        {onClose && (
          <button
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Select an actor to persist as your active session for this deal.
      </p>

      {warning && (
        <p className="mt-2 text-xs text-amber-700">Warning: {warning}</p>
      )}

      {loading && <p className="mt-3 text-xs text-slate-500">Loading actors...</p>}

      {actorsResponse && !actorsResponse.ok && (
        <KernelErrorPanel
          title="Actors fetch failed"
          path={actorsPath}
          response={actorsResponse}
        />
      )}

      {actorsResponse && actorsResponse.ok && actorOptions.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">No actors linked to this deal yet.</p>
      )}

      {actorOptions.length > 0 && (
        <div className="mt-3 grid gap-2">
          <label className="text-xs text-slate-600">Select actor</label>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={selectedId}
            onChange={(event) => handleSelect(event.target.value)}
          >
            <option value="">-- Choose an actor --</option>
            {actorOptions.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name} ({actor.role})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function normalizeActorOptions(data: unknown): ActorOption[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      if (!id) {
        return null;
      }
      const name =
        typeof record.name === "string"
          ? record.name
          : typeof record.actorName === "string"
            ? record.actorName
            : id;

      const role = resolveRole(record);
      return {
        id,
        name,
        role
      } as ActorOption;
    })
    .filter((item): item is ActorOption => Boolean(item));
}

function resolveRole(record: Record<string, unknown>): string {
  if (typeof record.role === "string" && record.role.trim().length > 0) {
    return record.role;
  }
  if (typeof record.roleName === "string" && record.roleName.trim().length > 0) {
    return record.roleName;
  }
  if (Array.isArray(record.roles)) {
    const firstRole = record.roles.find(
      (role) => typeof role === "string" && role.trim().length > 0
    );
    if (firstRole && typeof firstRole === "string") {
      return firstRole;
    }
  }
  if (Array.isArray(record.roleNames)) {
    const firstRole = record.roleNames.find(
      (role) => typeof role === "string" && role.trim().length > 0
    );
    if (firstRole && typeof firstRole === "string") {
      return firstRole;
    }
  }
  return "Unknown";
}

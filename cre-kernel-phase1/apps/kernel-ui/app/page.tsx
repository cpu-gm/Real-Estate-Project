"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDeal, type KernelResponse } from "@/lib/kernelClient";
import { KernelErrorPanel } from "@/components/KernelErrorPanel";
import type { Deal } from "@/types";

export default function HomePage() {
  const router = useRouter();
  const [dealId, setDealId] = useState("");
  const [dealName, setDealName] = useState("");
  const [createResponse, setCreateResponse] = useState<KernelResponse<Deal> | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const trimmed = dealId.trim();

  const go = (path: "timeline" | "action" | "materials" | "playback" | "dataroom" | "home") => {
    if (!trimmed) {
      return;
    }
    if (path === "home") {
      router.push(`/deals/${trimmed}`);
      return;
    }
    router.push(`/deals/${trimmed}/${path}`);
  };

  const handleCreateDeal = async () => {
    setClientError(null);
    const name = dealName.trim();
    if (!name) {
      setClientError("Deal name is required.");
      return;
    }
    const response = await createDeal<Deal>({ name });
    setCreateResponse(response);
    if (response.ok && response.data?.id) {
      setDealId(response.data.id);
      setDealName("");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Kernel Deal Views</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create a deal or enter a deal ID to open Deal Home.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-2 text-sm text-slate-600">
            New deal name
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="Example: Parkview Towers"
              value={dealName}
              onChange={(event) => setDealName(event.target.value)}
            />
          </label>
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={handleCreateDeal}
          >
            Create deal
          </button>
        </div>
        {clientError && <p className="mt-2 text-sm text-red-600">{clientError}</p>}
        {createResponse && !createResponse.ok && (
          <KernelErrorPanel
            title="Deal creation failed"
            path="/deals"
            response={createResponse}
          />
        )}
        {createResponse && createResponse.ok && createResponse.data && (
          <div className="mt-3 text-sm text-slate-700">
            Created deal: <span className="font-semibold">{createResponse.data.id}</span>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            placeholder="Deal ID"
            value={dealId}
            onChange={(event) => setDealId(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
              onClick={() => go("home")}
            >
              Deal Home
            </button>
            <details className="group">
              <summary className="cursor-pointer rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100">
                Advanced
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={() => go("timeline")}
                >
                  Timeline
                </button>
                <button
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={() => go("action")}
                >
                  Next Action
                </button>
                <button
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={() => go("materials")}
                >
                  Materials
                </button>
                <button
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={() => go("playback")}
                >
                  Playback
                </button>
                <button
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={() => go("dataroom")}
                >
                  Data Room
                </button>
              </div>
            </details>
          </div>
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Contract Notes
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This UI is kernel-faithful. It renders kernel responses without adding lifecycle or
          authority logic.
        </p>
      </section>
    </div>
  );
}

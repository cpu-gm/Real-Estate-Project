"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { kernelRequest, type KernelResponse } from "@/lib/kernelClient";
import { KernelErrorPanel } from "@/components/KernelErrorPanel";
import type { Deal, Event } from "@/types";

export default function DealTimelinePage() {
  const params = useParams();
  const dealId = params?.dealId as string;

  const [dealResponse, setDealResponse] = useState<KernelResponse<Deal> | null>(null);
  const [eventsResponse, setEventsResponse] = useState<KernelResponse<Event[]> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [dealResult, eventsResult] = await Promise.all([
        kernelRequest<Deal>(`/deals/${dealId}`),
        kernelRequest<Event[]>(`/deals/${dealId}/events`)
      ]);

      if (!cancelled) {
        setDealResponse(dealResult);
        setEventsResponse(eventsResult);
      }
    };

    if (dealId) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [dealId]);

  const dealPath = `/deals/${dealId}`;
  const eventsPath = `/deals/${dealId}/events`;

  const isLoading = !dealResponse || !eventsResponse;

  if (isLoading) {
    return <div className="text-sm text-slate-600">Loading timeline...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Deal Timeline</h1>
        <p className="mt-1 text-sm text-slate-500">Deal ID: {dealId}</p>
        {dealResponse.ok && dealResponse.data ? (
          <div className="mt-4 grid gap-2 text-sm text-slate-700">
            <div>
              <span className="font-semibold">Name:</span> {dealResponse.data.name}
            </div>
            <div>
              <span className="font-semibold">State:</span> {dealResponse.data.state}
            </div>
            <div>
              <span className="font-semibold">Stress Mode:</span> {dealResponse.data.stressMode}
            </div>
            <div>
              <span className="font-semibold">Created:</span> {dealResponse.data.createdAt}
            </div>
            <div>
              <span className="font-semibold">Updated:</span> {dealResponse.data.updatedAt}
            </div>
          </div>
        ) : (
          <KernelErrorPanel
            title="Deal fetch failed"
            path={dealPath}
            response={dealResponse}
          />
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Events</h2>
        {eventsResponse.ok && Array.isArray(eventsResponse.data) ? (
          <div className="mt-4 space-y-3">
            {eventsResponse.data.length === 0 ? (
              <p className="text-sm text-slate-600">No events yet.</p>
            ) : (
              eventsResponse.data.map((event) => {
                const overrideUsed =
                  event.overrideUsed === true ||
                  (event.authorityContext &&
                    typeof event.authorityContext === "object" &&
                    (event.authorityContext as Record<string, unknown>).overrideUsed === true) ||
                  (event.payload &&
                    typeof event.payload === "object" &&
                    (event.payload as Record<string, unknown>).overrideUsed === true);

                return (
                  <div
                    key={event.id}
                    className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">{event.type}</span>
                        {overrideUsed && (
                          <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Override
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{event.createdAt}</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">Actor: {event.actorId ?? "null"}</div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <KernelErrorPanel
            title="Events fetch failed"
            path={eventsPath}
            response={eventsResponse}
          />
        )}
      </section>
    </div>
  );
}

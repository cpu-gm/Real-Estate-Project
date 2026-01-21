"use client";

import { useActorSession } from "@/context/ActorSessionContext";

type BannerProps = {
  onChange: () => void;
};

export function ActorSessionBanner({ onChange }: BannerProps) {
  const { session, warning } = useActorSession();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="text-slate-700">
          <span className="font-semibold">Acting as:</span>{" "}
          {session ? `${session.actorName} (${session.role})` : "None"}
        </div>
        <button
          className="text-xs font-medium text-slate-600 hover:text-slate-900"
          onClick={onChange}
        >
          Change
        </button>
      </div>
      {!session && (
        <p className="mt-1 text-xs text-amber-700">No active actor session.</p>
      )}
      {warning && (
        <p className="mt-1 text-xs text-amber-700">Warning: {warning}</p>
      )}
    </div>
  );
}
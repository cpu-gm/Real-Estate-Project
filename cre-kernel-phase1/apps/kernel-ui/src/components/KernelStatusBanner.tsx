"use client";

import { useEffect, useState } from "react";
import { kernelBaseUrl, kernelRequest } from "@/lib/kernelClient";

type HealthStatus = "connected" | "disconnected" | "checking";

export function KernelStatusBanner() {
  const [status, setStatus] = useState<HealthStatus>("checking");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const result = await kernelRequest<{ status?: string }>("/health");
        if (!active) {
          return;
        }
        if (result.ok && result.data && result.data.status === "ok") {
          setStatus("connected");
          setErrorDetail(null);
        } else {
          setStatus("disconnected");
          setErrorDetail(resolveErrorDetail(result.data));
        }
      } catch {
        if (active) {
          setStatus("disconnected");
          setErrorDetail("Network error");
        }
      }
    };

    check();

    return () => {
      active = false;
    };
  }, []);

  const statusLabel =
    status === "checking" ? "Checking" : status === "connected" ? "Connected" : "Not connected";
  const statusTone =
    status === "connected"
      ? "bg-emerald-100 text-emerald-800"
      : status === "checking"
        ? "bg-slate-200 text-slate-700"
        : "bg-amber-100 text-amber-900";

  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-2 text-xs">
        <div className="text-slate-600">Kernel URL: {kernelBaseUrl}</div>
        <div className="flex items-center gap-2">
          {errorDetail && (
            <span className="text-slate-500">Error: {errorDetail}</span>
          )}
          <span className={`rounded-full px-2 py-1 font-medium ${statusTone}`}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function resolveErrorDetail(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const message = record.message;
    if (typeof message === "string") {
      return message;
    }
    const error = record.error;
    if (typeof error === "string") {
      return error;
    }
  }
  return null;
}

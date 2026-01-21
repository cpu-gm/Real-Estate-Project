"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { kernelRequest, type KernelResponse } from "@/lib/kernelClient";
import { KernelErrorPanel } from "@/components/KernelErrorPanel";
import type { MaterialObject } from "@/types";

type TruthClass = "DOC" | "HUMAN" | "AI";

type MetaParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

const truthStyles: Record<TruthClass, string> = {
  DOC: "bg-emerald-100 text-emerald-800",
  HUMAN: "bg-sky-100 text-sky-800",
  AI: "bg-slate-200 text-slate-700"
};

export default function DealMaterialsPage() {
  const params = useParams();
  const dealId = params?.dealId as string;

  const [materialsResponse, setMaterialsResponse] = useState<KernelResponse<MaterialObject[]> | null>(null);
  const [submitResponse, setSubmitResponse] = useState<KernelResponse<MaterialObject> | null>(null);
  const [type, setType] = useState("");
  const [truthClass, setTruthClass] = useState<TruthClass>("DOC");
  const [evidenceRefsText, setEvidenceRefsText] = useState("");
  const [metaText, setMetaText] = useState("{}");
  const [clientError, setClientError] = useState<string | null>(null);
  const materialsPath = `/deals/${dealId}/materials`;

  const evidenceRefs = useMemo(() => {
    return evidenceRefsText
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }, [evidenceRefsText]);

  const loadMaterials = useCallback(async () => {
    const response = await kernelRequest<MaterialObject[]>(materialsPath);
    setMaterialsResponse(response);
  }, [materialsPath]);

  useEffect(() => {
    if (dealId) {
      loadMaterials();
    }
  }, [dealId, loadMaterials]);

  const submit = async () => {
    setClientError(null);

    const trimmedType = type.trim();
    if (!trimmedType) {
      setClientError("Type is required.");
      return;
    }

    const metaResult = parseMeta(metaText);
    if (!metaResult.ok) {
      setClientError(metaResult.message);
      return;
    }

    const response = await kernelRequest<MaterialObject>(materialsPath, {
      method: "POST",
      body: {
        type: trimmedType,
        truthClass,
        evidenceRefs,
        meta: metaResult.value
      }
    });

    setSubmitResponse(response);
    if (response.ok) {
      setType("");
      setEvidenceRefsText("");
      setMetaText("{}");
      await loadMaterials();
    }
  };

  const addRequiredMaterial = async (materialType: string) => {
    setClientError(null);
    const response = await kernelRequest<MaterialObject>(materialsPath, {
      method: "POST",
      body: {
        type: materialType,
        truthClass: "DOC",
        evidenceRefs: [],
        meta: {}
      }
    });

    setSubmitResponse(response);
    if (response.ok) {
      await loadMaterials();
    }
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

  const materialsList = materialsResponse?.ok && materialsResponse.data
    ? materialsResponse.data
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Materials</h1>
        <p className="mt-1 text-sm text-slate-500">Deal ID: {dealId}</p>

        {!materialsResponse && (
          <p className="mt-4 text-sm text-slate-600">Loading materials...</p>
        )}

        {materialsResponse && !materialsResponse.ok && (
          <KernelErrorPanel
            title="Materials fetch failed"
            path={materialsPath}
            response={materialsResponse}
          />
        )}

        {materialsResponse && materialsResponse.ok && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Existing Materials
            </h2>
            {materialsList.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No materials recorded yet.</p>
            ) : (
              <div className="mt-3 grid gap-3">
                {materialsList.map((material) => {
                  const evidenceCount = extractEvidenceRefs(material).length;
                  return (
                    <div
                      key={material.id}
                      className="rounded-md border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">
                          {material.type}
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${truthStyles[material.truthClass as TruthClass]}`}
                        >
                          {material.truthClass}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        Evidence refs: {evidenceCount}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add Required Materials
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            onClick={() => addRequiredMaterial("WireConfirmation")}
          >
            Add WireConfirmation (DOC)
          </button>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            onClick={() => addRequiredMaterial("EntityFormationDocs")}
          >
            Add EntityFormationDocs (DOC)
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Submit Material
        </h2>
        <div className="mt-4 grid gap-4">
          <label className="grid gap-2 text-sm text-slate-700">
            Type
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            Truth Class
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={truthClass}
              onChange={(event) => setTruthClass(event.target.value as TruthClass)}
            >
              <option value="DOC">DOC</option>
              <option value="HUMAN">HUMAN</option>
              <option value="AI">AI</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            Evidence Refs (comma-separated)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={evidenceRefsText}
              onChange={(event) => setEvidenceRefsText(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            Meta JSON
            <textarea
              className="min-h-[120px] rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={metaText}
              onChange={(event) => setMetaText(event.target.value)}
            />
          </label>

          {clientError && <p className="text-sm text-red-600">{clientError}</p>}

          <button
            className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={submit}
          >
            Submit Material
          </button>
        </div>

        {submitResponse &&
          (submitResponse.ok ? (
            <div className="mt-4">
              <p className="text-sm font-semibold text-emerald-700">Submission Accepted</p>
              <pre className="mt-2">{renderRaw(submitResponse.data)}</pre>
            </div>
          ) : (
            <KernelErrorPanel
              title="Submission failed"
              path={materialsPath}
              response={submitResponse}
            />
          ))}
      </section>
    </div>
  );
}

function parseMeta(raw: string): MetaParseResult {
  if (!raw.trim()) {
    return { ok: true, value: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "Meta must be a JSON object." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Meta must be valid JSON." };
  }
}

function extractEvidenceRefs(material: MaterialObject): string[] {
  if (material.data && typeof material.data === "object") {
    const data = material.data as Record<string, unknown>;
    if (Array.isArray(data.evidenceRefs)) {
      return data.evidenceRefs.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
}
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  downloadArtifactUrl,
  listArtifacts,
  uploadArtifact,
  type KernelResponse
} from "@/lib/kernelClient";
import { KernelErrorPanel } from "@/components/KernelErrorPanel";
import type { Artifact } from "@/types";

export default function DealDataRoomPage() {
  const params = useParams();
  const dealId = params?.dealId as string;

  const [artifactsResponse, setArtifactsResponse] = useState<KernelResponse<Artifact[]> | null>(null);
  const [uploadResponse, setUploadResponse] = useState<KernelResponse<Artifact> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const artifactsPath = `/deals/${dealId}/artifacts`;

  const loadArtifacts = useCallback(async () => {
    const response = await listArtifacts<Artifact[]>(dealId);
    setArtifactsResponse(response);
  }, [dealId]);

  useEffect(() => {
    if (dealId) {
      loadArtifacts();
    }
  }, [dealId, loadArtifacts]);

  const artifacts = useMemo(() => {
    if (!artifactsResponse || !artifactsResponse.ok || !artifactsResponse.data) {
      return [];
    }
    return artifactsResponse.data;
  }, [artifactsResponse]);

  const handleUpload = async () => {
    setClientError(null);
    if (!dealId) {
      setClientError("Deal ID is required.");
      return;
    }
    if (!file) {
      setClientError("Select a file to upload.");
      return;
    }
    const response = await uploadArtifact<Artifact>(dealId, file);
    setUploadResponse(response);
    if (response.ok) {
      setFile(null);
      setInputKey((value) => value + 1);
      await loadArtifacts();
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

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Data Room</h1>
        <p className="mt-1 text-sm text-slate-500">Deal ID: {dealId}</p>

        {!artifactsResponse && (
          <p className="mt-4 text-sm text-slate-600">Loading artifacts...</p>
        )}

        {artifactsResponse && !artifactsResponse.ok && (
          <KernelErrorPanel
            title="Artifacts fetch failed"
            path={artifactsPath}
            response={artifactsResponse}
          />
        )}

        {artifactsResponse && artifactsResponse.ok && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Artifacts
            </h2>
            {artifacts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No artifacts uploaded yet.</p>
            ) : (
              <div className="mt-3 grid gap-3">
                {artifacts.map((artifact) => (
                  <div
                    key={artifact.artifactId}
                    className="rounded-md border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {artifact.filename}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      SHA-256: {artifact.sha256Hex.slice(0, 12)}...
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Created: {formatDate(artifact.createdAt)}
                    </div>
                    <a
                      className="mt-2 inline-flex text-xs font-medium text-slate-900 underline"
                      href={downloadArtifactUrl(dealId, artifact.artifactId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Upload Artifact
        </h2>
        <div className="mt-4 grid gap-4">
          <input
            key={inputKey}
            type="file"
            className="text-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {clientError && <p className="text-sm text-red-600">{clientError}</p>}
          <button
            className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={handleUpload}
          >
            Upload
          </button>
        </div>

        {uploadResponse &&
          (uploadResponse.ok ? (
            <div className="mt-4">
              <p className="text-sm font-semibold text-emerald-700">Upload accepted</p>
              <pre className="mt-2">{renderRaw(uploadResponse.data)}</pre>
            </div>
          ) : (
            <KernelErrorPanel
              title="Upload failed"
              path={artifactsPath}
              response={uploadResponse}
            />
          ))}
      </section>
    </div>
  );
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

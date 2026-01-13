import { kernelBaseUrl, type KernelResponse } from "@/lib/kernelClient";

export function KernelErrorPanel({
  title,
  path,
  response
}: {
  title: string;
  path: string;
  response: KernelResponse<unknown>;
}) {
  const message = resolveMessage(response.data);

  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{title}</p>
      <div className="mt-2 grid gap-1 text-xs text-amber-900">
        <div>
          <span className="font-semibold">baseUrl:</span> {kernelBaseUrl}
        </div>
        <div>
          <span className="font-semibold">path:</span> {path}
        </div>
        <div>
          <span className="font-semibold">status:</span> {response.status}
        </div>
        {message && (
          <div>
            <span className="font-semibold">message:</span> {message}
          </div>
        )}
      </div>
      {response.data !== null && response.data !== undefined && (
        <pre className="mt-3 bg-white text-xs text-amber-900">
          {renderRaw(response.data)}
        </pre>
      )}
    </div>
  );
}

function resolveMessage(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
  }
  return null;
}

function renderRaw(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}
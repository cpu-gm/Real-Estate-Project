export type KernelResponse<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

const rawBaseUrl = process.env.NEXT_PUBLIC_KERNEL_API_URL ?? "http://localhost:3001";
export const kernelBaseUrl = rawBaseUrl.replace(/\/+$/, "");

type NetworkErrorPayload = {
  error: "NETWORK_ERROR";
  message: string;
  baseUrl: string;
  path: string;
};

export async function kernelRequest<T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<KernelResponse<T>> {
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    ...(options?.headers ?? {})
  };

  let body: string | undefined;
  if (options?.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(`${kernelBaseUrl}${path}`, {
      method,
      headers,
      body
    });

    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = text as unknown as T;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (err) {
    const errorPayload: NetworkErrorPayload = {
      error: "NETWORK_ERROR",
      message: String(err),
      baseUrl: kernelBaseUrl,
      path
    };
    return {
      ok: false,
      status: 0,
      data: errorPayload as unknown as T
    };
  }
}

export async function getSnapshot<T>(
  dealId: string,
  at?: string
): Promise<KernelResponse<T>> {
  const query = at ? `?at=${encodeURIComponent(at)}` : "";
  return kernelRequest<T>(`/deals/${dealId}/snapshot${query}`);
}

export async function explainAt<T>(
  dealId: string,
  at: string | undefined,
  body: unknown
): Promise<KernelResponse<T>> {
  const query = at ? `?at=${encodeURIComponent(at)}` : "";
  return kernelRequest<T>(`/deals/${dealId}/explain${query}`, {
    method: "POST",
    body
  });
}

export async function listEvents<T>(
  dealId: string
): Promise<KernelResponse<T>> {
  return kernelRequest<T>(`/deals/${dealId}/events`);
}

export async function getDeal<T>(
  dealId: string
): Promise<KernelResponse<T>> {
  return kernelRequest<T>(`/deals/${dealId}`);
}

export async function createDeal<T>(
  payload: { name: string }
): Promise<KernelResponse<T>> {
  return kernelRequest<T>("/deals", {
    method: "POST",
    body: payload
  });
}

export async function listActors<T>(
  dealId: string
): Promise<KernelResponse<T>> {
  return kernelRequest<T>(`/deals/${dealId}/actors`);
}

export async function createActor<T>(
  dealId: string,
  payload: { name: string; type: "HUMAN" | "SYSTEM"; role: string }
): Promise<KernelResponse<T>> {
  return kernelRequest<T>(`/deals/${dealId}/actors`, {
    method: "POST",
    body: payload
  });
}

export async function listMaterials<T>(
  dealId: string
): Promise<KernelResponse<T>> {
  return kernelRequest<T>(`/deals/${dealId}/materials`);
}

export async function createMaterial<T>(
  dealId: string,
  payload: {
    type: string;
    truthClass: "DOC" | "HUMAN" | "AI";
    evidenceRefs?: string[];
    meta?: Record<string, unknown>;
  }
): Promise<KernelResponse<T>> {
  return kernelRequest<T>(`/deals/${dealId}/materials`, {
    method: "POST",
    body: payload
  });
}

export async function postEvent<T>(
  dealId: string,
  payload: {
    type: string;
    actorId: string;
    payload: Record<string, unknown>;
    authorityContext: Record<string, unknown>;
    evidenceRefs: string[];
  }
): Promise<KernelResponse<T>> {
  return kernelRequest<T>(`/deals/${dealId}/events`, {
    method: "POST",
    body: payload
  });
}

export async function listArtifacts<T>(
  dealId: string
): Promise<KernelResponse<T>> {
  return kernelRequest<T>(`/deals/${dealId}/artifacts`);
}

export async function uploadArtifact<T>(
  dealId: string,
  file: File,
  uploaderId?: string
): Promise<KernelResponse<T>> {
  const path = `/deals/${dealId}/artifacts`;
  const formData = new FormData();
  formData.append("file", file);
  if (uploaderId) {
    formData.append("uploaderId", uploaderId);
  }

  try {
    const response = await fetch(`${kernelBaseUrl}${path}`, {
      method: "POST",
      body: formData
    });

    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = text as unknown as T;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (err) {
    const errorPayload: NetworkErrorPayload = {
      error: "NETWORK_ERROR",
      message: String(err),
      baseUrl: kernelBaseUrl,
      path
    };
    return {
      ok: false,
      status: 0,
      data: errorPayload as unknown as T
    };
  }
}

export function downloadArtifactUrl(dealId: string, artifactId: string): string {
  return `${kernelBaseUrl}/deals/${dealId}/artifacts/${artifactId}/download`;
}

export function exportProofPackUrl(dealId: string, atIso?: string): string {
  const query = atIso ? `?at=${encodeURIComponent(atIso)}` : "";
  return `${kernelBaseUrl}/deals/${dealId}/proofpack${query}`;
}

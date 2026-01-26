import { Readable } from "node:stream";
import { circuitBreakers, withCircuitBreaker } from "./lib/circuit-breaker.js";
import { withRetry, isRetryableError, retryProfiles } from "./lib/retry.js";
import { createLogger, logExternalCall } from "./lib/logger.js";
import { recordError } from "./lib/metrics.js";

const log = createLogger('kernel');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*"
};

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

// Legacy structured logging helper (kept for backwards compatibility)
function legacyLog(level, category, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level}] [${category}] ${message}${metaStr}`);
}

function filterHeaders(input) {
  const headers = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  return headers;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Make a request to the Kernel API with circuit breaker and retry protection
 * @param {string} url - Full URL to the Kernel endpoint
 * @param {Object} options - Fetch options
 * @param {Object} options.req - Express request object (for request ID propagation)
 * @param {string} options.requestId - Explicit request ID (alternative to options.req)
 * @returns {Promise<{ok: boolean, status: number, data: any, headers: Headers}>}
 */
export async function kernelRequest(url, options = {}) {
  const method = options.method || 'GET';
  const startTime = Date.now();

  // SPRINT 1: Extract request ID from Express request for end-to-end correlation
  const requestId = options.req?.requestId || options.requestId || 'no-request-id';

  // Extract path from URL for cleaner logging
  const urlPath = url.replace(/^https?:\/\/[^/]+/, '');
  log.debug(`Kernel request started`, { method, path: urlPath, requestId });

  const headers = filterHeaders(options.headers ?? {});
  if (!headers["Content-Type"] && options.body) {
    headers["Content-Type"] = "application/json";
  }

  // SPRINT 1: Propagate request ID to Kernel for distributed tracing
  headers["X-Request-ID"] = requestId;

  // Execute with circuit breaker and retry
  return withCircuitBreaker(
    circuitBreakers.kernel,
    async () => {
      return withRetry(
        async () => {
          let response;
          try {
            response = await fetch(url, {
              ...options,
              headers
            });
          } catch (error) {
            const duration = Date.now() - startTime;
            log.error(`Kernel request failed`, {
              method,
              path: urlPath,
              durationMs: duration,
              error: error.message,
              code: error.code || 'UNKNOWN'
            });
            logExternalCall('kernel', urlPath, duration, 0, { method, error: error.message });
            recordError('KERNEL_UNAVAILABLE', urlPath);

            const kernelError = new Error("Kernel unavailable");
            kernelError.type = "KERNEL_UNAVAILABLE";
            kernelError.code = error.code || 'ECONNREFUSED';
            kernelError.cause = error;
            throw kernelError;
          }

          const data = await parseResponseBody(response);
          const duration = Date.now() - startTime;

          // Log the external call
          logExternalCall('kernel', urlPath, duration, response.status, { method });

          if (response.ok) {
            log.debug(`Kernel request completed`, {
              method,
              path: urlPath,
              status: response.status,
              durationMs: duration
            });
          } else {
            log.warn(`Kernel request returned error`, {
              method,
              path: urlPath,
              status: response.status,
              durationMs: duration,
              error: typeof data === 'object' ? data?.message || data?.error : data
            });

            // Don't retry client errors (4xx except 429)
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              const error = new Error(`Kernel error ${response.status}`);
              error.status = response.status;
              error.data = data;
              throw error; // Will not be retried
            }

            // Server errors (5xx) and rate limits (429) will be retried
            if (response.status >= 500 || response.status === 429) {
              const error = new Error(`Kernel error ${response.status}`);
              error.status = response.status;
              error.data = data;
              throw error; // Will be retried
            }
          }

          return {
            ok: response.ok,
            status: response.status,
            data,
            headers: response.headers
          };
        },
        {
          ...retryProfiles.kernel,
          onRetry: (error, attempt) => {
            log.warn(`Retrying kernel request`, {
              method,
              path: urlPath,
              attempt,
              error: error.message
            });
          }
        }
      );
    },
    // Fallback when circuit is open
    () => {
      const duration = Date.now() - startTime;
      log.error(`Kernel circuit open - request rejected`, { method, path: urlPath });
      logExternalCall('kernel', urlPath, duration, 0, { method, circuitOpen: true });
      recordError('CIRCUIT_OPEN', urlPath);

      const error = new Error("Kernel service unavailable (circuit open)");
      error.type = "KERNEL_UNAVAILABLE";
      error.code = "CIRCUIT_OPEN";
      throw error;
    }
  );
}

export async function kernelFetchJson(url, options = {}) {
  const result = await kernelRequest(url, options);
  if (!result.ok) {
    const error = new Error(`Kernel error ${result.status}`);
    error.status = result.status;
    error.data = result.data;
    throw error;
  }
  return result.data;
}

export async function proxyKernelStream(req, res, targetUrl, options = {}) {
  const startTime = Date.now();
  const urlPath = targetUrl.replace(/^https?:\/\/[^/]+/, '');

  // SPRINT 1: Extract request ID for correlation
  const requestId = req.requestId || 'no-request-id';
  log.debug(`Kernel proxy started`, { method: req.method, path: urlPath, requestId });

  // Check circuit breaker before attempting
  if (!circuitBreakers.kernel.canExecute()) {
    const duration = Date.now() - startTime;
    log.error(`Kernel proxy rejected - circuit open`, { method: req.method, path: urlPath, requestId });
    logExternalCall('kernel', urlPath, duration, 502, { method: req.method, circuitOpen: true });
    recordError('CIRCUIT_OPEN', urlPath);

    res.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
      "X-Request-ID": requestId,
      ...corsHeaders
    });
    res.end(JSON.stringify({ message: "Kernel service unavailable" }));
    return;
  }

  const headers = filterHeaders(req.headers);
  delete headers.host;

  // SPRINT 1: Propagate request ID to Kernel
  headers["X-Request-ID"] = requestId;

  let response;
  try {
    response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
      duplex: "half"
    });

    // Record success with circuit breaker
    circuitBreakers.kernel.recordSuccess();
  } catch (error) {
    // Record failure with circuit breaker
    circuitBreakers.kernel.recordFailure();

    const duration = Date.now() - startTime;
    log.error(`Kernel proxy failed`, {
      method: req.method,
      path: urlPath,
      durationMs: duration,
      error: error.message,
      code: error.code || 'UNKNOWN'
    });
    logExternalCall('kernel', urlPath, duration, 502, { method: req.method, error: error.message });
    recordError('KERNEL_UNAVAILABLE', urlPath);

    res.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    });
    res.end(JSON.stringify({ message: "Kernel unavailable" }));
    return;
  }

  const status = response.status;
  const duration = Date.now() - startTime;
  log.info(`Kernel proxy completed`, { method: req.method, path: urlPath, status, durationMs: duration });
  logExternalCall('kernel', urlPath, duration, status, { method: req.method });

  const responseHeaders = {};
  for (const [key, value] of response.headers.entries()) {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      responseHeaders[key] = value;
    }
  }

  res.writeHead(response.status, {
    ...responseHeaders,
    "X-Request-ID": requestId,
    ...corsHeaders
  });

  if (typeof options.onComplete === "function") {
    res.on("finish", () => {
      options.onComplete(status);
    });
  }

  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
}

/**
 * Creates or updates a kernel material with DOC truthClass.
 * If material exists, adds artifactId to evidenceRefs and upgrades truthClass to DOC.
 * If material doesn't exist, creates it with DOC truthClass.
 *
 * @param {string} kernelBaseUrl - Base URL for kernel API
 * @param {string} dealId - Deal UUID
 * @param {string} materialType - Material type (e.g., "UnderwritingSummary")
 * @param {string} artifactId - Artifact UUID to link
 * @param {string} fieldPath - Original field path for audit trail
 * @returns {Promise<Object>} Created or updated material
 */
export async function createOrUpdateMaterial(
  kernelBaseUrl,
  dealId,
  materialType,
  artifactId,
  fieldPath
) {
  // 1. Fetch existing materials
  const materials = await kernelFetchJson(
    `${kernelBaseUrl}/deals/${dealId}/materials`
  );

  // 2. Find material of this type
  const existing = materials.find((m) => m.type === materialType);

  if (existing) {
    // 3. Update existing material
    // - Add artifactId to evidenceRefs (avoid duplicates)
    // - Upgrade truthClass to DOC
    const currentRefs = existing.data?.evidenceRefs ?? [];
    const updatedRefs = currentRefs.includes(artifactId)
      ? currentRefs
      : [...currentRefs, artifactId];

    const updated = await kernelFetchJson(
      `${kernelBaseUrl}/deals/${dealId}/materials/${existing.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          truthClass: "DOC",
          evidenceRefs: updatedRefs,
          meta: {
            ...existing.data?.meta,
            updatedBy: "provenance-sync",
            lastSyncedField: fieldPath,
            lastSyncedAt: new Date().toISOString()
          }
        })
      }
    );

    return { action: "updated", material: updated };
  } else {
    // 4. Create new material
    const created = await kernelFetchJson(
      `${kernelBaseUrl}/deals/${dealId}/materials`,
      {
        method: "POST",
        body: JSON.stringify({
          type: materialType,
          truthClass: "DOC",
          evidenceRefs: [artifactId],
          meta: {
            createdBy: "provenance-sync",
            sourceFieldPath: fieldPath,
            createdAt: new Date().toISOString()
          }
        })
      }
    );

    return { action: "created", material: created };
  }
}

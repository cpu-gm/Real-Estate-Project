import { z } from "zod";
import {
  actionResponseSchema,
  dealSchema,
  dealHomeResponseSchema,
  dealListResponseSchema,
  dealRecordsResponseSchema,
  eventsResponseSchema,
  explainBlockSchema,
  explainResponseSchema,
  llmParseDealResponseSchema,
  llmForceAcceptRequestSchema,
  correctionsRequestSchema,
  dataTrustResponseSchema,
  inboxResponseSchema
} from "@/lib/contracts";
import { createApiError, ErrorCode } from "@/lib/api-error";
import { debugLog } from "@/lib/debug";
import {
  ClaimVerifyRequest,
  ConflictResolveRequest,
  DealDraft,
  DealDraftListResponse,
  DocumentMetadata,
  IntakeBroker,
  IntakeClaimVerificationResponse,
  IntakeClaimsResponse,
  IntakeConflict,
  IntakeConflictsResponse,
  IntakeDocumentsUploadResponse,
  IntakePasteResult,
  IntakeSeller,
  IntakeStatsResponse
} from "@/lib/contracts/intake";
import {
  OMGenerateRequest,
  OMRequestChangesRequest,
  OMSectionsResponse,
  OMUpdateSectionRequest,
  OMVersion,
  OMVersionListResponse
} from "@/lib/contracts/om";
import {
  AddRecipientsRequest,
  AddRecipientsResponse,
  BuyerResponse as DistributionBuyerResponse,
  CreateDistributionRequest,
  CreateDistributionResponse,
  DealDistribution,
  DistributionListResponse,
  DistributionRecipient,
  DistributionResponsesResponse,
  RecordViewRequest
} from "@/lib/contracts/distribution";
import {
  BuyerAnonymity,
  BuyerCriteria,
  BuyerCriteriaRequest,
  BuyerDealResponse,
  BuyerInboxResponse,
  BuyerTriageResult
} from "@/lib/contracts/buyer";
import {
  BuyerAuthorization,
  GateAuthorizationResponse,
  GateAuthorizeRequest,
  GateDeclineRequest,
  GateGrantAccessRequest,
  GateProgress,
  GateRecordNDASignedRequest,
  GateReviewQueueResponse,
  GateRevokeRequest
} from "@/lib/contracts/gate";

const API_BASE = "/api";

// Error reporting for dev overlay
let reportApiError = null;
if (import.meta.env.DEV) {
  import('@/components/dev/ApiErrorOverlay').then(module => {
    reportApiError = module.reportApiError;
  }).catch(() => {});
}

// Get auth token from localStorage (set by AuthContext)
function getAuthToken() {
  return localStorage.getItem('auth_token');
}

async function requestJson(path, options = {}) {
  const authToken = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers ?? {})
  };

  // Add Authorization header if auth token is available
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const fullUrl = `${API_BASE}${path}`;
  debugLog("bff", `[BFF Request] ${options.method || 'GET'} ${fullUrl}`, { hasAuth: !!authToken });

  const response = await fetch(fullUrl, {
    headers,
    ...options
  });

  debugLog("bff", `[BFF Response] ${response.status} ${response.statusText}`, { url: fullUrl });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    // Parse new standardized error format: { error: { code, message, details, suggestion, field }, timestamp, requestId }
    const errorPayload = data?.error || {};
    const errorCode = errorPayload.code || (response.status === 401 ? ErrorCode.AUTH_REQUIRED : ErrorCode.INTERNAL_ERROR);
    const errorMessage = errorPayload.message || data?.message || data?.error || `Request failed (${response.status})`;
    const suggestion = errorPayload.suggestion || null;
    const field = errorPayload.field || null;
    const details = errorPayload.details || data?.details || null;
    const requestId = data?.requestId || response.headers.get('X-Request-Id') || null;

    debugLog("bff", "Request failed", {
      method: options.method || "GET",
      path,
      status: response.status,
      code: errorCode,
      message: errorMessage,
      requestId
    });

    // Create structured ApiError
    const error = createApiError({
      message: errorMessage,
      status: response.status,
      endpoint: path,
      code: errorCode,
      suggestion,
      field,
      details,
      debugDetails: { requestId, rawResponse: data }
    });

    // Report to dev overlay
    if (reportApiError) {
      reportApiError({
        method: options.method || 'GET',
        path,
        status: response.status,
        code: errorCode,
        message: errorMessage,
        details,
        suggestion,
        requestId
      });
    }

    throw error;
  }

  return data;
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function parseWithSchema(schema, data, context = {}) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const debugDetails = {
    schema: context.schemaName || schema?._def?.typeName || "schema",
    issues: result.error.issues
  };

  debugLog("bff", "Contract mismatch", {
    endpoint: context.endpoint,
    schema: debugDetails.schema,
    issueCount: debugDetails.issues?.length ?? 0
  });

  const apiError = createApiError({
    message: "Contract mismatch",
    status: 502,
    endpoint: context.endpoint,
    code: "CONTRACT_MISMATCH",
    userSafeMessage: "We ran into a data issue. Please try again.",
    debugDetails
  });

  if (reportApiError) {
    reportApiError({
      method: context.method || "GET",
      path: context.endpoint || "unknown",
      status: apiError.status,
      message: apiError.message,
      details: debugDetails
    });
  }

  throw apiError;
}

export const bff = {
  home: {
    getData: async () => {
      const data = await requestJson("/home");
      return data;
    }
  },
  // Organization users (for UserPicker and bulk operations)
  users: {
    list: async (search = '', role = '') => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/users${query}`);
      return data.users || [];
    },
    recent: async () => {
      const data = await requestJson('/users/recent');
      return data.users || [];
    }
  },
  // Bulk operations
  bulk: {
    assignDeals: async (dealIds, userId, userName, role = 'analyst') => {
      const data = await requestJson('/deals/bulk/assign', {
        method: 'POST',
        body: JSON.stringify({ dealIds, userId, userName, role })
      });
      return data;
    }
  },
  newsInsights: {
    list: async (dealId = null) => {
      const params = dealId ? `?dealId=${encodeURIComponent(dealId)}` : '';
      const data = await requestJson(`/news-insights${params}`);
      return data;
    },
    ask: async (insightId, question) => {
      const data = await requestJson("/news-insights/ask", {
        method: "POST",
        body: JSON.stringify({ insightId, question })
      });
      return data;
    },
    dismiss: async (insightId) => {
      const data = await requestJson(`/news-insights/${insightId}/dismiss`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    }
  },
  deals: {
    list: async () => {
      const path = "/deals";
      const data = await requestJson(path);
      return parseWithSchema(dealListResponseSchema, data, {
        endpoint: path,
        method: "GET",
        schemaName: "dealListResponse"
      });
    },
    create: async (payload) => {
      const path = "/deals";
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(dealSchema, data, {
        endpoint: path,
        method: "POST",
        schemaName: "deal"
      });
    },
    corrections: async (dealId, payload) => {
      const body = correctionsRequestSchema.parse(payload);
      const data = await requestJson(`/deals/${dealId}/corrections`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      return data;
    },
    dataTrust: async (dealId) => {
      const path = `/deals/${dealId}/data-trust`;
      const data = await requestJson(path);
      return parseWithSchema(dataTrustResponseSchema, data, {
        endpoint: path,
        method: "GET",
        schemaName: "dataTrustResponse"
      });
    },
    markDoc: async (dealId, fieldPath, artifactId) => {
      const data = await requestJson(`/deals/${dealId}/provenance`, {
        method: "POST",
        body: JSON.stringify({ fieldPath, artifactId })
      });
      return data;
    },
    home: async (dealId) => {
      const path = `/deals/${dealId}/home`;
      const data = await requestJson(path);
      return parseWithSchema(dealHomeResponseSchema, data, {
        endpoint: path,
        method: "GET",
        schemaName: "dealHomeResponse"
      });
    },
    records: async (dealId) => {
      const path = `/deals/${dealId}/records`;
      const data = await requestJson(path);
      return parseWithSchema(dealRecordsResponseSchema, data, {
        endpoint: path,
        method: "GET",
        schemaName: "dealRecordsResponse"
      });
    },
    explain: async (dealId, actionType, payload = {}) => {
      const path = `/deals/${dealId}/explain`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ actionType, payload })
      });
      return parseWithSchema(explainResponseSchema, data, {
        endpoint: path,
        method: "POST",
        schemaName: "explainResponse"
      });
    },
    action: async (dealId, actionType) => {
      try {
        const path = `/deals/${dealId}/actions/${actionType}`;
        const data = await requestJson(path, {
          method: "POST",
          body: JSON.stringify({})
        });
        return parseWithSchema(actionResponseSchema, data, {
          endpoint: path,
          method: "POST",
          schemaName: "actionResponse"
        });
      } catch (error) {
        if (error.status === 409 && error.data?.explain) {
          const explain = parseWithSchema(explainBlockSchema, error.data.explain, {
            endpoint: `/deals/${dealId}/actions/${actionType}`,
            method: "POST",
            schemaName: "explainBlock"
          });
          const blocked = new Error("BLOCKED");
          blocked.status = 409;
          blocked.explain = explain;
          throw blocked;
        }
        throw error;
      }
    },
    override: async (dealId, targetAction, reason) => {
      const data = await requestJson(`/deals/${dealId}/events`, {
        method: "POST",
        body: JSON.stringify({
          type: "OverrideAttested",
          payload: {
            action: targetAction,
            reason: reason
          }
        })
      });
      return data;
    },
    draft: {
      start: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/draft/start`, {
          method: "POST",
          body: JSON.stringify({})
        });
        return data;
      },
      simulateEvent: async (dealId, eventData) => {
        const data = await requestJson(`/deals/${dealId}/draft/simulate-event`, {
          method: "POST",
          body: JSON.stringify(eventData)
        });
        return data;
      },
      gates: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/draft/gates`);
        return data;
      },
      diff: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/draft/diff`);
        return data;
      },
      revert: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/draft/revert`, {
          method: "POST",
          body: JSON.stringify({})
        });
        return data;
      },
      commit: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/draft/commit`, {
          method: "POST",
          body: JSON.stringify({})
        });
        return data;
      }
    },
    // Deal Assignments (GP Analyst access control)
    assignments: {
      list: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/assignments`);
        return data;
      },
      assign: async (dealId, userId, userName, role = 'analyst') => {
        const data = await requestJson(`/deals/${dealId}/assignments`, {
          method: "POST",
          body: JSON.stringify({ userId, userName, role })
        });
        return data;
      },
      unassign: async (dealId, userId) => {
        const data = await requestJson(`/deals/${dealId}/assignments/${userId}`, {
          method: "DELETE"
        });
        return data;
      }
    },
    // Review Requests (Analyst → GP approval workflow)
    reviewRequests: {
      // Create a new review request for a deal
      create: async (dealId, message = null) => {
        const data = await requestJson(`/deals/${dealId}/review-requests`, {
          method: "POST",
          body: JSON.stringify({ message })
        });
        return data;
      },
      // Get pending review for a deal (if any)
      getPending: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/review-requests/pending`);
        return data;
      },
      // Get all review history for a deal
      getHistory: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/review-requests`);
        return data;
      }
    },
    // Deal Submissions (GP → Lender workflow)
    submissions: {
      // Submit deal to external party (Lender, Counsel)
      create: async (dealId, { recipientEmail, recipientName, recipientRole, message }) => {
        const data = await requestJson(`/deals/${dealId}/submit`, {
          method: "POST",
          body: JSON.stringify({ recipientEmail, recipientName, recipientRole, message })
        });
        return data;
      },
      // List submissions for a deal
      list: async (dealId) => {
        const data = await requestJson(`/deals/${dealId}/submissions`);
        return data;
      },
      // Get a single submission
      get: async (submissionId) => {
        const data = await requestJson(`/submissions/${submissionId}`);
        return data;
      },
      // Resend submission magic link
      resend: async (submissionId) => {
        const data = await requestJson(`/submissions/${submissionId}/resend`, {
          method: "POST",
          body: JSON.stringify({})
        });
        return data;
      },
      // Cancel a submission
      cancel: async (submissionId) => {
        const data = await requestJson(`/submissions/${submissionId}/cancel`, {
          method: "POST",
          body: JSON.stringify({})
        });
        return data;
      }
    }
  },
  dealIntake: {
    createDraft: async (payload) => {
      const path = "/intake/draft";
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(DealDraft, data, {
        endpoint: path,
        method: "POST",
        schemaName: "DealDraft"
      });
    },
    listDrafts: async (params = {}) => {
      const path = `/intake/drafts${buildQuery(params)}`;
      const data = await requestJson(path);
      return parseWithSchema(DealDraftListResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "DealDraftListResponse"
      });
    },
    getDraft: async (id) => {
      const path = `/intake/draft/${id}`;
      const data = await requestJson(path);
      return parseWithSchema(DealDraft, data, {
        endpoint: path,
        method: "GET",
        schemaName: "DealDraft"
      });
    },
    uploadDocuments: async (id, documents) => {
      z.array(DocumentMetadata).parse(documents);
      const path = `/intake/draft/${id}/documents`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ documents })
      });
      return parseWithSchema(IntakeDocumentsUploadResponse, data, {
        endpoint: path,
        method: "POST",
        schemaName: "IntakeDocumentsUploadResponse"
      });
    },
    pasteText: async (id, text, sourceName = null) => {
      const path = `/intake/draft/${id}/paste`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ text, sourceName })
      });
      return parseWithSchema(IntakePasteResult, data, {
        endpoint: path,
        method: "POST",
        schemaName: "IntakePasteResult"
      });
    },
    addBroker: async (id, broker) => {
      const path = `/intake/draft/${id}/brokers`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(broker)
      });
      return parseWithSchema(IntakeBroker, data, {
        endpoint: path,
        method: "POST",
        schemaName: "IntakeBroker"
      });
    },
    setSeller: async (id, seller) => {
      const path = `/intake/draft/${id}/seller`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(seller)
      });
      return parseWithSchema(IntakeSeller, data, {
        endpoint: path,
        method: "POST",
        schemaName: "IntakeSeller"
      });
    },
    getClaims: async (id, params = {}) => {
      const path = `/intake/draft/${id}/claims${buildQuery(params)}`;
      const data = await requestJson(path);
      return parseWithSchema(IntakeClaimsResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "IntakeClaimsResponse"
      });
    },
    verifyClaim: async (draftId, claimId, payload) => {
      ClaimVerifyRequest.parse(payload);
      const path = `/intake/draft/${draftId}/claims/${claimId}/verify`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(IntakeClaimVerificationResponse, data, {
        endpoint: path,
        method: "POST",
        schemaName: "IntakeClaimVerificationResponse"
      });
    },
    getConflicts: async (id, status = "OPEN") => {
      const path = `/intake/draft/${id}/conflicts${buildQuery({ status })}`;
      const data = await requestJson(path);
      return parseWithSchema(IntakeConflictsResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "IntakeConflictsResponse"
      });
    },
    resolveConflict: async (draftId, conflictId, payload) => {
      ConflictResolveRequest.parse(payload);
      const path = `/intake/draft/${draftId}/conflicts/${conflictId}/resolve`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(IntakeConflict, data, {
        endpoint: path,
        method: "POST",
        schemaName: "IntakeConflict"
      });
    },
    advanceStatus: async (id, status) => {
      const path = `/intake/draft/${id}/advance`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      return parseWithSchema(DealDraft, data, {
        endpoint: path,
        method: "POST",
        schemaName: "DealDraft"
      });
    },
    getStats: async (id) => {
      const path = `/intake/draft/${id}/stats`;
      const data = await requestJson(path);
      return parseWithSchema(IntakeStatsResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "IntakeStatsResponse"
      });
    },
    convertToDeal: async (id, winningBuyerUserId, notes = null) => {
      const path = `/intake/draft/${id}/convert`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ winningBuyerUserId, notes })
      });
      // Returns { success, kernelDealId, draftId, message }
      return data;
    },
    // Listing workflow methods
    updateDraft: async (id, payload) => {
      const path = `/intake/draft/${id}`;
      const data = await requestJson(path, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      return data;
    },
    createListing: async (id, payload) => {
      const path = `/intake/draft/${id}/listing`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      // Returns { draft, brokerInvitation, message }
      return data;
    },
    getListing: async (id) => {
      const path = `/intake/draft/${id}/listing`;
      const data = await requestJson(path);
      return data;
    },
    cancelListing: async (id) => {
      const path = `/intake/draft/${id}/listing`;
      const data = await requestJson(path, {
        method: "DELETE"
      });
      return data;
    },
    // Access control
    checkAccess: async (id) => {
      const path = `/intake/draft/${id}/access`;
      const data = await requestJson(path);
      // Returns { relation, permissions, invitation }
      return data;
    }
  },
  // Broker invitation management
  brokerInvitations: {
    list: async () => {
      const path = `/intake/invitations`;
      const data = await requestJson(path);
      // Returns { invitations: [...] }
      return data;
    },
    accept: async (invitationId) => {
      const path = `/intake/invitation/${invitationId}/accept`;
      const data = await requestJson(path, {
        method: "POST"
      });
      // Returns { success, message, dealDraftId }
      return data;
    },
    decline: async (invitationId) => {
      const path = `/intake/invitation/${invitationId}/decline`;
      const data = await requestJson(path, {
        method: "POST"
      });
      // Returns { success, message }
      return data;
    },
    // Commission negotiation methods
    getNegotiations: async (invitationId) => {
      const path = `/intake/invitation/${invitationId}/negotiations`;
      const data = await requestJson(path);
      // Returns { negotiations, invitationStatus, negotiationStatus, sellerTerms }
      return data;
    },
    counterOffer: async (invitationId, terms) => {
      const path = `/intake/invitation/${invitationId}/counter-offer`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(terms)
      });
      // Returns { success, negotiation, round, warning }
      return data;
    },
    acceptNegotiation: async (negotiationId) => {
      const path = `/intake/negotiation/${negotiationId}/accept`;
      const data = await requestJson(path, {
        method: "POST"
      });
      // Returns { success, message, agreedTerms }
      return data;
    },
    negotiateLater: async (invitationId) => {
      const path = `/intake/invitation/${invitationId}/negotiate-later`;
      const data = await requestJson(path, {
        method: "POST"
      });
      // Returns { success, message }
      return data;
    }
  },
  // Listing configuration methods
  listingConfig: {
    get: async (dealDraftId) => {
      const path = `/intake/draft/${dealDraftId}/listing-config`;
      const data = await requestJson(path);
      // Returns { config }
      return data;
    },
    save: async (dealDraftId, config) => {
      const path = `/intake/draft/${dealDraftId}/listing-config`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(config)
      });
      // Returns { config, message }
      return data;
    }
  },
  // Listing agreement methods
  listingAgreement: {
    confirm: async (dealDraftId, agreementId, role) => {
      const path = `/intake/draft/${dealDraftId}/agreement/confirm`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ agreementId, role })
      });
      // Returns { success, agreement, bothConfirmed, message }
      return data;
    }
  },
  // Broker dashboard methods
  broker: {
    getDashboard: async () => {
      const path = `/broker/dashboard`;
      const data = await requestJson(path);
      // Returns { summary, listings, aggregateFunnel }
      return data;
    },
    getActivity: async (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      const path = `/broker/activity${queryString ? `?${queryString}` : ''}`;
      const data = await requestJson(path);
      // Returns { activities }
      return data;
    },
    getUnreadCount: async () => {
      const path = `/broker/unread-count`;
      const data = await requestJson(path);
      // Returns { count }
      return data;
    },
    getNewInquiries: async (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      const path = `/broker/new-inquiries${queryString ? `?${queryString}` : ''}`;
      const data = await requestJson(path);
      // Returns { count, inquiries }
      return data;
    },
    getListingInquiries: async (dealDraftId) => {
      const path = `/broker/listings/${dealDraftId}/inquiries`;
      const data = await requestJson(path);
      // Returns { inquiries }
      return data;
    },
    getInquiryThread: async (dealDraftId, buyerUserId) => {
      const path = `/broker/inquiry/${dealDraftId}/${buyerUserId}/thread`;
      const data = await requestJson(path);
      // Returns { conversationId, isNew }
      return data;
    }
  },
  om: {
    generate: async (dealDraftId, regenerate = false) => {
      OMGenerateRequest.parse({ regenerate });
      const path = `/om/draft/${dealDraftId}/generate`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ regenerate })
      });
      return parseWithSchema(OMVersion, data, {
        endpoint: path,
        method: "POST",
        schemaName: "OMVersion"
      });
    },
    getLatest: async (dealDraftId) => {
      const path = `/om/draft/${dealDraftId}/latest`;
      const data = await requestJson(path);
      return parseWithSchema(OMVersion, data, {
        endpoint: path,
        method: "GET",
        schemaName: "OMVersion"
      });
    },
    listVersions: async (dealDraftId) => {
      const path = `/om/draft/${dealDraftId}/versions`;
      const data = await requestJson(path);
      return parseWithSchema(OMVersionListResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "OMVersionListResponse"
      });
    },
    getVersion: async (omVersionId) => {
      const path = `/om/version/${omVersionId}`;
      const data = await requestJson(path);
      return parseWithSchema(OMVersion, data, {
        endpoint: path,
        method: "GET",
        schemaName: "OMVersion"
      });
    },
    updateSection: async (omVersionId, sectionId, content) => {
      OMUpdateSectionRequest.parse({ content });
      const path = `/om/version/${omVersionId}/section/${sectionId}`;
      const data = await requestJson(path, {
        method: "PUT",
        body: JSON.stringify({ content })
      });
      return parseWithSchema(OMVersion, data, {
        endpoint: path,
        method: "PUT",
        schemaName: "OMVersion"
      });
    },
    brokerApprove: async (omVersionId) => {
      const path = `/om/version/${omVersionId}/broker-approve`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({})
      });
      return parseWithSchema(OMVersion, data, {
        endpoint: path,
        method: "POST",
        schemaName: "OMVersion"
      });
    },
    sellerApprove: async (omVersionId) => {
      const path = `/om/version/${omVersionId}/seller-approve`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({})
      });
      return parseWithSchema(OMVersion, data, {
        endpoint: path,
        method: "POST",
        schemaName: "OMVersion"
      });
    },
    requestChanges: async (omVersionId, feedback) => {
      OMRequestChangesRequest.parse({ feedback });
      const path = `/om/version/${omVersionId}/request-changes`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ feedback })
      });
      return parseWithSchema(OMVersion, data, {
        endpoint: path,
        method: "POST",
        schemaName: "OMVersion"
      });
    },
    getSections: async () => {
      const path = "/om/sections";
      const data = await requestJson(path);
      return parseWithSchema(OMSectionsResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "OMSectionsResponse"
      });
    }
  },
  distribution: {
    create: async (dealDraftId, payload) => {
      CreateDistributionRequest.parse(payload);
      const path = `/distribution/create/${dealDraftId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(CreateDistributionResponse, data, {
        endpoint: path,
        method: "POST",
        schemaName: "CreateDistributionResponse"
      });
    },
    addRecipients: async (distributionId, recipientIds) => {
      AddRecipientsRequest.parse({ recipientIds });
      const path = `/distribution/${distributionId}/add-recipients`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ recipientIds })
      });
      return parseWithSchema(AddRecipientsResponse, data, {
        endpoint: path,
        method: "POST",
        schemaName: "AddRecipientsResponse"
      });
    },
    addByEmail: async (distributionId, emails) => {
      const path = `/distribution/${distributionId}/add-by-email`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ emails })
      });
      // Returns { added: [...], errors?: [...] }
      return data;
    },
    get: async (distributionId) => {
      const path = `/distribution/${distributionId}`;
      const data = await requestJson(path);
      return parseWithSchema(DealDistribution, data, {
        endpoint: path,
        method: "GET",
        schemaName: "DealDistribution"
      });
    },
    getForDeal: async (dealDraftId) => {
      const path = `/distribution/deal/${dealDraftId}`;
      const data = await requestJson(path);
      return parseWithSchema(DistributionListResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "DistributionListResponse"
      });
    },
    recordView: async (recipientId, payload) => {
      RecordViewRequest.parse(payload ?? {});
      const path = `/distribution/recipient/${recipientId}/view`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(DistributionRecipient, data, {
        endpoint: path,
        method: "POST",
        schemaName: "DistributionRecipient"
      });
    },
    submitResponse: async (dealDraftId, payload) => {
      const path = `/distribution/respond/${dealDraftId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(DistributionBuyerResponse, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerResponse"
      });
    },
    getResponses: async (dealDraftId) => {
      const path = `/distribution/responses/${dealDraftId}`;
      const data = await requestJson(path);
      return parseWithSchema(DistributionResponsesResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "DistributionResponsesResponse"
      });
    }
  },
  buyer: {
    getInbox: async (params = {}) => {
      const path = `/buyer/inbox${buildQuery(params)}`;
      const data = await requestJson(path);
      return parseWithSchema(BuyerInboxResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "BuyerInboxResponse"
      });
    },
    getDeal: async (dealDraftId) => {
      const path = `/buyer/deal/${dealDraftId}`;
      const data = await requestJson(path);
      return parseWithSchema(BuyerDealResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "BuyerDealResponse"
      });
    },
    getCriteria: async () => {
      const path = "/buyer/criteria";
      const data = await requestJson(path);
      return parseWithSchema(BuyerCriteria.nullable(), data, {
        endpoint: path,
        method: "GET",
        schemaName: "BuyerCriteria"
      });
    },
    updateCriteria: async (criteria) => {
      BuyerCriteriaRequest.parse(criteria);
      const path = "/buyer/criteria";
      const data = await requestJson(path, {
        method: "PUT",
        body: JSON.stringify(criteria)
      });
      return parseWithSchema(BuyerCriteria, data, {
        endpoint: path,
        method: "PUT",
        schemaName: "BuyerCriteria"
      });
    },
    deleteCriteria: async () => {
      const data = await requestJson("/buyer/criteria", {
        method: "DELETE"
      });
      return data;
    },
    scoreDeal: async (dealDraftId) => {
      const path = `/buyer/score/${dealDraftId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({})
      });
      return parseWithSchema(BuyerTriageResult, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerTriageResult"
      });
    },
    scoreAllDeals: async () => {
      const path = "/buyer/score-all";
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({})
      });
      return parseWithSchema(z.array(BuyerTriageResult), data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerTriageResult[]"
      });
    },
    getTriage: async (dealDraftId) => {
      const path = `/buyer/triage/${dealDraftId}`;
      const data = await requestJson(path);
      return parseWithSchema(BuyerTriageResult, data, {
        endpoint: path,
        method: "GET",
        schemaName: "BuyerTriageResult"
      });
    },
    submitResponse: async (dealDraftId, payload) => {
      const path = `/buyer/respond/${dealDraftId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(DistributionBuyerResponse, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerResponse"
      });
    },
    getResponses: async () => {
      const path = "/buyer/responses";
      const data = await requestJson(path);
      return parseWithSchema(DistributionResponsesResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "BuyerResponses"
      });
    },
    getAnonymity: async () => {
      const path = "/buyer/anonymity";
      const data = await requestJson(path);
      return parseWithSchema(BuyerAnonymity, data, {
        endpoint: path,
        method: "GET",
        schemaName: "BuyerAnonymity"
      });
    },
    updateAnonymity: async (settings) => {
      const path = "/buyer/anonymity";
      const data = await requestJson(path, {
        method: "PUT",
        body: JSON.stringify(settings)
      });
      return parseWithSchema(BuyerAnonymity, data, {
        endpoint: path,
        method: "PUT",
        schemaName: "BuyerAnonymity"
      });
    }
  },
  gate: {
    getReviewQueue: async (dealDraftId, params = {}) => {
      const path = `/gate/queue/${dealDraftId}${buildQuery(params)}`;
      const data = await requestJson(path);
      return parseWithSchema(GateReviewQueueResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "GateReviewQueueResponse"
      });
    },
    authorize: async (dealDraftId, buyerUserId, payload = {}) => {
      GateAuthorizeRequest.parse(payload);
      const path = `/gate/authorize/${dealDraftId}/${buyerUserId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return parseWithSchema(BuyerAuthorization, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerAuthorization"
      });
    },
    decline: async (dealDraftId, buyerUserId, reason) => {
      GateDeclineRequest.parse({ reason });
      const path = `/gate/decline/${dealDraftId}/${buyerUserId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      return parseWithSchema(BuyerAuthorization, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerAuthorization"
      });
    },
    // Bulk operations
    bulkAuthorize: async (dealDraftId, buyerUserIds) => {
      const path = `/gate/bulk/authorize/${dealDraftId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ buyerUserIds })
      });
      return data; // { succeeded: string[], failed: { id, error }[] }
    },
    bulkDecline: async (dealDraftId, buyerUserIds, reason = 'Not a fit') => {
      const path = `/gate/bulk/decline/${dealDraftId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ buyerUserIds, reason })
      });
      return data; // { succeeded: string[], failed: { id, error }[] }
    },
    revoke: async (dealDraftId, buyerUserId, reason) => {
      GateRevokeRequest.parse({ reason });
      const path = `/gate/revoke/${dealDraftId}/${buyerUserId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      return parseWithSchema(BuyerAuthorization, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerAuthorization"
      });
    },
    sendNDA: async (dealDraftId, buyerUserId) => {
      const path = `/gate/nda/send/${dealDraftId}/${buyerUserId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({})
      });
      return parseWithSchema(BuyerAuthorization, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerAuthorization"
      });
    },
    recordNDASigned: async (dealDraftId, buyerUserId, ndaDocumentId) => {
      GateRecordNDASignedRequest.parse({ ndaDocumentId });
      const path = `/gate/nda/signed/${dealDraftId}/${buyerUserId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ ndaDocumentId })
      });
      return parseWithSchema(BuyerAuthorization, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerAuthorization"
      });
    },
    grantAccess: async (dealDraftId, buyerUserId, accessLevel) => {
      GateGrantAccessRequest.parse({ accessLevel });
      const path = `/gate/access/${dealDraftId}/${buyerUserId}`;
      const data = await requestJson(path, {
        method: "POST",
        body: JSON.stringify({ accessLevel })
      });
      return parseWithSchema(BuyerAuthorization, data, {
        endpoint: path,
        method: "POST",
        schemaName: "BuyerAuthorization"
      });
    },
    getStatus: async (dealDraftId, buyerUserId) => {
      const path = `/gate/status/${dealDraftId}/${buyerUserId}`;
      const data = await requestJson(path);
      return parseWithSchema(GateAuthorizationResponse, data, {
        endpoint: path,
        method: "GET",
        schemaName: "GateAuthorizationResponse"
      });
    },
    getAuthorizations: async (dealDraftId, status = null) => {
      const path = `/gate/authorizations/${dealDraftId}${buildQuery({ status })}`;
      const data = await requestJson(path);
      return parseWithSchema(z.array(BuyerAuthorization), data, {
        endpoint: path,
        method: "GET",
        schemaName: "BuyerAuthorization[]"
      });
    },
    getProgress: async (dealDraftId) => {
      const path = `/gate/progress/${dealDraftId}`;
      const data = await requestJson(path);
      return parseWithSchema(GateProgress, data, {
        endpoint: path,
        method: "GET",
        schemaName: "GateProgress"
      });
    },
    advanceToActiveDD: async (dealDraftId) => {
      const data = await requestJson(`/gate/advance/${dealDraftId}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    }
  },
  // Global Review Requests (for GP inbox)
  reviewRequests: {
    // List all review requests (with optional status filter)
    list: async (status = null) => {
      const params = status ? `?status=${encodeURIComponent(status)}` : '';
      const data = await requestJson(`/review-requests${params}`);
      return data;
    },
    // Get a single review request
    get: async (requestId) => {
      const data = await requestJson(`/review-requests/${requestId}`);
      return data;
    },
    // Respond to a review request (GP action)
    respond: async (requestId, action, message = null) => {
      const data = await requestJson(`/review-requests/${requestId}/respond`, {
        method: "POST",
        body: JSON.stringify({ action, message })
      });
      return data;
    }
  },
  events: {
    list: async ({ dealId, order = "desc", limit = 200 } = {}) => {
      const params = new URLSearchParams();
      if (dealId) {
        params.set("dealId", dealId);
      }
      if (order) {
        params.set("order", order);
      }
      if (limit) {
        params.set("limit", String(limit));
      }
      const query = params.toString();
      const path = `/events${query ? `?${query}` : ""}`;
      const data = await requestJson(path);
      return parseWithSchema(eventsResponseSchema, data, {
        endpoint: path,
        method: "GET",
        schemaName: "eventsResponse"
      });
    }
  },
  inbox: {
    list: async (scope = "mine") => {
      const path = `/inbox?scope=${encodeURIComponent(scope)}`;
      const data = await requestJson(path);
      return parseWithSchema(inboxResponseSchema, data, {
        endpoint: path,
        method: "GET",
        schemaName: "inboxResponse"
      });
    }
  },
  llm: {
    parseDeal: async ({ inputText, inputSource }) => {
      try {
        const path = "/llm/parse-deal";
        const data = await requestJson(path, {
          method: "POST",
          body: JSON.stringify({ inputText, inputSource })
        });
        return parseWithSchema(llmParseDealResponseSchema, data, {
          endpoint: path,
          method: "POST",
          schemaName: "llmParseDealResponse"
        });
      } catch (error) {
        // 422 means validation/eval failed but we got valid data back
        if (error.status === 422 && error.data) {
          try {
            return parseWithSchema(llmParseDealResponseSchema, error.data, {
              endpoint: "/llm/parse-deal",
              method: "POST",
              schemaName: "llmParseDealResponse"
            });
          } catch (parseError) {
            console.error("Failed to parse 422 response:", parseError);
            throw new Error("AI parse returned invalid data format");
          }
        }
        throw error;
      }
    },
    forceAccept: async (payload) => {
      const body = llmForceAcceptRequestSchema.parse(payload);
      const data = await requestJson("/llm/parse-deal/force-accept", {
        method: "POST",
        body: JSON.stringify(body)
      });
      return data;
    }
  },
  chat: {
    listConversations: async () => {
      const data = await requestJson("/chat/conversations");
      return data;
    },
    createConversation: async (payload) => {
      const data = await requestJson("/chat/conversations", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return data;
    },
    getConversation: async (conversationId) => {
      const data = await requestJson(`/chat/conversations/${conversationId}`);
      return data;
    },
    listMessages: async (conversationId, { cursor, limit } = {}) => {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (limit) params.set("limit", String(limit));
      const query = params.toString();
      const data = await requestJson(`/chat/conversations/${conversationId}/messages${query ? `?${query}` : ""}`);
      return data;
    },
    sendMessage: async (conversationId, { content, contentType, parentId, attachments }) => {
      const data = await requestJson(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, contentType, parentId, attachments })
      });
      return data;
    },
    markRead: async (conversationId) => {
      const data = await requestJson(`/chat/conversations/${conversationId}/read`, {
        method: "PATCH",
        body: JSON.stringify({})
      });
      return data;
    },
    joinConversation: async (conversationId) => {
      const data = await requestJson(`/chat/conversations/${conversationId}/join`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },
    getUpdates: async (since) => {
      const data = await requestJson(`/chat/updates?since=${encodeURIComponent(since)}`);
      return data;
    },
    getDealThread: async (dealId, dealName) => {
      const params = dealName ? `?dealName=${encodeURIComponent(dealName)}` : '';
      const data = await requestJson(`/chat/deals/${dealId}/thread${params}`);
      return data;
    }
  },
  notifications: {
    list: async ({ unreadOnly, limit } = {}) => {
      const params = new URLSearchParams();
      if (unreadOnly) params.set("unreadOnly", "true");
      if (limit) params.set("limit", String(limit));
      const query = params.toString();
      const data = await requestJson(`/notifications${query ? `?${query}` : ""}`);
      return data;
    },
    markRead: async (notificationId) => {
      const data = await requestJson(`/notifications/${notificationId}/read`, {
        method: "PATCH",
        body: JSON.stringify({})
      });
      return data;
    },
    markAllRead: async () => {
      const data = await requestJson("/notifications/read-all", {
        method: "PATCH",
        body: JSON.stringify({})
      });
      return data;
    },
    snooze: async (notificationId, { duration, until } = {}) => {
      const data = await requestJson(`/notifications/${notificationId}/snooze`, {
        method: "PATCH",
        body: JSON.stringify({ duration, until })
      });
      return data;
    },
    dismiss: async (notificationId, { reason } = {}) => {
      const data = await requestJson(`/notifications/${notificationId}/dismiss`, {
        method: "PATCH",
        body: JSON.stringify({ reason })
      });
      return data;
    }
  },
  notificationPreferences: {
    get: async () => {
      const data = await requestJson("/notification-preferences");
      return data;
    },
    update: async (preferences) => {
      const data = await requestJson("/notification-preferences", {
        method: "PATCH",
        body: JSON.stringify(preferences)
      });
      return data;
    }
  },
  activityFeed: {
    get: async ({ limit, dealId } = {}) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (dealId) params.set("dealId", dealId);
      const query = params.toString();
      const data = await requestJson(`/activity-feed${query ? `?${query}` : ""}`);
      return data;
    }
  },
  tasks: {
    list: async ({ status, dealId, assignedToMe, limit } = {}) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (dealId) params.set("dealId", dealId);
      if (assignedToMe) params.set("assignedToMe", "true");
      if (limit) params.set("limit", String(limit));
      const query = params.toString();
      const data = await requestJson(`/tasks${query ? `?${query}` : ""}`);
      return data;
    },
    create: async (payload) => {
      const data = await requestJson("/tasks", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return data;
    },
    update: async (taskId, payload) => {
      const data = await requestJson(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      return data;
    }
  },
  aiAssistant: {
    ask: async ({ question, conversationId, dealId }) => {
      const data = await requestJson("/ai-assistant/ask", {
        method: "POST",
        body: JSON.stringify({ question, conversationId, dealId })
      });
      return data;
    },
    getSuggestions: async () => {
      const data = await requestJson("/ai-assistant/suggestions");
      return data;
    }
  },
  // Email-to-Deal Integration
  emailIntake: {
    // List email intakes (admin view)
    list: async (status = null) => {
      const params = status ? `?status=${encodeURIComponent(status)}` : '';
      const data = await requestJson(`/email-intake${params}`);
      return data;
    },
    // Get single email intake details
    get: async (intakeId) => {
      const data = await requestJson(`/email-intake/${intakeId}`);
      return data;
    },
    // Retry failed email intake
    retry: async (intakeId) => {
      const data = await requestJson(`/email-intake/${intakeId}/retry`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },
    // Simulate email intake (for testing without SendGrid)
    simulate: async ({ from, subject, text, attachments = [] }) => {
      const data = await requestJson("/email-intake/simulate", {
        method: "POST",
        body: JSON.stringify({ from, subject, text, attachments })
      });
      return data;
    }
  },

  // Underwriting Intelligence
  underwriting: {
    // Get underwriting model for a deal
    getModel: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/underwriting`);
      return data;
    },
    // Update underwriting model inputs
    updateModel: async (dealId, updates) => {
      const data = await requestJson(`/deals/${dealId}/underwriting`, {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      return data;
    },
    // Recalculate model returns
    calculate: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/underwriting/calculate`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },

    // Document Extractions
    listExtractions: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/extractions`);
      return data;
    },
    extractDocument: async (dealId, { artifactId, documentType }) => {
      const data = await requestJson(`/deals/${dealId}/extract`, {
        method: "POST",
        body: JSON.stringify({ artifactId, documentType })
      });
      return data;
    },
    applyExtraction: async (dealId, extractionId) => {
      const data = await requestJson(`/deals/${dealId}/underwriting/apply-extraction`, {
        method: "POST",
        body: JSON.stringify({ extractionId })
      });
      return data;
    },

    // Conflicts
    listConflicts: async (dealId, status = null) => {
      const params = status ? `?status=${encodeURIComponent(status)}` : '';
      const data = await requestJson(`/deals/${dealId}/conflicts${params}`);
      return data;
    },
    resolveConflict: async (dealId, conflictId, { resolution, note }) => {
      const data = await requestJson(`/deals/${dealId}/conflicts/${conflictId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution, note })
      });
      return data;
    },

    // Scenarios
    listScenarios: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/scenarios`);
      return data;
    },
    createScenario: async (dealId, { name, description, assumptions }) => {
      const data = await requestJson(`/deals/${dealId}/scenarios`, {
        method: "POST",
        body: JSON.stringify({ name, description, assumptions })
      });
      return data;
    },
    updateScenario: async (dealId, scenarioId, updates) => {
      const data = await requestJson(`/deals/${dealId}/scenarios/${scenarioId}`, {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      return data;
    },
    deleteScenario: async (dealId, scenarioId) => {
      const data = await requestJson(`/deals/${dealId}/scenarios/${scenarioId}`, {
        method: "DELETE"
      });
      return data;
    },
    compareScenarios: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/scenarios/compare`);
      return data;
    },

    // IC Memo
    getMemo: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/memo`);
      return data;
    },
    generateMemo: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/memo/generate`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },
    updateMemo: async (dealId, { content, analystNotes }) => {
      const data = await requestJson(`/deals/${dealId}/memo`, {
        method: "PATCH",
        body: JSON.stringify({ content, analystNotes })
      });
      return data;
    },

    // Year-by-Year Cash Flows
    getCashFlows: async (dealId, years = null) => {
      const params = years ? `?years=${years}` : '';
      const data = await requestJson(`/deals/${dealId}/underwriting/cash-flows${params}`);
      return data;
    },
    getScenarioCashFlows: async (dealId, assumptions) => {
      const data = await requestJson(`/deals/${dealId}/underwriting/cash-flows/scenario`, {
        method: "POST",
        body: JSON.stringify({ assumptions })
      });
      return data;
    },

    // Input Provenance
    getInputProvenance: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/inputs/provenance`);
      return data;
    },
    getInputHistory: async (dealId, fieldPath) => {
      const data = await requestJson(`/deals/${dealId}/inputs/${encodeURIComponent(fieldPath)}/history`);
      return data;
    },

    // Equity Waterfall
    getWaterfall: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/waterfall`);
      return data;
    },
    createWaterfall: async (dealId, structure) => {
      const data = await requestJson(`/deals/${dealId}/waterfall`, {
        method: "POST",
        body: JSON.stringify(structure)
      });
      return data;
    },
    updateWaterfall: async (dealId, updates) => {
      const data = await requestJson(`/deals/${dealId}/waterfall`, {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      return data;
    },
    calculateWaterfall: async (dealId, scenarioId = null) => {
      const data = await requestJson(`/deals/${dealId}/waterfall/calculate`, {
        method: "POST",
        body: JSON.stringify({ scenarioId })
      });
      return data;
    },
    listWaterfallDistributions: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/waterfall/distributions`);
      return data;
    },
    compareWaterfalls: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/waterfall/compare`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },

    // Sensitivity Analysis
    getSensitivityOptions: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/sensitivity/options`);
      return data;
    },
    calculateSensitivityMatrix: async (dealId, xField, yField, outputMetric, options = {}) => {
      const data = await requestJson(`/deals/${dealId}/sensitivity/matrix`, {
        method: "POST",
        body: JSON.stringify({ xField, yField, outputMetric, ...options })
      });
      return data;
    },
    getHoldPeriodSensitivity: async (dealId, maxYears = 10) => {
      const data = await requestJson(`/deals/${dealId}/sensitivity/hold-period?maxYears=${maxYears}`);
      return data;
    },
    getQuickSensitivity: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/sensitivity/quick`);
      return data;
    },
    createScenarioFromSensitivity: async (dealId, xField, xValue, yField, yValue, customName = null) => {
      const data = await requestJson(`/deals/${dealId}/sensitivity/create-scenario`, {
        method: "POST",
        body: JSON.stringify({ xField, xValue, yField, yValue, customName })
      });
      return data;
    },

    // Excel Import
    getMappableFields: async () => {
      const data = await requestJson("/excel/mappable-fields");
      return data;
    },
    listExcelImports: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/excel-imports`);
      return data;
    },
    getExcelImport: async (importId) => {
      const data = await requestJson(`/excel-imports/${importId}`);
      return data;
    },
    applyExcelImport: async (importId) => {
      const data = await requestJson(`/excel-imports/${importId}/apply`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },
    updateExcelMappings: async (importId, mappings) => {
      const data = await requestJson(`/excel-imports/${importId}/mappings`, {
        method: "PATCH",
        body: JSON.stringify({ mappings })
      });
      return data;
    },

    // Excel Export
    getExportTemplates: async () => {
      const data = await requestJson("/excel/templates");
      return data;
    },
    exportToExcel: async (dealId, options = {}) => {
      // Build query params
      const params = new URLSearchParams();
      if (options.template) params.set('template', options.template);
      if (options.formulas !== undefined) params.set('formulas', options.formulas);
      if (options.waterfall !== undefined) params.set('waterfall', options.waterfall);
      if (options.sensitivity !== undefined) params.set('sensitivity', options.sensitivity);
      if (options.xAxis) params.set('xAxis', options.xAxis);
      if (options.yAxis) params.set('yAxis', options.yAxis);
      if (options.metric) params.set('metric', options.metric);

      const queryString = params.toString();
      const url = `/deals/${dealId}/excel-export${queryString ? '?' + queryString : ''}`;

      // For file download, we need to handle the blob response
      const authToken = getAuthToken();
      const headers = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      const response = await fetch(`${API_BASE}${url}`, { headers });
      if (!response.ok) {
        const text = await response.text();
        let error;
        try {
          error = JSON.parse(text);
        } catch {
          error = { message: text };
        }
        throw new Error(error.message || 'Export failed');
      }

      // Return the blob for download
      const blob = await response.blob();
      const filename = response.headers.get('Content-Disposition')
        ?.match(/filename="([^"]+)"/)?.[1] || 'underwriting-model.xlsx';

      return { blob, filename };
    },
    // Helper to trigger download
    downloadExcel: async (dealId, options = {}) => {
      const { blob, filename } = await bff.underwriting.exportToExcel(dealId, options);

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { filename };
    }
  },

  // Deal AI - Context-aware chat, insights, and summaries
  dealAI: {
    // Send a message to the deal-aware AI chat
    chat: async (dealId, { message, conversationHistory = [] }) => {
      const data = await requestJson(`/deals/${dealId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message, conversationHistory })
      });
      return data;
    },
    // Get chat history for a deal
    getChatHistory: async (dealId, { limit = 50 } = {}) => {
      const params = limit ? `?limit=${limit}` : '';
      const data = await requestJson(`/deals/${dealId}/chat/history${params}`);
      return data;
    },
    // Get auto-generated insights for a deal
    getInsights: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/insights`);
      return data;
    },
    // Get full deal context (for debugging/advanced use)
    getContext: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/context`);
      return data;
    },
    // Generate executive summary for a deal
    summarize: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/summarize`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },
    // Generate complete deal package (model, memo, summary, provenance)
    exportPackage: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/export-package`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    }
  },

  // Verification Queue - Extraction claim verification
  verificationQueue: {
    // Get all claims for a deal
    getClaims: async (dealId, { status, fieldPath, documentId, limit } = {}) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (fieldPath) params.set('fieldPath', fieldPath);
      if (documentId) params.set('documentId', documentId);
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      const data = await requestJson(`/deals/${dealId}/claims${query ? `?${query}` : ''}`);
      return data;
    },
    // Get pending claims for verification queue
    getPendingClaims: async (dealId, { sortBy, order, documentType } = {}) => {
      const params = new URLSearchParams();
      if (sortBy) params.set('sortBy', sortBy);
      if (order) params.set('order', order);
      if (documentType) params.set('documentType', documentType);
      const query = params.toString();
      const data = await requestJson(`/deals/${dealId}/claims/pending${query ? `?${query}` : ''}`);
      return data;
    },
    // Get verification statistics
    getStats: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/claims/stats`);
      return data;
    },
    // Get a single claim
    getClaim: async (claimId) => {
      const data = await requestJson(`/claims/${claimId}`);
      return data;
    },
    // Verify (approve) a claim
    verifyClaim: async (claimId, { correctedValue } = {}) => {
      const data = await requestJson(`/claims/${claimId}/verify`, {
        method: "POST",
        body: JSON.stringify({ correctedValue })
      });
      return data;
    },
    // Reject a claim
    rejectClaim: async (claimId, reason) => {
      const data = await requestJson(`/claims/${claimId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      return data;
    },
    // Bulk verify claims
    bulkVerify: async (dealId, { claimIds, minConfidence }) => {
      const data = await requestJson(`/deals/${dealId}/claims/bulk-verify`, {
        method: "POST",
        body: JSON.stringify({ claimIds, minConfidence })
      });
      return data;
    },
    // Bulk reject claims
    bulkReject: async (dealId, { claimIds, reason }) => {
      const data = await requestJson(`/deals/${dealId}/claims/bulk-reject`, {
        method: "POST",
        body: JSON.stringify({ claimIds, reason })
      });
      return data;
    },
    // Get claim history for a field
    getFieldHistory: async (dealId, fieldPath) => {
      const data = await requestJson(`/deals/${dealId}/claims/field/${encodeURIComponent(fieldPath)}/history`);
      return data;
    }
  },

  // Deal State Machine - Workflow management
  dealState: {
    // Get current deal state
    getState: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/state`);
      return data;
    },
    // Get available transitions
    getTransitions: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/state/transitions`);
      return data;
    },
    // Get current blockers
    getBlockers: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/state/blockers`);
      return data;
    },
    // Perform state transition
    transition: async (dealId, { toState, reason, approvals, force }) => {
      const data = await requestJson(`/deals/${dealId}/state/transition`, {
        method: "POST",
        body: JSON.stringify({ toState, reason, approvals, force })
      });
      return data;
    },
    // Get event history
    getEvents: async (dealId, { limit, eventType } = {}) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (eventType) params.set('eventType', eventType);
      const query = params.toString();
      const data = await requestJson(`/deals/${dealId}/events${query ? `?${query}` : ''}`);
      return data;
    },
    // Get single event
    getEvent: async (dealId, eventId) => {
      const data = await requestJson(`/deals/${dealId}/events/${eventId}`);
      return data;
    },
    // Verify event chain integrity
    verifyChain: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/events/verify-chain`);
      return data;
    },
    // Get all valid states
    getValidStates: async () => {
      const data = await requestJson('/states');
      return data;
    },
    // Get all roles
    getRoles: async () => {
      const data = await requestJson('/roles');
      return data;
    }
  },

  // Document Generation - Generate, manage, and export deal documents
  documents: {
    // Generate a new document
    generate: async (dealId, { documentType, watermark, status }) => {
      const data = await requestJson(`/deals/${dealId}/documents/generate`, {
        method: "POST",
        body: JSON.stringify({ documentType, watermark, status })
      });
      return data;
    },
    // Get all document versions
    getVersions: async (dealId, documentType = null) => {
      const params = documentType ? `?documentType=${encodeURIComponent(documentType)}` : '';
      const data = await requestJson(`/deals/${dealId}/documents${params}`);
      return data;
    },
    // Get latest versions
    getLatest: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/documents/latest`);
      return data;
    },
    // Get versions of specific document type
    getTypeVersions: async (dealId, documentType) => {
      const data = await requestJson(`/deals/${dealId}/documents/${documentType}/versions`);
      return data;
    },
    // Get document version details
    getVersion: async (versionId) => {
      const data = await requestJson(`/documents/${versionId}`);
      return data;
    },
    // Promote document status
    promote: async (versionId, toStatus) => {
      const data = await requestJson(`/documents/${versionId}/promote`, {
        method: "POST",
        body: JSON.stringify({ toStatus })
      });
      return data;
    },
    // Get document provenance
    getProvenance: async (versionId) => {
      const data = await requestJson(`/documents/${versionId}/provenance`);
      return data;
    },
    // Get available document types
    getDocumentTypes: async () => {
      const data = await requestJson('/document-types');
      return data;
    },
    // Download PDF
    downloadPDF: async (versionId) => {
      const authToken = getAuthToken();
      const headers = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      const response = await fetch(`${API_BASE}/documents/${versionId}/pdf`, { headers });
      if (!response.ok) {
        const text = await response.text();
        let error;
        try {
          error = JSON.parse(text);
        } catch {
          error = { message: text };
        }
        throw new Error(error.message || 'Download failed');
      }
      const blob = await response.blob();
      const filename = response.headers.get('Content-Disposition')
        ?.match(/filename="([^"]+)"/)?.[1] || 'document.pdf';
      return { blob, filename };
    }
  },

  // Evidence Packs - Generate audit-ready document bundles
  evidencePacks: {
    // Generate a new evidence pack
    generate: async (dealId, packType) => {
      const data = await requestJson(`/deals/${dealId}/evidence-pack/generate`, {
        method: "POST",
        body: JSON.stringify({ packType })
      });
      return data;
    },
    // List evidence packs for a deal
    list: async (dealId, packType = null) => {
      const params = packType ? `?packType=${encodeURIComponent(packType)}` : '';
      const data = await requestJson(`/deals/${dealId}/evidence-packs${params}`);
      return data;
    },
    // Get pack details
    get: async (packId) => {
      const data = await requestJson(`/evidence-packs/${packId}`);
      return data;
    },
    // Validate pack integrity
    validate: async (packId) => {
      const data = await requestJson(`/evidence-packs/${packId}/validate`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },
    // Download pack ZIP
    download: async (packId) => {
      const authToken = getAuthToken();
      const headers = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      const response = await fetch(`${API_BASE}/evidence-packs/${packId}/download`, { headers });
      if (!response.ok) {
        const text = await response.text();
        let error;
        try {
          error = JSON.parse(text);
        } catch {
          error = { message: text };
        }
        throw new Error(error.message || 'Download failed');
      }
      const blob = await response.blob();
      const filename = response.headers.get('Content-Disposition')
        ?.match(/filename="([^"]+)"/)?.[1] || 'evidence-pack.zip';
      return { blob, filename };
    },
    // Get available pack types
    getPackTypes: async () => {
      const data = await requestJson('/evidence-pack-types');
      return data;
    }
  },

  // Sector-Specific Underwriting
  sectors: {
    // Get all available property sectors
    getAll: async () => {
      const data = await requestJson("/sectors");
      return data;
    },
    // Get full configuration for a specific sector
    getConfig: async (sectorCode) => {
      const data = await requestJson(`/sectors/${sectorCode}`);
      return data;
    },
    // Get input fields for a sector
    getInputs: async (sectorCode) => {
      const data = await requestJson(`/sectors/${sectorCode}/inputs`);
      return data;
    },
    // Get benchmarks for a sector
    getBenchmarks: async (sectorCode) => {
      const data = await requestJson(`/sectors/${sectorCode}/benchmarks`);
      return data;
    },
    // Get risk factors for a sector
    getRisks: async (sectorCode) => {
      const data = await requestJson(`/sectors/${sectorCode}/risks`);
      return data;
    },
    // Detect sector from deal data
    detectSector: async (dealId) => {
      const data = await requestJson(`/deals/${dealId}/detect-sector`, {
        method: "POST",
        body: JSON.stringify({})
      });
      return data;
    },
    // Get sector-specific metrics for a deal
    getMetrics: async (dealId, forceSector = null) => {
      const params = forceSector ? `?sector=${encodeURIComponent(forceSector)}` : '';
      const data = await requestJson(`/deals/${dealId}/sector-metrics${params}`);
      return data;
    },
    // Update sector-specific inputs for a deal
    updateInputs: async (dealId, sector, inputs) => {
      const data = await requestJson(`/deals/${dealId}/sector-inputs`, {
        method: "PATCH",
        body: JSON.stringify({ sector, inputs })
      });
      return data;
    },
    // Validate deal metrics against sector benchmarks
    validateBenchmarks: async (dealId, sector = null, metrics = null) => {
      const data = await requestJson(`/deals/${dealId}/validate-benchmarks`, {
        method: "POST",
        body: JSON.stringify({ sector, metrics })
      });
      return data;
    }
  },

  // Contact/Vendor Database
  contacts: {
    // List contacts with filtering and pagination
    list: async ({ contactType, status, search, isOrgPreferred, page, limit } = {}) => {
      const params = new URLSearchParams();
      if (contactType) params.set('contactType', contactType);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (isOrgPreferred !== undefined) params.set('isOrgPreferred', String(isOrgPreferred));
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      const data = await requestJson(`/contacts${query ? `?${query}` : ''}`);
      return data;
    },

    // Search contacts (for picker component)
    search: async (q, { contactType, limit } = {}) => {
      const params = new URLSearchParams();
      params.set('q', q);
      if (contactType) params.set('type', contactType);
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      const data = await requestJson(`/contacts/search?${query}`);
      return data;
    },

    // Get recent contacts (for picker component)
    recent: async (contactType = null, limit = 10) => {
      const params = new URLSearchParams();
      if (contactType) params.set('type', contactType);
      params.set('limit', String(limit));
      const query = params.toString();
      const data = await requestJson(`/contacts/recent?${query}`);
      return data;
    },

    // Get expiring credentials
    expiringCredentials: async (days = 30) => {
      const data = await requestJson(`/contacts/expiring-credentials?days=${days}`);
      return data;
    },

    // Create a new contact
    create: async (payload) => {
      const data = await requestJson('/contacts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Get a single contact with details
    get: async (contactId, { includeCredentials, includeActivity, includeRatings, includeDeals } = {}) => {
      const params = new URLSearchParams();
      if (includeCredentials) params.set('includeCredentials', 'true');
      if (includeActivity) params.set('includeActivity', 'true');
      if (includeRatings) params.set('includeRatings', 'true');
      if (includeDeals) params.set('includeDeals', 'true');
      const query = params.toString();
      const data = await requestJson(`/contacts/${contactId}${query ? `?${query}` : ''}`);
      return data;
    },

    // Update a contact
    update: async (contactId, payload) => {
      const data = await requestJson(`/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Archive a contact (soft delete)
    archive: async (contactId) => {
      const data = await requestJson(`/contacts/${contactId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // Toggle favorite status
    toggleFavorite: async (contactId) => {
      const data = await requestJson(`/contacts/${contactId}/favorite`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      return data;
    },

    // Credentials
    addCredential: async (contactId, payload) => {
      const data = await requestJson(`/contacts/${contactId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    },

    updateCredential: async (contactId, credentialId, payload) => {
      const data = await requestJson(`/contacts/${contactId}/credentials/${credentialId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return data;
    },

    deleteCredential: async (contactId, credentialId) => {
      const data = await requestJson(`/contacts/${contactId}/credentials/${credentialId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // Activity log
    getActivity: async (contactId, { limit, dealId } = {}) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (dealId) params.set('dealId', dealId);
      const query = params.toString();
      const data = await requestJson(`/contacts/${contactId}/activity${query ? `?${query}` : ''}`);
      return data;
    },

    logActivity: async (contactId, payload) => {
      const data = await requestJson(`/contacts/${contactId}/activity`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Ratings
    getRatings: async (contactId) => {
      const data = await requestJson(`/contacts/${contactId}/ratings`);
      return data;
    },

    addRating: async (contactId, payload) => {
      const data = await requestJson(`/contacts/${contactId}/ratings`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Check for duplicates by email
    checkDuplicate: async (email) => {
      const data = await requestJson(`/contacts/check-duplicate?email=${encodeURIComponent(email)}`);
      return data;
    }
  },

  // Deal Contacts (assignments)
  dealContacts: {
    // List contacts assigned to a deal
    list: async (dealId, dealType = 'DRAFT') => {
      const data = await requestJson(`/contacts/deals/${dealId}?dealType=${dealType}`);
      return data;
    },

    // Assign a contact to a deal
    assign: async (dealId, dealType, payload) => {
      const data = await requestJson(`/contacts/deals/${dealId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, dealType })
      });
      return data;
    },

    // Update a deal contact assignment
    update: async (assignmentId, payload) => {
      const data = await requestJson(`/contacts/deals/assignments/${assignmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Remove contact from deal
    remove: async (assignmentId) => {
      const data = await requestJson(`/contacts/deals/assignments/${assignmentId}`, {
        method: 'DELETE'
      });
      return data;
    }
  },

  // ========== LEGAL / GP COUNSEL ==========
  legal: {
    // Get dashboard summary with Kanban counts
    getDashboard: async () => {
      const data = await requestJson('/legal/dashboard');
      return data;
    },

    // Get GC oversight stats
    getStats: async () => {
      const data = await requestJson('/legal/stats');
      return data;
    },

    // List all matters with optional filters
    listMatters: async (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.stage) params.set('stage', filters.stage);
      if (filters.matterType) params.set('matterType', filters.matterType);
      if (filters.dealId) params.set('dealId', filters.dealId);
      if (filters.assignedTo) params.set('assignedTo', filters.assignedTo);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.search) params.set('search', filters.search);
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.offset) params.set('offset', String(filters.offset));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/matters${query}`);
      return data;
    },

    // Create a new matter
    createMatter: async (payload) => {
      const data = await requestJson('/legal/matters', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Get matter by ID
    getMatter: async (matterId) => {
      const data = await requestJson(`/legal/matters/${matterId}`);
      return data;
    },

    // Update matter
    updateMatter: async (matterId, payload) => {
      const data = await requestJson(`/legal/matters/${matterId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Change matter stage (Kanban move)
    changeMatterStage: async (matterId, stage) => {
      const data = await requestJson(`/legal/matters/${matterId}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage })
      });
      return data;
    },

    // Assign matter to user
    assignMatter: async (matterId, assignedTo, assignedToName) => {
      const data = await requestJson(`/legal/matters/${matterId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignedTo, assignedToName })
      });
      return data;
    },

    // Sign off on matter
    signOffMatter: async (matterId, signOffType = 'SIMPLE', conditions = null) => {
      const data = await requestJson(`/legal/matters/${matterId}/sign-off`, {
        method: 'POST',
        body: JSON.stringify({ signOffType, conditions })
      });
      return data;
    },

    // Get matter activities
    getActivities: async (matterId, limit = 50, offset = 0) => {
      const data = await requestJson(`/legal/matters/${matterId}/activities?limit=${limit}&offset=${offset}`);
      return data;
    },

    // Add activity (comment) to matter
    addActivity: async (matterId, content, activityType = 'COMMENT', metadata = null) => {
      const data = await requestJson(`/legal/matters/${matterId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ content, activityType, metadata })
      });
      return data;
    },

    // Get legal context for a deal
    getDealLegalContext: async (dealId) => {
      const data = await requestJson(`/legal/deals/${dealId}/legal-context`);
      return data;
    },

    // ========== PHASE 2: DOCUMENT ANALYSIS ==========

    // List documents for a matter
    listMatterDocuments: async (matterId, { status, documentType, limit, offset } = {}) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (documentType) params.set('documentType', documentType);
      if (limit) params.set('limit', String(limit));
      if (offset) params.set('offset', String(offset));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/matters/${matterId}/documents${query}`);
      return data;
    },

    // Upload document to a matter
    uploadDocument: async (matterId, payload) => {
      const data = await requestJson(`/legal/matters/${matterId}/documents`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Get document by ID
    getDocument: async (documentId) => {
      const data = await requestJson(`/legal/documents/${documentId}`);
      return data;
    },

    // Delete document
    deleteDocument: async (documentId) => {
      const data = await requestJson(`/legal/documents/${documentId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // Trigger AI analysis on document
    analyzeDocument: async (documentId, options = {}) => {
      const data = await requestJson(`/legal/documents/${documentId}/analyze`, {
        method: 'POST',
        body: JSON.stringify(options)
      });
      return data;
    },

    // Get analysis results for document
    getDocumentAnalysis: async (documentId) => {
      const data = await requestJson(`/legal/documents/${documentId}/analysis`);
      return data;
    },

    // Analyze document against a playbook
    analyzeWithPlaybook: async (documentId, playbookId) => {
      const data = await requestJson(`/legal/documents/${documentId}/analyze/playbook`, {
        method: 'POST',
        body: JSON.stringify({ playbookId })
      });
      return data;
    },

    // ========== PHASE 2: PLAYBOOKS ==========

    // List all playbooks
    listPlaybooks: async ({ status, documentType, search } = {}) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (documentType) params.set('documentType', documentType);
      if (search) params.set('search', search);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/playbooks${query}`);
      return data;
    },

    // Create a new playbook
    createPlaybook: async (payload) => {
      const data = await requestJson('/legal/playbooks', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Get playbook by ID with rules
    getPlaybook: async (playbookId) => {
      const data = await requestJson(`/legal/playbooks/${playbookId}`);
      return data;
    },

    // Update playbook
    updatePlaybook: async (playbookId, payload) => {
      const data = await requestJson(`/legal/playbooks/${playbookId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Delete playbook
    deletePlaybook: async (playbookId) => {
      const data = await requestJson(`/legal/playbooks/${playbookId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // Add rule to playbook
    addPlaybookRule: async (playbookId, rule) => {
      const data = await requestJson(`/legal/playbooks/${playbookId}/rules`, {
        method: 'POST',
        body: JSON.stringify(rule)
      });
      return data;
    },

    // Update playbook rule
    updatePlaybookRule: async (playbookId, ruleId, payload) => {
      const data = await requestJson(`/legal/playbooks/${playbookId}/rules/${ruleId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Delete playbook rule
    deletePlaybookRule: async (playbookId, ruleId) => {
      const data = await requestJson(`/legal/playbooks/${playbookId}/rules/${ruleId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // Test playbook against a document
    testPlaybook: async (playbookId, documentId) => {
      const data = await requestJson(`/legal/playbooks/${playbookId}/test`, {
        method: 'POST',
        body: JSON.stringify({ documentId })
      });
      return data;
    },

    // Get suggested rules for a document type
    getPlaybookSuggestions: async (documentType) => {
      const data = await requestJson(`/legal/playbooks/suggestions?documentType=${encodeURIComponent(documentType)}`);
      return data;
    },

    // ========== PHASE 2: VAULT (Bulk Document Analysis) ==========

    // List all vaults
    listVaults: async ({ matterId, vaultType, status } = {}) => {
      const params = new URLSearchParams();
      if (matterId) params.set('matterId', matterId);
      if (vaultType) params.set('vaultType', vaultType);
      if (status) params.set('status', status);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/vaults${query}`);
      return data;
    },

    // Create a new vault
    createVault: async (payload) => {
      const data = await requestJson('/legal/vaults', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Get vault by ID
    getVault: async (vaultId) => {
      const data = await requestJson(`/legal/vaults/${vaultId}`);
      return data;
    },

    // Update vault
    updateVault: async (vaultId, payload) => {
      const data = await requestJson(`/legal/vaults/${vaultId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return data;
    },

    // Delete vault
    deleteVault: async (vaultId) => {
      const data = await requestJson(`/legal/vaults/${vaultId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // List documents in a vault
    listVaultDocuments: async (vaultId, { embeddingStatus, limit, offset } = {}) => {
      const params = new URLSearchParams();
      if (embeddingStatus) params.set('embeddingStatus', embeddingStatus);
      if (limit) params.set('limit', String(limit));
      if (offset) params.set('offset', String(offset));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/vaults/${vaultId}/documents${query}`);
      return data;
    },

    // Add documents to vault
    addVaultDocuments: async (vaultId, documentIds) => {
      const data = await requestJson(`/legal/vaults/${vaultId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ documentIds })
      });
      return data;
    },

    // Remove document from vault
    removeVaultDocument: async (vaultId, documentId) => {
      const data = await requestJson(`/legal/vaults/${vaultId}/documents/${documentId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // Query across vault documents (natural language)
    queryVault: async (vaultId, query, options = {}) => {
      const data = await requestJson(`/legal/vaults/${vaultId}/query`, {
        method: 'POST',
        body: JSON.stringify({ query, ...options })
      });
      return data;
    },

    // Get query history for vault
    getVaultQueries: async (vaultId, { limit, offset } = {}) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (offset) params.set('offset', String(offset));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/vaults/${vaultId}/queries${query}`);
      return data;
    },

    // Compare documents side-by-side
    compareVaultDocuments: async (vaultId, documentIds, criteria = []) => {
      const data = await requestJson(`/legal/vaults/${vaultId}/compare`, {
        method: 'POST',
        body: JSON.stringify({ documentIds, criteria })
      });
      return data;
    },

    // Generate aggregate report across vault
    generateVaultReport: async (vaultId, reportType, options = {}) => {
      const data = await requestJson(`/legal/vaults/${vaultId}/reports/generate`, {
        method: 'POST',
        body: JSON.stringify({ reportType, ...options })
      });
      return data;
    }
  },

  // ========== SHARED SPACES (Phase 3) ==========
  sharedSpaces: {
    // ===== SPACES =====
    // List all shared spaces for current organization
    list: async (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.matterId) params.set('matterId', filters.matterId);
      if (filters.dealId) params.set('dealId', filters.dealId);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/spaces${query}`);
      return data;
    },

    // Create new shared space
    create: async (spaceData) => {
      const data = await requestJson('/legal/spaces', {
        method: 'POST',
        body: JSON.stringify(spaceData)
      });
      return data;
    },

    // Get space detail with members, documents, messages
    get: async (spaceId) => {
      const data = await requestJson(`/legal/spaces/${spaceId}`);
      return data;
    },

    // Update space (name, description, isActive, expiresAt)
    update: async (spaceId, updates) => {
      const data = await requestJson(`/legal/spaces/${spaceId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      return data;
    },

    // Archive/delete space
    delete: async (spaceId) => {
      const data = await requestJson(`/legal/spaces/${spaceId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // ===== MEMBERS =====
    // Add member (internal or external)
    addMember: async (spaceId, memberData) => {
      const data = await requestJson(`/legal/spaces/${spaceId}/members`, {
        method: 'POST',
        body: JSON.stringify(memberData)
      });
      return data;
    },

    // Remove member from space
    removeMember: async (spaceId, memberId) => {
      const data = await requestJson(`/legal/spaces/${spaceId}/members/${memberId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // Update member role
    updateMemberRole: async (spaceId, memberId, role) => {
      const data = await requestJson(`/legal/spaces/${spaceId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      });
      return data;
    },

    // ===== DOCUMENTS =====
    // Add document to space
    addDocument: async (spaceId, documentData) => {
      const data = await requestJson(`/legal/spaces/${spaceId}/documents`, {
        method: 'POST',
        body: JSON.stringify(documentData)
      });
      return data;
    },

    // Remove document from space
    removeDocument: async (spaceId, documentId) => {
      const data = await requestJson(`/legal/spaces/${spaceId}/documents/${documentId}`, {
        method: 'DELETE'
      });
      return data;
    },

    // ===== MESSAGES =====
    // Get messages (paginated)
    getMessages: async (spaceId, cursor = null, limit = 50) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/spaces/${spaceId}/messages${query}`);
      return data;
    },

    // Send message
    sendMessage: async (spaceId, messageData) => {
      const data = await requestJson(`/legal/spaces/${spaceId}/messages`, {
        method: 'POST',
        body: JSON.stringify(messageData)
      });
      return data;
    },

    // ===== ACTIVITY =====
    // Get activity log
    getActivity: async (spaceId) => {
      const data = await requestJson(`/legal/spaces/${spaceId}/activity`);
      return data;
    },

    // ===== EXTERNAL ACCESS =====
    // Validate external token
    validateToken: async (token) => {
      const data = await requestJson(`/legal/external/${token}`);
      return data;
    },

    // Get documents (external)
    getExternalDocuments: async (token) => {
      const data = await requestJson(`/legal/external/${token}/documents`);
      return data;
    },

    // Download document (external)
    downloadExternalDocument: async (token, docId) => {
      const data = await requestJson(`/legal/external/${token}/documents/${docId}`);
      return data;
    },

    // Get messages (external)
    getExternalMessages: async (token, cursor = null, limit = 50) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await requestJson(`/legal/external/${token}/messages${query}`);
      return data;
    },

    // Send message (external)
    sendExternalMessage: async (token, messageData) => {
      const data = await requestJson(`/legal/external/${token}/messages`, {
        method: 'POST',
        body: JSON.stringify(messageData)
      });
      return data;
    },

    // Upload document (external)
    uploadExternalDocument: async (token, documentData) => {
      const data = await requestJson(`/legal/external/${token}/documents`, {
        method: 'POST',
        body: JSON.stringify(documentData)
      });
      return data;
    }
  },

  // Onboarding - Data import and onboarding workflows
  onboarding: {
    // Create a new onboarding session
    createSession: async (sessionData) => {
      const data = await requestJson('/onboarding/session', {
        method: 'POST',
        body: JSON.stringify(sessionData)
      });
      return data;
    },

    // Get session status and data
    getSession: async (sessionId) => {
      const data = await requestJson(`/onboarding/session/${sessionId}`);
      return data;
    },

    // Answer AI question
    answerQuestion: async (sessionId, questionId, answer) => {
      const data = await requestJson('/onboarding/ai/answer', {
        method: 'POST',
        body: JSON.stringify({ sessionId, questionId, answer })
      });
      return data;
    },

    // Dismiss AI question
    dismissQuestion: async (sessionId, questionId) => {
      const data = await requestJson('/onboarding/ai/dismiss', {
        method: 'POST',
        body: JSON.stringify({ sessionId, questionId })
      });
      return data;
    },

    // Send chat message to AI
    chatWithAI: async (sessionId, message, questionId = null) => {
      const data = await requestJson('/onboarding/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ sessionId, message, questionId })
      });
      return data;
    }
  },

  // GC Approval Queue (Phase 5.1)
  gcApproval: {
    // Get approval queue (General Counsel only)
    getQueue: async () => {
      const data = await requestJson('/legal/gc/approval-queue', {
        method: 'GET'
      });
      return data;
    },

    // Request GC review for a matter
    requestReview: async (matterId, notes) => {
      const data = await requestJson(`/legal/matters/${matterId}/request-gc-review`, {
        method: 'POST',
        body: JSON.stringify({ notes })
      });
      return data;
    },

    // Approve matter
    approve: async (matterId, notes) => {
      const data = await requestJson(`/legal/gc/approve/${matterId}`, {
        method: 'POST',
        body: JSON.stringify({ notes })
      });
      return data;
    },

    // Reject matter (notes required)
    reject: async (matterId, notes) => {
      const data = await requestJson(`/legal/gc/reject/${matterId}`, {
        method: 'POST',
        body: JSON.stringify({ notes })
      });
      return data;
    }
  }
};

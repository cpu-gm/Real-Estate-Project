/**
 * Onboarding Routes - Organization data import
 *
 * Handles:
 * - Session creation and status
 * - File uploads (bulk)
 * - OAuth connections
 * - Email inbox setup
 * - Claims management
 * - Conflict resolution
 * - Data link confirmation
 * - Verification quiz
 * - Reports generation
 */

import { getPrisma } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logPermissionAction } from '../middleware/auth.js';
import { createOnboardingLogger, COMPONENTS } from '../services/onboarding-logger.js';
import { onboardingAIAssistantService } from '../services/onboarding-ai-assistant.js';
import { createOnboardingOAuthService } from '../services/onboarding-oauth.js';
import { createOnboardingEmailForwarderService } from '../services/onboarding-email-forwarder.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Send JSON response
 */
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Send error response
 */
function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

/**
 * Parse query string from URL
 */
function parseQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

/**
 * Check if user has GP or Admin role
 */
function isGPOrAdmin(authUser) {
  return ['GP', 'Admin'].includes(authUser.role);
}

/**
 * Check if user is Admin
 */
function isAdmin(authUser) {
  return authUser.role === 'Admin';
}

// =============================================================================
// SESSION HANDLERS
// =============================================================================

/**
 * POST /api/onboarding/session
 * Create a new onboarding session
 */
async function handleCreateSession(req, res, readJsonBody, authUser) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const {
      selectedCategories = ['deals'],
      categoryPriorities,
      historicalOption = 'active',
      tier: requestedTier
    } = body;

    // Determine tier based on org settings or heuristics
    const tier = requestedTier || 'SELF_SERVICE';

    // Calculate SLA deadline based on tier
    const now = new Date();
    let slaDeadline;
    if (tier === 'WHITE_GLOVE') {
      slaDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    } else {
      slaDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours
    }

    const session = await prisma.onboardingSession.create({
      data: {
        organizationId: authUser.organizationId,
        status: 'SETUP',
        tier,
        selectedCategories: JSON.stringify(selectedCategories),
        categoryPriorities: JSON.stringify(categoryPriorities || selectedCategories),
        historicalOption,
        slaDeadline,
        createdBy: authUser.id,
        createdByName: authUser.name || authUser.email
      }
    });

    // Create email inbox for this org if it doesn't exist
    const existingInbox = await prisma.onboardingEmailInbox.findUnique({
      where: { organizationId: authUser.organizationId }
    });

    let emailAddress = existingInbox?.emailAddress;
    if (!existingInbox) {
      const shortId = uuidv4().slice(0, 8);
      emailAddress = `import-${shortId}@import.canonical.com`;

      await prisma.onboardingEmailInbox.create({
        data: {
          organizationId: authUser.organizationId,
          emailAddress
        }
      });
    }

    // Log session creation
    const logger = createOnboardingLogger(prisma, session.id);
    await logger.info(COMPONENTS.SESSION, 'Session created', {
      tier,
      categories: selectedCategories.length,
      historicalOption
    });

    await logger.createActivity('STAGE_CHANGE', 'Import session created');

    // Audit log
    await logPermissionAction({
      prisma,
      actorId: authUser.id,
      actorName: authUser.name || authUser.email,
      action: 'ONBOARDING_SESSION_CREATE',
      organizationId: authUser.organizationId,
      afterValue: JSON.stringify({ sessionId: session.id, tier })
    });

    sendJson(res, 201, {
      session: {
        id: session.id,
        status: session.status,
        tier: session.tier,
        selectedCategories,
        slaDeadline: session.slaDeadline
      },
      emailAddress
    });
  } catch (error) {
    console.error('[Onboarding] Failed to create session:', error);
    sendError(res, 500, 'Failed to create onboarding session');
  }
}

/**
 * GET /api/onboarding/session/:id
 * Get session status and details
 */
async function handleGetSession(req, res, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      },
      include: {
        intakeSources: {
          select: {
            id: true,
            sourceType: true,
            fileName: true,
            status: true,
            recordsExtracted: true,
            createdAt: true
          }
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        _count: {
          select: {
            claims: true,
            conflicts: true,
            dataLinks: true
          }
        }
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    // Calculate category progress
    const claims = await prisma.onboardingClaim.groupBy({
      by: ['category', 'status'],
      where: { sessionId },
      _count: true
    });

    const categories = {};
    claims.forEach(c => {
      if (!categories[c.category]) {
        categories[c.category] = { total: 0, verified: 0, unverified: 0 };
      }
      categories[c.category].total += c._count;
      if (c.status === 'VERIFIED') {
        categories[c.category].verified += c._count;
      } else {
        categories[c.category].unverified += c._count;
      }
    });

    // Calculate stage pipeline
    const stages = {
      processing: await prisma.onboardingIntakeSource.count({
        where: { sessionId, status: 'PROCESSING' }
      }),
      spot_check: await prisma.onboardingClaim.count({
        where: { sessionId, status: 'UNVERIFIED' }
      }),
      team_review: 0,
      ready: await prisma.onboardingClaim.count({
        where: { sessionId, status: 'VERIFIED' }
      })
    };

    sendJson(res, 200, {
      session: {
        id: session.id,
        status: session.status,
        tier: session.tier,
        totalRecords: session.totalRecords,
        processedRecords: session.processedRecords,
        verifiedRecords: session.verifiedRecords,
        estimatedCompletionAt: session.estimatedCompletionAt,
        slaDeadline: session.slaDeadline,
        createdAt: session.createdAt
      },
      categories: Object.entries(categories).map(([name, stats]) => ({
        name,
        processed: stats.total,
        total: stats.total,
        verified: stats.verified,
        hasIssues: stats.unverified > 0
      })),
      stages,
      intakeSources: session.intakeSources,
      activities: session.activities.map(a => ({
        id: a.id,
        type: a.activityType,
        message: a.message,
        timestamp: a.createdAt
      })),
      counts: session._count
    });
  } catch (error) {
    console.error('[Onboarding] Failed to get session:', error);
    sendError(res, 500, 'Failed to get session');
  }
}

// =============================================================================
// FILE UPLOAD HANDLERS
// =============================================================================

/**
 * POST /api/onboarding/upload
 * Upload files for processing
 * Note: File handling with multer requires special setup in the main dispatch
 */
async function handleUploadFiles(req, res, readJsonBody, authUser) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { sessionId, files = [] } = body;

    if (!sessionId) {
      return sendError(res, 400, 'sessionId is required');
    }

    if (files.length === 0) {
      return sendError(res, 400, 'No files provided');
    }

    // Verify session exists and belongs to org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const logger = createOnboardingLogger(prisma, sessionId);

    // Create intake sources for each file
    const sources = await Promise.all(files.map(async (file) => {
      await logger.logFileUpload(file.fileName, file.fileSize, file.mimeType);

      // In production, files would already be uploaded to S3
      const storageKey = file.storageKey || `onboarding/${sessionId}/${uuidv4()}-${file.fileName}`;

      return prisma.onboardingIntakeSource.create({
        data: {
          sessionId,
          sourceType: 'FILE',
          fileName: file.fileName,
          fileSize: file.fileSize,
          mimeType: file.mimeType,
          storageKey,
          status: 'PENDING'
        }
      });
    }));

    // Update session status if it was in SETUP
    if (session.status === 'SETUP') {
      await prisma.onboardingSession.update({
        where: { id: sessionId },
        data: {
          status: 'UPLOADING',
          startedAt: new Date()
        }
      });

      await logger.logStageTransition('SETUP', 'UPLOADING', files.length);
      await logger.createActivity('STAGE_CHANGE', `Started upload - ${files.length} files`);
    }

    sendJson(res, 201, {
      uploaded: sources.length,
      sources: sources.map(s => ({
        id: s.id,
        fileName: s.fileName,
        fileSize: s.fileSize,
        status: s.status
      }))
    });
  } catch (error) {
    console.error('[Onboarding] Failed to upload files:', error);
    sendError(res, 500, 'Failed to upload files');
  }
}

// =============================================================================
// CLAIMS HANDLERS
// =============================================================================

/**
 * GET /api/onboarding/claims
 * Get claims for a session
 */
async function handleGetClaims(req, res, authUser) {
  const prisma = getPrisma();
  const query = parseQuery(req);
  const { sessionId, category, status, recordKey, limit = '50', offset = '0' } = query;

  if (!sessionId) {
    return sendError(res, 400, 'sessionId is required');
  }

  try {
    // Verify session access
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const where = { sessionId };
    if (category) where.category = category;
    if (status) where.status = status;
    if (recordKey) where.recordKey = recordKey;

    const [claims, total] = await Promise.all([
      prisma.onboardingClaim.findMany({
        where,
        orderBy: [
          { recordKey: 'asc' },
          { fieldPath: 'asc' }
        ],
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
          source: {
            select: { fileName: true, sourceType: true }
          }
        }
      }),
      prisma.onboardingClaim.count({ where })
    ]);

    // Group claims by recordKey
    const records = {};
    claims.forEach(claim => {
      const key = claim.recordKey || claim.id;
      if (!records[key]) {
        records[key] = {
          id: key,
          title: claim.recordTitle,
          category: claim.category,
          fields: []
        };
      }
      records[key].fields.push({
        id: claim.id,
        fieldPath: claim.fieldPath,
        label: claim.fieldLabel,
        value: claim.value,
        displayValue: claim.displayValue,
        confidence: claim.confidence,
        status: claim.status,
        provenance: {
          documentName: claim.documentName || claim.source?.fileName,
          pageNumber: claim.pageNumber,
          cellReference: claim.cellReference,
          textSnippet: claim.textSnippet,
          extractionMethod: claim.extractionMethod
        }
      });
    });

    sendJson(res, 200, {
      records: Object.values(records),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[Onboarding] Failed to get claims:', error);
    sendError(res, 500, 'Failed to get claims');
  }
}

/**
 * POST /api/onboarding/claims/:id/verify
 * Verify or reject a claim
 */
async function handleVerifyClaim(req, res, readJsonBody, authUser, claimId) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { action, correctedValue, rejectionReason } = body;

    if (!['VERIFY', 'REJECT'].includes(action)) {
      return sendError(res, 400, 'action must be VERIFY or REJECT');
    }

    // Get claim and verify access
    const claim = await prisma.onboardingClaim.findUnique({
      where: { id: claimId },
      include: {
        session: { select: { organizationId: true, id: true } }
      }
    });

    if (!claim || claim.session.organizationId !== authUser.organizationId) {
      return sendError(res, 404, 'Claim not found');
    }

    const logger = createOnboardingLogger(prisma, claim.session.id);

    const updated = await prisma.onboardingClaim.update({
      where: { id: claimId },
      data: {
        status: action === 'VERIFY' ? 'VERIFIED' : 'REJECTED',
        verifiedAt: new Date(),
        verifiedBy: authUser.id,
        verifiedByName: authUser.name || authUser.email,
        correctedValue: action === 'VERIFY' ? correctedValue : null,
        rejectionReason: action === 'REJECT' ? rejectionReason : null
      }
    });

    await logger.logVerification(claimId, action, authUser.id, authUser.name || authUser.email);
    await logger.createActivity(
      'VERIFICATION',
      `${action === 'VERIFY' ? 'Verified' : 'Rejected'} field: ${claim.fieldLabel || claim.fieldPath}`,
      { claimId }
    );

    // Update session verified count
    if (action === 'VERIFY') {
      await prisma.onboardingSession.update({
        where: { id: claim.session.id },
        data: { verifiedRecords: { increment: 1 } }
      });
    }

    sendJson(res, 200, { claim: updated });
  } catch (error) {
    console.error('[Onboarding] Failed to verify claim:', error);
    sendError(res, 500, 'Failed to verify claim');
  }
}

// =============================================================================
// CONFLICTS HANDLERS
// =============================================================================

/**
 * GET /api/onboarding/conflicts
 * Get conflicts for a session
 */
async function handleGetConflicts(req, res, authUser) {
  const prisma = getPrisma();
  const query = parseQuery(req);
  const { sessionId, status } = query;

  if (!sessionId) {
    return sendError(res, 400, 'sessionId is required');
  }

  try {
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const where = { sessionId };
    if (status) where.status = status;

    const conflicts = await prisma.onboardingConflict.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        claimA: { select: { value: true, documentName: true, confidence: true } },
        claimB: { select: { value: true, documentName: true, confidence: true } }
      }
    });

    sendJson(res, 200, { conflicts });
  } catch (error) {
    console.error('[Onboarding] Failed to get conflicts:', error);
    sendError(res, 500, 'Failed to get conflicts');
  }
}

/**
 * POST /api/onboarding/conflicts/:id/resolve
 * Resolve a conflict
 */
async function handleResolveConflict(req, res, readJsonBody, authUser, conflictId) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { resolutionMethod, resolvedValue } = body;

    if (!resolutionMethod) {
      return sendError(res, 400, 'resolutionMethod is required');
    }

    const conflict = await prisma.onboardingConflict.findUnique({
      where: { id: conflictId },
      include: {
        session: { select: { organizationId: true } }
      }
    });

    if (!conflict || conflict.session.organizationId !== authUser.organizationId) {
      return sendError(res, 404, 'Conflict not found');
    }

    const updated = await prisma.onboardingConflict.update({
      where: { id: conflictId },
      data: {
        status: 'USER_RESOLVED',
        resolutionMethod,
        resolvedValue,
        resolvedBy: authUser.id,
        resolvedByName: authUser.name || authUser.email,
        resolvedAt: new Date()
      }
    });

    sendJson(res, 200, { conflict: updated });
  } catch (error) {
    console.error('[Onboarding] Failed to resolve conflict:', error);
    sendError(res, 500, 'Failed to resolve conflict');
  }
}

// =============================================================================
// DATA LINKS HANDLERS
// =============================================================================

/**
 * GET /api/onboarding/links
 * Get discovered data links
 */
async function handleGetLinks(req, res, authUser) {
  const prisma = getPrisma();
  const query = parseQuery(req);
  const { sessionId, status, linkType } = query;

  if (!sessionId) {
    return sendError(res, 400, 'sessionId is required');
  }

  try {
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const where = { sessionId };
    if (status) where.status = status;
    if (linkType) where.linkType = linkType;

    const links = await prisma.onboardingDataLink.findMany({
      where,
      orderBy: { matchConfidence: 'desc' }
    });

    sendJson(res, 200, { links });
  } catch (error) {
    console.error('[Onboarding] Failed to get links:', error);
    sendError(res, 500, 'Failed to get links');
  }
}

/**
 * POST /api/onboarding/links/:id/confirm
 * Confirm or reject a data link
 */
async function handleConfirmLink(req, res, readJsonBody, authUser, linkId) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { action, rejectionReason } = body;

    if (!['CONFIRM', 'REJECT'].includes(action)) {
      return sendError(res, 400, 'action must be CONFIRM or REJECT');
    }

    const link = await prisma.onboardingDataLink.findUnique({
      where: { id: linkId },
      include: {
        session: { select: { organizationId: true } }
      }
    });

    if (!link || link.session.organizationId !== authUser.organizationId) {
      return sendError(res, 404, 'Link not found');
    }

    const updated = await prisma.onboardingDataLink.update({
      where: { id: linkId },
      data: {
        status: action === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED',
        verifiedBy: authUser.id,
        verifiedByName: authUser.name || authUser.email,
        verifiedAt: new Date(),
        rejectionReason: action === 'REJECT' ? rejectionReason : null
      }
    });

    sendJson(res, 200, { link: updated });
  } catch (error) {
    console.error('[Onboarding] Failed to confirm link:', error);
    sendError(res, 500, 'Failed to confirm link');
  }
}

// =============================================================================
// EMAIL INBOX HANDLER
// =============================================================================

/**
 * GET /api/onboarding/email-inbox
 * Get or create email forwarding address
 */
async function handleGetEmailInbox(req, res, authUser) {
  const prisma = getPrisma();

  try {
    let inbox = await prisma.onboardingEmailInbox.findUnique({
      where: { organizationId: authUser.organizationId }
    });

    if (!inbox) {
      const shortId = uuidv4().slice(0, 8);
      inbox = await prisma.onboardingEmailInbox.create({
        data: {
          organizationId: authUser.organizationId,
          emailAddress: `import-${shortId}@import.canonical.com`
        }
      });
    }

    sendJson(res, 200, {
      emailAddress: inbox.emailAddress,
      messagesReceived: inbox.messagesReceived,
      lastReceivedAt: inbox.lastReceivedAt,
      isActive: inbox.isActive
    });
  } catch (error) {
    console.error('[Onboarding] Failed to get email inbox:', error);
    sendError(res, 500, 'Failed to get email inbox');
  }
}

// =============================================================================
// OAUTH HANDLERS (Phase 4)
// =============================================================================

/**
 * POST /api/onboarding/:sessionId/oauth/connect
 * Initiate OAuth flow for a provider
 */
async function handleOAuthConnect(req, res, readJsonBody, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { provider, redirectUri } = body;

    if (!provider) {
      return sendError(res, 400, 'provider is required');
    }

    if (!redirectUri) {
      return sendError(res, 400, 'redirectUri is required');
    }

    // Verify session belongs to user's org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const oauthService = createOnboardingOAuthService(prisma);
    const result = await oauthService.initiateOAuth(sessionId, provider, redirectUri, authUser.id);

    if (result.error) {
      if (result.stubMessage) {
        return sendJson(res, 200, {
          success: false,
          stubMessage: result.stubMessage
        });
      }
      return sendError(res, 400, result.error);
    }

    sendJson(res, 200, {
      authUrl: result.authUrl,
      state: result.state
    });

  } catch (error) {
    console.error('[Onboarding] OAuth connect failed:', error);
    sendError(res, 500, 'Failed to initiate OAuth');
  }
}

/**
 * GET /api/onboarding/oauth/callback
 * Handle OAuth callback (state contains session info)
 */
async function handleOAuthCallback(req, res, authUser) {
  const prisma = getPrisma();
  const query = parseQuery(req);

  try {
    const { state, code, error: oauthError } = query;

    if (oauthError) {
      return sendError(res, 400, `OAuth error: ${oauthError}`);
    }

    if (!state || !code) {
      return sendError(res, 400, 'Missing state or code parameter');
    }

    // Construct redirect URI from request
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const redirectUri = `${protocol}://${host}/api/onboarding/oauth/callback`;

    const oauthService = createOnboardingOAuthService(prisma);
    const result = await oauthService.handleCallback(state, code, redirectUri);

    if (result.error) {
      return sendError(res, 400, result.error);
    }

    sendJson(res, 200, {
      success: true,
      connection: result.connection
    });

  } catch (error) {
    console.error('[Onboarding] OAuth callback failed:', error);
    sendError(res, 500, 'OAuth callback failed');
  }
}

/**
 * GET /api/onboarding/:sessionId/oauth/connections
 * Get all OAuth connections for a session
 */
async function handleGetOAuthConnections(req, res, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    // Verify session belongs to user's org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const oauthService = createOnboardingOAuthService(prisma);
    const connections = await oauthService.getConnections(sessionId);

    // Get available providers
    const providers = oauthService.getAvailableProviders();

    sendJson(res, 200, {
      connections,
      availableProviders: providers
    });

  } catch (error) {
    console.error('[Onboarding] Failed to get OAuth connections:', error);
    sendError(res, 500, 'Failed to get OAuth connections');
  }
}

/**
 * POST /api/onboarding/:sessionId/oauth/:connectionId/sync
 * Trigger manual sync for an OAuth connection
 */
async function handleOAuthSync(req, res, authUser, sessionId, connectionId) {
  const prisma = getPrisma();

  try {
    // Verify session belongs to user's org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    // Verify connection belongs to session
    const connection = await prisma.onboardingOAuthConnection.findFirst({
      where: {
        id: connectionId,
        sessionId
      }
    });

    if (!connection) {
      return sendError(res, 404, 'Connection not found');
    }

    const oauthService = createOnboardingOAuthService(prisma);
    const result = await oauthService.syncFromProvider(connectionId, { syncType: 'MANUAL' });

    if (result.error) {
      if (result.stubProvider) {
        return sendJson(res, 200, {
          success: false,
          stubMessage: result.error
        });
      }
      return sendError(res, 500, result.error);
    }

    sendJson(res, 200, {
      success: true,
      recordsFetched: result.recordsFetched,
      recordsCreated: result.recordsCreated
    });

  } catch (error) {
    console.error('[Onboarding] OAuth sync failed:', error);
    sendError(res, 500, 'OAuth sync failed');
  }
}

/**
 * DELETE /api/onboarding/:sessionId/oauth/:connectionId
 * Disconnect an OAuth provider
 */
async function handleOAuthDisconnect(req, res, authUser, sessionId, connectionId) {
  const prisma = getPrisma();

  try {
    // Verify session belongs to user's org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    // Verify connection belongs to session
    const connection = await prisma.onboardingOAuthConnection.findFirst({
      where: {
        id: connectionId,
        sessionId
      }
    });

    if (!connection) {
      return sendError(res, 404, 'Connection not found');
    }

    const oauthService = createOnboardingOAuthService(prisma);
    const result = await oauthService.disconnectProvider(connectionId, authUser.id);

    if (result.error) {
      return sendError(res, 500, result.error);
    }

    sendJson(res, 200, { success: true });

  } catch (error) {
    console.error('[Onboarding] OAuth disconnect failed:', error);
    sendError(res, 500, 'Failed to disconnect provider');
  }
}

// =============================================================================
// EMAIL FORWARDER HANDLERS (Phase 4)
// =============================================================================

/**
 * POST /api/onboarding/:sessionId/email/forwarder
 * Create email forwarder for organization
 */
async function handleCreateEmailForwarder(req, res, readJsonBody, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();

    // Verify session belongs to user's org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const emailService = createOnboardingEmailForwarderService(prisma);
    const result = await emailService.createForwarder(sessionId, authUser.organizationId, body);

    if (result.error) {
      return sendError(res, 500, result.error);
    }

    sendJson(res, 201, { forwarder: result.forwarder });

  } catch (error) {
    console.error('[Onboarding] Failed to create email forwarder:', error);
    sendError(res, 500, 'Failed to create email forwarder');
  }
}

/**
 * GET /api/onboarding/:sessionId/email/forwarder
 * Get email forwarder for organization
 */
async function handleGetEmailForwarder(req, res, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    // Verify session belongs to user's org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const emailService = createOnboardingEmailForwarderService(prisma);
    const forwarder = await emailService.getForwarder(authUser.organizationId);

    if (!forwarder) {
      return sendJson(res, 200, { forwarder: null });
    }

    // Get stats
    const stats = await emailService.getForwarderStats(forwarder.id);

    sendJson(res, 200, { forwarder, stats });

  } catch (error) {
    console.error('[Onboarding] Failed to get email forwarder:', error);
    sendError(res, 500, 'Failed to get email forwarder');
  }
}

/**
 * PATCH /api/onboarding/:sessionId/email/forwarder
 * Update email forwarder settings
 */
async function handleUpdateEmailForwarder(req, res, readJsonBody, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();

    // Verify session belongs to user's org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    // Get forwarder
    const emailService = createOnboardingEmailForwarderService(prisma);
    const forwarder = await emailService.getForwarder(authUser.organizationId);

    if (!forwarder) {
      return sendError(res, 404, 'Forwarder not found');
    }

    const result = await emailService.updateForwarder(forwarder.id, body);

    if (result.error) {
      return sendError(res, 500, result.error);
    }

    sendJson(res, 200, { forwarder: result.forwarder });

  } catch (error) {
    console.error('[Onboarding] Failed to update email forwarder:', error);
    sendError(res, 500, 'Failed to update email forwarder');
  }
}

/**
 * GET /api/onboarding/:sessionId/email/logs
 * Get email logs for forwarder
 */
async function handleGetEmailLogs(req, res, authUser, sessionId) {
  const prisma = getPrisma();
  const query = parseQuery(req);

  try {
    // Verify session belongs to user's org
    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    // Get forwarder
    const emailService = createOnboardingEmailForwarderService(prisma);
    const forwarder = await emailService.getForwarder(authUser.organizationId);

    if (!forwarder) {
      return sendJson(res, 200, { emails: [], total: 0 });
    }

    const result = await emailService.getEmailLogs(forwarder.id, {
      status: query.status,
      limit: parseInt(query.limit) || 50,
      offset: parseInt(query.offset) || 0
    });

    sendJson(res, 200, result);

  } catch (error) {
    console.error('[Onboarding] Failed to get email logs:', error);
    sendError(res, 500, 'Failed to get email logs');
  }
}

/**
 * POST /api/onboarding/email/webhook
 * Handle inbound email webhook (from SendGrid)
 * NOTE: This endpoint does NOT require auth - it's a webhook
 */
async function handleEmailWebhook(req, res, readFormData) {
  const prisma = getPrisma();

  try {
    // Parse multipart form data (SendGrid sends form data)
    const payload = await readFormData();

    if (!payload) {
      return sendError(res, 400, 'Invalid webhook payload');
    }

    const emailService = createOnboardingEmailForwarderService(prisma);
    const result = await emailService.processInboundEmail(payload);

    if (result.error) {
      // Log error but return 200 to prevent retries
      console.error('[Onboarding] Email webhook error:', result.error);
      return sendJson(res, 200, { received: true, error: result.error });
    }

    sendJson(res, 200, {
      received: true,
      emailLogId: result.emailLogId,
      attachmentsProcessed: result.attachmentsProcessed
    });

  } catch (error) {
    console.error('[Onboarding] Email webhook failed:', error);
    // Return 200 to prevent webhook retries
    sendJson(res, 200, { received: true, error: 'Processing failed' });
  }
}

// =============================================================================
// FINALIZE HANDLER
// =============================================================================

/**
 * POST /api/onboarding/finalize
 * Mark session as ready for go-live
 */
async function handleFinalizeSession(req, res, readJsonBody, authUser) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { sessionId } = body;

    if (!sessionId) {
      return sendError(res, 400, 'sessionId is required');
    }

    const session = await prisma.onboardingSession.findFirst({
      where: {
        id: sessionId,
        organizationId: authUser.organizationId
      }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const logger = createOnboardingLogger(prisma, sessionId);

    const updated = await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        status: 'READY',
        completedAt: new Date()
      }
    });

    await logger.logStageTransition(session.status, 'READY', session.verifiedRecords);
    await logger.createActivity('STAGE_CHANGE', 'Import finalized and ready for go-live');

    await logPermissionAction({
      prisma,
      actorId: authUser.id,
      actorName: authUser.name || authUser.email,
      action: 'ONBOARDING_SESSION_FINALIZE',
      organizationId: authUser.organizationId,
      afterValue: JSON.stringify({ sessionId })
    });

    sendJson(res, 200, { session: updated });
  } catch (error) {
    console.error('[Onboarding] Failed to finalize session:', error);
    sendError(res, 500, 'Failed to finalize session');
  }
}

// =============================================================================
// ADMIN HANDLERS
// =============================================================================

/**
 * GET /api/admin/onboarding/queue
 * Get all onboarding sessions for admin view
 */
async function handleAdminGetQueue(req, res, authUser) {
  const prisma = getPrisma();
  const query = parseQuery(req);
  const { status, assignedTo, limit = '50', offset = '0' } = query;

  try {
    const where = {};
    if (status) where.status = status;
    if (assignedTo === 'unassigned') where.assignedTo = null;
    else if (assignedTo) where.assignedTo = assignedTo;

    const [sessions, total] = await Promise.all([
      prisma.onboardingSession.findMany({
        where,
        orderBy: [
          { slaDeadline: 'asc' },
          { createdAt: 'desc' }
        ],
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
          _count: {
            select: {
              claims: true,
              conflicts: true
            }
          }
        }
      }),
      prisma.onboardingSession.count({ where })
    ]);

    // Get organization names - placeholder
    const sessionsWithOrg = sessions.map(s => ({
      ...s,
      organizationName: `Org ${s.organizationId.slice(0, 8)}`,
      pendingItems: s._count.claims
    }));

    sendJson(res, 200, {
      sessions: sessionsWithOrg,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[Onboarding Admin] Failed to get queue:', error);
    sendError(res, 500, 'Failed to get queue');
  }
}

/**
 * PATCH /api/admin/onboarding/:id
 * Update session (admin only)
 */
async function handleAdminUpdateSession(req, res, readJsonBody, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { assignedTo, status, notes } = body;

    const updateData = {};
    if (assignedTo !== undefined) {
      updateData.assignedTo = assignedTo;
      updateData.assignedToName = assignedTo ? `User ${assignedTo.slice(0, 8)}` : null;
    }
    if (status) updateData.status = status;

    const updated = await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: updateData
    });

    // Add admin note if provided
    if (notes) {
      await prisma.onboardingAdminNote.create({
        data: {
          sessionId,
          content: notes,
          noteType: 'GENERAL',
          createdBy: authUser.id,
          createdByName: authUser.name || authUser.email
        }
      });
    }

    sendJson(res, 200, { session: updated });
  } catch (error) {
    console.error('[Onboarding Admin] Failed to update session:', error);
    sendError(res, 500, 'Failed to update session');
  }
}

/**
 * GET /api/admin/onboarding/:id/notes
 * Get admin notes for a session
 */
async function handleAdminGetNotes(req, res, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    const notes = await prisma.onboardingAdminNote.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' }
    });

    sendJson(res, 200, { notes });
  } catch (error) {
    console.error('[Onboarding Admin] Failed to get notes:', error);
    sendError(res, 500, 'Failed to get notes');
  }
}

/**
 * POST /api/admin/onboarding/:id/notes
 * Add admin note to a session
 */
async function handleAdminAddNote(req, res, readJsonBody, authUser, sessionId) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { content, noteType = 'GENERAL' } = body;

    if (!content) {
      return sendError(res, 400, 'content is required');
    }

    // Verify session exists
    const session = await prisma.onboardingSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    const note = await prisma.onboardingAdminNote.create({
      data: {
        sessionId,
        content,
        noteType,
        createdBy: authUser.id,
        createdByName: authUser.name || authUser.email
      }
    });

    // Log activity
    const logger = createOnboardingLogger(prisma, sessionId);
    await logger.createActivity('ADMIN_ACTION', `Admin note added: ${noteType}`, {
      noteId: note.id,
      noteType
    });

    sendJson(res, 201, { note });
  } catch (error) {
    console.error('[Onboarding Admin] Failed to add note:', error);
    sendError(res, 500, 'Failed to add note');
  }
}

/**
 * POST /api/admin/onboarding/bulk-assign
 * Bulk assign sessions to a user
 */
async function handleAdminBulkAssign(req, res, readJsonBody, authUser) {
  const prisma = getPrisma();

  try {
    const body = await readJsonBody();
    const { sessionIds, assignedTo } = body;

    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return sendError(res, 400, 'sessionIds array is required');
    }

    // Get assignee name if assigning to someone
    let assignedToName = null;
    if (assignedTo) {
      // In production, fetch actual user name
      assignedToName = `User ${assignedTo.slice(0, 8)}`;
    }

    const result = await prisma.onboardingSession.updateMany({
      where: { id: { in: sessionIds } },
      data: {
        assignedTo: assignedTo || null,
        assignedToName
      }
    });

    // Log activity for each session
    await Promise.all(sessionIds.map(async (sessionId) => {
      const logger = createOnboardingLogger(prisma, sessionId);
      await logger.createActivity(
        'ADMIN_ACTION',
        assignedTo ? `Session assigned to ${assignedToName}` : 'Session unassigned',
        { assignedTo }
      );
    }));

    await logPermissionAction({
      prisma,
      actorId: authUser.id,
      actorName: authUser.name || authUser.email,
      action: 'ONBOARDING_BULK_ASSIGN',
      organizationId: authUser.organizationId,
      afterValue: JSON.stringify({ sessionIds, assignedTo })
    });

    sendJson(res, 200, { updated: result.count });
  } catch (error) {
    console.error('[Onboarding Admin] Failed to bulk assign:', error);
    sendError(res, 500, 'Failed to bulk assign sessions');
  }
}

// =============================================================================
// AI ASSISTANT HANDLERS
// =============================================================================

/**
 * Handle answering an AI question
 * POST /api/onboarding/ai/answer
 */
async function handleAIAnswer(req, res, readJsonBody, authUser) {
  try {
    const body = await readJsonBody();
    const { sessionId, questionId, answer, answerLabel } = body;

    if (!sessionId || !questionId || answer === undefined) {
      return sendError(res, 400, 'sessionId, questionId, and answer are required');
    }

    // Verify session belongs to user's org
    const prisma = getPrisma();
    const session = await prisma.onboardingSession.findFirst({
      where: { id: sessionId, organizationId: authUser.organizationId }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    // Initialize service and process answer
    const assistant = onboardingAIAssistantService.init(sessionId);
    const result = await assistant.processAnswer(questionId, answer, answerLabel);

    // Log the action
    const logger = createOnboardingLogger(sessionId);
    logger.logQuestionAnswered(questionId, answer, result.appliedTo);

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[Onboarding AI] Failed to process answer:', error);
    sendError(res, 500, 'Failed to process answer');
  }
}

/**
 * Handle dismissing an AI question
 * POST /api/onboarding/ai/dismiss
 */
async function handleAIDismiss(req, res, readJsonBody, authUser) {
  try {
    const body = await readJsonBody();
    const { sessionId, questionId } = body;

    if (!sessionId || !questionId) {
      return sendError(res, 400, 'sessionId and questionId are required');
    }

    // Verify session belongs to user's org
    const prisma = getPrisma();
    const session = await prisma.onboardingSession.findFirst({
      where: { id: sessionId, organizationId: authUser.organizationId }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    // Initialize service and dismiss question
    const assistant = onboardingAIAssistantService.init(sessionId);
    const result = await assistant.dismissQuestion(questionId);

    // Log the action
    const logger = createOnboardingLogger(sessionId);
    logger.logQuestionDismissed(questionId, 'User dismissed');

    sendJson(res, 200, result);
  } catch (error) {
    console.error('[Onboarding AI] Failed to dismiss question:', error);
    sendError(res, 500, 'Failed to dismiss question');
  }
}

/**
 * Handle free-form chat with AI assistant
 * POST /api/onboarding/ai/chat
 */
async function handleAIChat(req, res, readJsonBody, authUser) {
  try {
    const body = await readJsonBody();
    const { sessionId, message, questionId } = body;

    if (!sessionId || !message) {
      return sendError(res, 400, 'sessionId and message are required');
    }

    // Verify session belongs to user's org
    const prisma = getPrisma();
    const session = await prisma.onboardingSession.findFirst({
      where: { id: sessionId, organizationId: authUser.organizationId }
    });

    if (!session) {
      return sendError(res, 404, 'Session not found');
    }

    // Get context for the chat
    const claimCount = await prisma.onboardingClaim.count({ where: { sessionId } });
    const pendingCount = await prisma.onboardingClaim.count({
      where: { sessionId, status: 'UNVERIFIED' }
    });
    const conflictCount = await prisma.onboardingConflict.count({
      where: { sessionId, status: 'UNRESOLVED' }
    });

    const context = {
      claimCount,
      pendingCount,
      conflictCount,
      questionId, // If responding to a specific question
      sessionStatus: session.status
    };

    // Initialize service and generate response
    const assistant = onboardingAIAssistantService.init(sessionId);
    const response = await assistant.generateChatResponse(message, context);

    // Log the interaction
    const logger = createOnboardingLogger(sessionId);
    logger.logChatMessage(message, 'user');
    logger.logChatResponse(response.message, response.tokensUsed);

    sendJson(res, 200, response);
  } catch (error) {
    console.error('[Onboarding AI] Failed to process chat:', error);
    sendError(res, 500, 'Failed to process chat message');
  }
}

// =============================================================================
// ROUTE DISPATCHER
// =============================================================================

/**
 * Route dispatcher for /api/onboarding/* endpoints
 */
export function dispatchOnboardingRoutes(req, res, segments, readJsonBody, authUser) {
  const method = req.method;
  // segments = ['onboarding', ...] or for admin routes ['admin', 'onboarding', ...]

  // Check if this is an admin route
  if (segments[0] === 'admin' && segments[1] === 'onboarding') {
    // Admin routes require Admin role
    if (!isAdmin(authUser)) {
      return sendError(res, 403, 'Admin role required');
    }

    const adminPath = segments.slice(2); // Remove 'admin', 'onboarding'

    // GET /api/admin/onboarding/queue
    if (method === 'GET' && adminPath[0] === 'queue' && adminPath.length === 1) {
      return handleAdminGetQueue(req, res, authUser);
    }

    // POST /api/admin/onboarding/bulk-assign
    if (method === 'POST' && adminPath[0] === 'bulk-assign' && adminPath.length === 1) {
      return handleAdminBulkAssign(req, res, readJsonBody, authUser);
    }

    // GET /api/admin/onboarding/:id/notes
    if (method === 'GET' && adminPath.length === 2 && adminPath[1] === 'notes') {
      return handleAdminGetNotes(req, res, authUser, adminPath[0]);
    }

    // POST /api/admin/onboarding/:id/notes
    if (method === 'POST' && adminPath.length === 2 && adminPath[1] === 'notes') {
      return handleAdminAddNote(req, res, readJsonBody, authUser, adminPath[0]);
    }

    // PATCH /api/admin/onboarding/:id
    if (method === 'PATCH' && adminPath.length === 1 && adminPath[0]) {
      return handleAdminUpdateSession(req, res, readJsonBody, authUser, adminPath[0]);
    }

    return sendError(res, 404, 'Admin onboarding route not found');
  }

  // Regular onboarding routes - segments = ['onboarding', ...]
  const subPath = segments.slice(1); // Remove 'onboarding' prefix

  // POST /api/onboarding/session - requires GP role
  if (method === 'POST' && subPath[0] === 'session' && subPath.length === 1) {
    if (!isGPOrAdmin(authUser)) {
      return sendError(res, 403, 'GP role required');
    }
    return handleCreateSession(req, res, readJsonBody, authUser);
  }

  // GET /api/onboarding/session/:id
  if (method === 'GET' && subPath[0] === 'session' && subPath.length === 2) {
    return handleGetSession(req, res, authUser, subPath[1]);
  }

  // POST /api/onboarding/upload - requires GP role
  if (method === 'POST' && subPath[0] === 'upload' && subPath.length === 1) {
    if (!isGPOrAdmin(authUser)) {
      return sendError(res, 403, 'GP role required');
    }
    return handleUploadFiles(req, res, readJsonBody, authUser);
  }

  // GET /api/onboarding/claims
  if (method === 'GET' && subPath[0] === 'claims' && subPath.length === 1) {
    return handleGetClaims(req, res, authUser);
  }

  // POST /api/onboarding/claims/:id/verify
  if (method === 'POST' && subPath[0] === 'claims' && subPath[2] === 'verify' && subPath.length === 3) {
    return handleVerifyClaim(req, res, readJsonBody, authUser, subPath[1]);
  }

  // GET /api/onboarding/conflicts
  if (method === 'GET' && subPath[0] === 'conflicts' && subPath.length === 1) {
    return handleGetConflicts(req, res, authUser);
  }

  // POST /api/onboarding/conflicts/:id/resolve
  if (method === 'POST' && subPath[0] === 'conflicts' && subPath[2] === 'resolve' && subPath.length === 3) {
    return handleResolveConflict(req, res, readJsonBody, authUser, subPath[1]);
  }

  // GET /api/onboarding/links
  if (method === 'GET' && subPath[0] === 'links' && subPath.length === 1) {
    return handleGetLinks(req, res, authUser);
  }

  // POST /api/onboarding/links/:id/confirm
  if (method === 'POST' && subPath[0] === 'links' && subPath[2] === 'confirm' && subPath.length === 3) {
    return handleConfirmLink(req, res, readJsonBody, authUser, subPath[1]);
  }

  // GET /api/onboarding/email-inbox
  if (method === 'GET' && subPath[0] === 'email-inbox' && subPath.length === 1) {
    return handleGetEmailInbox(req, res, authUser);
  }

  // POST /api/onboarding/finalize - requires GP role
  if (method === 'POST' && subPath[0] === 'finalize' && subPath.length === 1) {
    if (!isGPOrAdmin(authUser)) {
      return sendError(res, 403, 'GP role required');
    }
    return handleFinalizeSession(req, res, readJsonBody, authUser);
  }

  // =============================================================================
  // AI ASSISTANT ROUTES
  // =============================================================================

  // POST /api/onboarding/ai/answer - Answer an AI question
  if (method === 'POST' && subPath[0] === 'ai' && subPath[1] === 'answer' && subPath.length === 2) {
    return handleAIAnswer(req, res, readJsonBody, authUser);
  }

  // POST /api/onboarding/ai/dismiss - Dismiss/skip an AI question
  if (method === 'POST' && subPath[0] === 'ai' && subPath[1] === 'dismiss' && subPath.length === 2) {
    return handleAIDismiss(req, res, readJsonBody, authUser);
  }

  // POST /api/onboarding/ai/chat - Free-form chat with AI assistant
  if (method === 'POST' && subPath[0] === 'ai' && subPath[1] === 'chat' && subPath.length === 2) {
    return handleAIChat(req, res, readJsonBody, authUser);
  }

  // =============================================================================
  // OAUTH ROUTES (Phase 4)
  // =============================================================================

  // POST /api/onboarding/:sessionId/oauth/connect - Initiate OAuth
  if (method === 'POST' && subPath[1] === 'oauth' && subPath[2] === 'connect' && subPath.length === 3) {
    return handleOAuthConnect(req, res, readJsonBody, authUser, subPath[0]);
  }

  // GET /api/onboarding/oauth/callback - OAuth callback (no session in path)
  if (method === 'GET' && subPath[0] === 'oauth' && subPath[1] === 'callback' && subPath.length === 2) {
    return handleOAuthCallback(req, res, authUser);
  }

  // GET /api/onboarding/:sessionId/oauth/connections - List connections
  if (method === 'GET' && subPath[1] === 'oauth' && subPath[2] === 'connections' && subPath.length === 3) {
    return handleGetOAuthConnections(req, res, authUser, subPath[0]);
  }

  // POST /api/onboarding/:sessionId/oauth/:connectionId/sync - Manual sync
  if (method === 'POST' && subPath[1] === 'oauth' && subPath[3] === 'sync' && subPath.length === 4) {
    return handleOAuthSync(req, res, authUser, subPath[0], subPath[2]);
  }

  // DELETE /api/onboarding/:sessionId/oauth/:connectionId - Disconnect
  if (method === 'DELETE' && subPath[1] === 'oauth' && subPath.length === 3) {
    return handleOAuthDisconnect(req, res, authUser, subPath[0], subPath[2]);
  }

  // =============================================================================
  // EMAIL FORWARDER ROUTES (Phase 4)
  // =============================================================================

  // POST /api/onboarding/:sessionId/email/forwarder - Create forwarder
  if (method === 'POST' && subPath[1] === 'email' && subPath[2] === 'forwarder' && subPath.length === 3) {
    return handleCreateEmailForwarder(req, res, readJsonBody, authUser, subPath[0]);
  }

  // GET /api/onboarding/:sessionId/email/forwarder - Get forwarder
  if (method === 'GET' && subPath[1] === 'email' && subPath[2] === 'forwarder' && subPath.length === 3) {
    return handleGetEmailForwarder(req, res, authUser, subPath[0]);
  }

  // PATCH /api/onboarding/:sessionId/email/forwarder - Update forwarder
  if (method === 'PATCH' && subPath[1] === 'email' && subPath[2] === 'forwarder' && subPath.length === 3) {
    return handleUpdateEmailForwarder(req, res, readJsonBody, authUser, subPath[0]);
  }

  // GET /api/onboarding/:sessionId/email/logs - Get email logs
  if (method === 'GET' && subPath[1] === 'email' && subPath[2] === 'logs' && subPath.length === 3) {
    return handleGetEmailLogs(req, res, authUser, subPath[0]);
  }

  // POST /api/onboarding/email/webhook - Inbound email webhook (no auth)
  // Note: This is handled separately in the main dispatch before auth check

  // 404 - route not found
  sendError(res, 404, 'Onboarding route not found');
}

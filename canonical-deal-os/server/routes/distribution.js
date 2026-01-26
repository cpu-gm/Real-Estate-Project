/**
 * Distribution Routes
 *
 * API endpoints for deal distribution management.
 * Broker-initiated distribution to buyers.
 *
 * Part of Phase 3: Distribution + Buyer AI
 */

import {
  distributionService,
  LISTING_TYPES,
  RESPONSE_TYPES
} from '../services/distribution.js';
import { checkDealDraftAccess } from '../middleware/auth.js';

// Debug logging helper
const DEBUG = process.env.DEBUG_ROUTES === 'true' || process.env.DEBUG === 'true';
function debugLog(context, message, data = null) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.log(`[DISTRIBUTION_ROUTES ${timestamp}] [${context}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Dispatch distribution routes
 *
 * @param {Request} req - HTTP request
 * @param {Response} res - HTTP response
 * @param {string[]} segments - URL path segments
 * @param {Function} readJsonBody - JSON body parser
 * @param {Object} authUser - Authenticated user
 */
export function dispatchDistributionRoutes(req, res, segments, readJsonBody, authUser) {
  const method = req.method;
  debugLog('dispatch', `${method} /api/distribution/${segments.join('/')}`);

  // POST /api/distribution/create/:dealDraftId - Create a distribution
  if (method === 'POST' && segments[0] === 'create' && segments[1]) {
    return handleCreateDistribution(req, res, segments[1], readJsonBody, authUser);
  }

  // POST /api/distribution/:distributionId/add-recipients - Add manual recipients
  if (method === 'POST' && segments[1] === 'add-recipients') {
    return handleAddRecipients(req, res, segments[0], readJsonBody, authUser);
  }

  // POST /api/distribution/:distributionId/add-by-email - Add recipients by email
  if (method === 'POST' && segments[1] === 'add-by-email') {
    return handleAddRecipientsByEmail(req, res, segments[0], readJsonBody, authUser);
  }

  // GET /api/distribution/:distributionId - Get distribution details
  if (method === 'GET' && segments.length === 1) {
    return handleGetDistribution(req, res, segments[0], authUser);
  }

  // GET /api/distribution/deal/:dealDraftId - Get distributions for a deal
  if (method === 'GET' && segments[0] === 'deal' && segments[1]) {
    return handleGetDistributionsForDeal(req, res, segments[1], authUser);
  }

  // POST /api/distribution/recipient/:recipientId/view - Record a view
  if (method === 'POST' && segments[0] === 'recipient' && segments[2] === 'view') {
    return handleRecordView(req, res, segments[1], readJsonBody, authUser);
  }

  // POST /api/distribution/respond/:dealDraftId - Submit buyer response
  if (method === 'POST' && segments[0] === 'respond' && segments[1]) {
    return handleSubmitResponse(req, res, segments[1], readJsonBody, authUser);
  }

  // GET /api/distribution/responses/:dealDraftId - Get all responses for a deal
  if (method === 'GET' && segments[0] === 'responses' && segments[1]) {
    return handleGetResponses(req, res, segments[1], authUser);
  }

  // 404 - Route not found
  debugLog('dispatch', 'Route not found');
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Distribution route not found' }));
}

/**
 * Create a new distribution
 * POST /api/distribution/create/:dealDraftId
 */
async function handleCreateDistribution(req, res, dealDraftId, readJsonBody, authUser) {
  debugLog('handleCreateDistribution', 'Creating distribution', { dealDraftId });

  try {
    const body = await readJsonBody();

    // Validate listing type
    if (body.listingType && !Object.values(LISTING_TYPES).includes(body.listingType)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid listing type',
        validTypes: Object.values(LISTING_TYPES)
      }));
      return;
    }

    const result = await distributionService.createDistribution(
      dealDraftId,
      {
        listingType: body.listingType || LISTING_TYPES.PRIVATE,
        manualRecipientIds: body.recipientIds || []
      },
      authUser
    );

    debugLog('handleCreateDistribution', 'Distribution created', {
      distributionId: result.distribution.id,
      recipientCount: result.recipients.length
    });

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    debugLog('handleCreateDistribution', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Add manual recipients to existing distribution
 * POST /api/distribution/:distributionId/add-recipients
 */
async function handleAddRecipients(req, res, distributionId, readJsonBody, authUser) {
  debugLog('handleAddRecipients', 'Adding recipients', { distributionId });

  try {
    const body = await readJsonBody();

    if (!body.recipientIds || !Array.isArray(body.recipientIds)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'recipientIds array required' }));
      return;
    }

    // Get distribution to find deal
    const distribution = await distributionService.getDistribution(distributionId);

    // Add recipients via service (re-using internal method)
    const result = await distributionService.createDistribution(
      distribution.dealDraftId,
      {
        listingType: distribution.listingType,
        manualRecipientIds: body.recipientIds
      },
      authUser
    );

    debugLog('handleAddRecipients', 'Recipients added', {
      count: result.recipients.length
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ added: result.recipients }));
  } catch (error) {
    debugLog('handleAddRecipients', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Add recipients by email
 * POST /api/distribution/:distributionId/add-by-email
 *
 * Creates placeholder buyer users if they don't exist, then adds as recipients.
 */
async function handleAddRecipientsByEmail(req, res, distributionId, readJsonBody, authUser) {
  debugLog('handleAddRecipientsByEmail', 'Adding recipients by email', { distributionId });

  try {
    const body = await readJsonBody();

    if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'emails array required' }));
      return;
    }

    // Import Prisma client
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    // Get distribution to find deal
    const distribution = await distributionService.getDistribution(distributionId);

    const addedRecipients = [];
    const errors = [];

    for (const email of body.emails) {
      try {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errors.push({ email, error: 'Invalid email format' });
          continue;
        }

        // Find or create user by email
        let user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() }
        });

        if (!user) {
          // Create a placeholder buyer user
          user = await prisma.user.create({
            data: {
              id: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              email: email.toLowerCase(),
              name: email.split('@')[0],
              role: 'GP', // Default role, can act as buyer
              status: 'PENDING',
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
          debugLog('handleAddRecipientsByEmail', 'Created placeholder user', { email, userId: user.id });
        }

        // Check if already a recipient
        const existingRecipient = await prisma.distributionRecipient.findFirst({
          where: {
            distributionId,
            buyerUserId: user.id
          }
        });

        if (existingRecipient) {
          errors.push({ email, error: 'Already a recipient' });
          continue;
        }

        // Create distribution recipient
        const recipient = await prisma.distributionRecipient.create({
          data: {
            id: `dr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            distributionId,
            buyerUserId: user.id,
            source: 'MANUAL_EMAIL',
            sentAt: new Date(),
            createdAt: new Date()
          }
        });

        addedRecipients.push({
          id: recipient.id,
          email: user.email,
          userId: user.id
        });

        debugLog('handleAddRecipientsByEmail', 'Recipient added', { email, recipientId: recipient.id });
      } catch (err) {
        errors.push({ email, error: err.message });
      }
    }

    await prisma.$disconnect();

    debugLog('handleAddRecipientsByEmail', 'Complete', {
      added: addedRecipients.length,
      errors: errors.length
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      added: addedRecipients,
      errors: errors.length > 0 ? errors : undefined
    }));
  } catch (error) {
    debugLog('handleAddRecipientsByEmail', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Get distribution details
 * GET /api/distribution/:distributionId
 */
async function handleGetDistribution(req, res, distributionId, authUser) {
  debugLog('handleGetDistribution', 'Fetching distribution', { distributionId });

  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not authenticated' }));
    return;
  }

  try {
    const distribution = await distributionService.getDistribution(distributionId);

    // Check access to the deal draft
    const accessResult = await checkDealDraftAccess({
      userId: authUser.id,
      userEmail: authUser.email,
      userOrgId: authUser.organizationId,
      dealDraftId: distribution.dealDraftId
    });

    if (!accessResult.allowed) {
      debugLog('handleGetDistribution', 'Access denied', { reason: accessResult.reason });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }

    debugLog('handleGetDistribution', 'Distribution found', {
      id: distribution.id,
      recipientCount: distribution.recipients.length
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(distribution));
  } catch (error) {
    debugLog('handleGetDistribution', 'Error', { error: error.message });
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Get distributions for a deal
 * GET /api/distribution/deal/:dealDraftId
 */
async function handleGetDistributionsForDeal(req, res, dealDraftId, authUser) {
  debugLog('handleGetDistributionsForDeal', 'Fetching distributions', { dealDraftId });

  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not authenticated' }));
    return;
  }

  try {
    // Check access to the deal draft
    const accessResult = await checkDealDraftAccess({
      userId: authUser.id,
      userEmail: authUser.email,
      userOrgId: authUser.organizationId,
      dealDraftId
    });

    if (!accessResult.allowed) {
      debugLog('handleGetDistributionsForDeal', 'Access denied', { reason: accessResult.reason });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }

    const distributions = await distributionService.getDistributionsForDeal(dealDraftId);

    debugLog('handleGetDistributionsForDeal', 'Distributions found', {
      count: distributions.length
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(distributions));
  } catch (error) {
    debugLog('handleGetDistributionsForDeal', 'Error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Record a view event
 * POST /api/distribution/recipient/:recipientId/view
 */
async function handleRecordView(req, res, recipientId, readJsonBody, authUser) {
  debugLog('handleRecordView', 'Recording view', { recipientId });

  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not authenticated' }));
    return;
  }

  try {
    // Verify the recipient belongs to this user
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const recipient = await prisma.distributionRecipient.findUnique({
      where: { id: recipientId }
    });

    if (!recipient) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Recipient not found' }));
      return;
    }

    // Allow if user is the recipient OR admin
    if (recipient.userId !== authUser.id && authUser.role !== 'Admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Can only record views for your own recipient record' }));
      return;
    }

    const body = await readJsonBody();

    const updated = await distributionService.recordView(recipientId, {
      durationSec: body.durationSec,
      pagesViewed: body.pagesViewed
    });

    debugLog('handleRecordView', 'View recorded', { recipientId });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(updated));
  } catch (error) {
    debugLog('handleRecordView', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Submit buyer response
 * POST /api/distribution/respond/:dealDraftId
 */
async function handleSubmitResponse(req, res, dealDraftId, readJsonBody, authUser) {
  debugLog('handleSubmitResponse', 'Submitting response', { dealDraftId });

  try {
    const body = await readJsonBody();

    // Validate response type
    if (!body.response || !Object.values(RESPONSE_TYPES).includes(body.response)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid response type',
        validTypes: Object.values(RESPONSE_TYPES)
      }));
      return;
    }

    const response = await distributionService.submitResponse(dealDraftId, body, authUser);

    debugLog('handleSubmitResponse', 'Response submitted', { responseId: response.id });

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } catch (error) {
    debugLog('handleSubmitResponse', 'Error', { error: error.message });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Get all responses for a deal
 * GET /api/distribution/responses/:dealDraftId
 */
async function handleGetResponses(req, res, dealDraftId, authUser) {
  debugLog('handleGetResponses', 'Fetching responses', { dealDraftId });

  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not authenticated' }));
    return;
  }

  try {
    // Check access to the deal draft (only deal owner/broker should see responses)
    const accessResult = await checkDealDraftAccess({
      userId: authUser.id,
      userEmail: authUser.email,
      userOrgId: authUser.organizationId,
      dealDraftId
    });

    if (!accessResult.allowed) {
      debugLog('handleGetResponses', 'Access denied', { reason: accessResult.reason });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }

    // Import Prisma client
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const responses = await prisma.buyerResponse.findMany({
      where: { dealDraftId },
      orderBy: { respondedAt: 'desc' }
    });

    // Parse JSON fields
    const parsed = responses.map(r => ({
      ...r,
      questionsForBroker: r.questionsForBroker ? JSON.parse(r.questionsForBroker) : null,
      conditions: r.conditions ? JSON.parse(r.conditions) : null
    }));

    debugLog('handleGetResponses', 'Responses found', { count: parsed.length });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(parsed));
  } catch (error) {
    debugLog('handleGetResponses', 'Error', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Export constants for external use
export { LISTING_TYPES, RESPONSE_TYPES };

/**
 * Broker Dashboard Routes
 *
 * Provides unified dashboard data for brokers managing active listings:
 * - Aggregated stats across all listings
 * - Buyer funnel counts
 * - Activity timeline
 * - Individual listing inquiries
 * - Chat thread management for buyer communication
 *
 * Part of Broker Active Listing Tools
 */

import { getPrisma } from '../db.js';

/**
 * Check if a role is a broker role
 * @param {string} role - The user's role
 * @returns {boolean} - True if broker or brokerage admin
 */
function isBrokerRole(role) {
  return ['Broker', 'Brokerage Admin'].includes(role);
}

// Debug logging helper
const DEBUG = process.env.DEBUG_BROKER === 'true' || process.env.DEBUG === 'true';
function debugLog(context, message, data = null) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.log(`[BROKER_DASHBOARD ${timestamp}] [${context}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Get broker's accepted invitations (active listings)
 */
async function getBrokerListings(brokerId) {
  const prisma = getPrisma();

  const invitations = await prisma.brokerInvitation.findMany({
    where: {
      respondedByUserId: brokerId,
      status: 'ACCEPTED'
    },
    include: {
      dealDraft: {
        select: {
          id: true,
          propertyName: true,
          propertyAddress: true,
          assetType: true,
          askingPrice: true,
          askingPriceMin: true,
          askingPriceMax: true,
          status: true,
          listedAt: true,
          createdAt: true
        }
      }
    },
    orderBy: { respondedAt: 'desc' }
  });

  return invitations.filter(inv => inv.dealDraft &&
    ['LISTED_ACTIVE', 'LISTED_PENDING_BROKER', 'DISTRIBUTED'].includes(inv.dealDraft.status));
}

/**
 * Calculate funnel stats for a deal
 */
async function getDealFunnel(dealDraftId) {
  const prisma = getPrisma();

  // Get distribution recipients (views)
  const recipients = await prisma.distributionRecipient.findMany({
    where: {
      distribution: { dealDraftId }
    },
    select: {
      viewedAt: true,
      buyerUserId: true
    }
  });

  // Get buyer responses
  const responses = await prisma.buyerResponse.findMany({
    where: { dealDraftId },
    select: {
      buyerUserId: true,
      response: true
    }
  });

  // Get authorizations
  const authorizations = await prisma.buyerAuthorization.findMany({
    where: { dealDraftId },
    select: {
      buyerUserId: true,
      status: true,
      ndaStatus: true,
      accessLevel: true
    }
  });

  const views = recipients.filter(r => r.viewedAt).length;
  const interested = responses.filter(r =>
    r.response === 'INTERESTED' || r.response === 'INTERESTED_WITH_CONDITIONS'
  ).length;
  const ndaSent = authorizations.filter(a =>
    a.ndaStatus === 'SENT' || a.ndaStatus === 'SIGNED'
  ).length;
  const ndaSigned = authorizations.filter(a => a.ndaStatus === 'SIGNED').length;
  const inDataRoom = authorizations.filter(a =>
    a.status === 'AUTHORIZED' && a.ndaStatus === 'SIGNED'
  ).length;

  return {
    distributed: recipients.length,
    views,
    interested,
    ndaSent,
    ndaSigned,
    inDataRoom
  };
}

/**
 * Count pending inquiries (interested buyers without broker action)
 */
async function getPendingInquiriesCount(dealDraftId) {
  const prisma = getPrisma();

  const responses = await prisma.buyerResponse.findMany({
    where: {
      dealDraftId,
      response: { in: ['INTERESTED', 'INTERESTED_WITH_CONDITIONS'] }
    },
    select: { buyerUserId: true }
  });

  // Check which have authorizations
  const authorizations = await prisma.buyerAuthorization.findMany({
    where: {
      dealDraftId,
      buyerUserId: { in: responses.map(r => r.buyerUserId) }
    },
    select: { buyerUserId: true, status: true }
  });

  const authorizedBuyers = new Set(
    authorizations.filter(a => a.status !== 'PENDING').map(a => a.buyerUserId)
  );

  return responses.filter(r => !authorizedBuyers.has(r.buyerUserId)).length;
}

/**
 * GET /api/broker/dashboard
 * Returns aggregated dashboard data for broker
 */
async function handleGetDashboard(req, res, authUser) {
  console.log('[BrokerDashboard] Getting dashboard', { userId: authUser.id });

  try {
    const listings = await getBrokerListings(authUser.id);
    debugLog('handleGetDashboard', 'Found listings', { count: listings.length });

    // Aggregate stats
    let totalPendingInquiries = 0;
    let totalProjectedCommission = 0;
    let totalBuyersInDD = 0;
    const aggregateFunnel = {
      distributed: 0,
      views: 0,
      interested: 0,
      ndaSent: 0,
      ndaSigned: 0,
      inDataRoom: 0
    };

    const enrichedListings = await Promise.all(
      listings.map(async (inv) => {
        const deal = inv.dealDraft;
        const funnel = await getDealFunnel(deal.id);
        const pendingQuestions = await getPendingInquiriesCount(deal.id);

        // Calculate days on market
        const listedDate = deal.listedAt || inv.respondedAt;
        const daysOnMarket = listedDate
          ? Math.floor((Date.now() - new Date(listedDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Calculate projected commission
        const price = deal.askingPrice || deal.askingPriceMin || 0;
        const rate = inv.commissionRate || 0.03; // Default 3%
        const commissionProjected = price * rate;

        // Aggregate
        totalPendingInquiries += pendingQuestions;
        totalProjectedCommission += commissionProjected;
        totalBuyersInDD += funnel.inDataRoom;

        aggregateFunnel.distributed += funnel.distributed;
        aggregateFunnel.views += funnel.views;
        aggregateFunnel.interested += funnel.interested;
        aggregateFunnel.ndaSent += funnel.ndaSent;
        aggregateFunnel.ndaSigned += funnel.ndaSigned;
        aggregateFunnel.inDataRoom += funnel.inDataRoom;

        return {
          id: deal.id,
          invitationId: inv.id,
          propertyName: deal.propertyName,
          propertyAddress: deal.propertyAddress,
          assetType: deal.assetType,
          askingPrice: deal.askingPrice,
          askingPriceMin: deal.askingPriceMin,
          askingPriceMax: deal.askingPriceMax,
          status: deal.status,
          daysOnMarket,
          funnel,
          pendingQuestions,
          commissionProjected,
          commissionRate: inv.commissionRate,
          commissionType: inv.commissionType
        };
      })
    );

    console.log('[BrokerDashboard] Dashboard loaded', {
      listings: enrichedListings.length,
      pendingInquiries: totalPendingInquiries
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      summary: {
        totalActiveListings: enrichedListings.length,
        pendingInquiries: totalPendingInquiries,
        projectedCommission: totalProjectedCommission,
        buyersInDD: totalBuyersInDD
      },
      listings: enrichedListings,
      aggregateFunnel
    }));
  } catch (error) {
    console.error('[BrokerDashboard] Error getting dashboard', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Failed to load dashboard', error: error.message }));
  }
}

/**
 * GET /api/broker/activity
 * Returns recent activity timeline across all broker's listings
 */
async function handleGetActivity(req, res, authUser) {
  console.log('[BrokerDashboard] Getting activity', { userId: authUser.id });

  try {
    const prisma = getPrisma();
    const url = new URL(req.url, 'http://localhost');
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const listings = await getBrokerListings(authUser.id);
    const dealIds = listings.map(inv => inv.dealDraft.id);

    if (dealIds.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ activities: [] }));
      return;
    }

    // Get recent buyer responses
    const responses = await prisma.buyerResponse.findMany({
      where: {
        dealDraftId: { in: dealIds }
      },
      orderBy: { respondedAt: 'desc' },
      take: limit,
      include: {
        dealDraft: { select: { propertyName: true } }
      }
    });

    // Get recent authorization changes
    const authorizations = await prisma.buyerAuthorization.findMany({
      where: {
        dealDraftId: { in: dealIds },
        updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });

    // Build unified activity list
    const activities = [];

    for (const response of responses) {
      // Get buyer info
      const buyer = await prisma.authUser.findUnique({
        where: { id: response.buyerUserId },
        select: { name: true, email: true }
      });

      // Parse questionsForBroker properly (it's stored as JSON string in DB)
      let questionsArray = [];
      if (response.questionsForBroker) {
        try {
          questionsArray = typeof response.questionsForBroker === 'string'
            ? JSON.parse(response.questionsForBroker)
            : response.questionsForBroker;
        } catch (e) {
          questionsArray = [];
        }
      }

      activities.push({
        type: response.response === 'INTERESTED' ? 'buyer_interested' :
              response.response === 'INTERESTED_WITH_CONDITIONS' ? 'buyer_interested_conditions' :
              'buyer_passed',
        message: `${buyer?.name || 'A buyer'} expressed interest in ${response.dealDraft?.propertyName || 'a listing'}`,
        timestamp: response.respondedAt,
        dealDraftId: response.dealDraftId,
        buyerName: buyer?.name,
        buyerEmail: buyer?.email,
        hasQuestions: Array.isArray(questionsArray) && questionsArray.length > 0
      });
    }

    for (const auth of authorizations) {
      const buyer = await prisma.authUser.findUnique({
        where: { id: auth.buyerUserId },
        select: { name: true }
      });

      const deal = listings.find(l => l.dealDraft.id === auth.dealDraftId)?.dealDraft;

      if (auth.ndaStatus === 'SIGNED') {
        activities.push({
          type: 'nda_signed',
          message: `${buyer?.name || 'A buyer'} signed NDA for ${deal?.propertyName || 'a listing'}`,
          timestamp: auth.updatedAt,
          dealDraftId: auth.dealDraftId,
          buyerName: buyer?.name
        });
      }
    }

    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log('[BrokerDashboard] Activity loaded', { count: activities.length });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ activities: activities.slice(0, limit) }));
  } catch (error) {
    console.error('[BrokerDashboard] Error getting activity', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Failed to load activity', error: error.message }));
  }
}

/**
 * GET /api/broker/unread-count
 * Returns count of pending inquiries (for nav badge)
 */
async function handleGetUnreadCount(req, res, authUser) {
  console.log('[BrokerDashboard] Getting unread count', { userId: authUser.id });

  try {
    const listings = await getBrokerListings(authUser.id);

    let totalPending = 0;
    for (const inv of listings) {
      const pending = await getPendingInquiriesCount(inv.dealDraft.id);
      totalPending += pending;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: totalPending }));
  } catch (error) {
    console.error('[BrokerDashboard] Error getting unread count', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Failed to get count', error: error.message }));
  }
}

/**
 * GET /api/broker/new-inquiries
 * Returns new inquiries since a timestamp (for toast notifications)
 */
async function handleGetNewInquiries(req, res, authUser) {
  console.log('[BrokerDashboard] Getting new inquiries', { userId: authUser.id });

  try {
    const prisma = getPrisma();
    const url = new URL(req.url, 'http://localhost');
    const since = url.searchParams.get('since');

    if (!since) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Missing since parameter' }));
      return;
    }

    const sinceDate = new Date(since);
    const listings = await getBrokerListings(authUser.id);
    const dealIds = listings.map(inv => inv.dealDraft.id);

    if (dealIds.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: 0, inquiries: [] }));
      return;
    }

    const newResponses = await prisma.buyerResponse.findMany({
      where: {
        dealDraftId: { in: dealIds },
        response: { in: ['INTERESTED', 'INTERESTED_WITH_CONDITIONS'] },
        respondedAt: { gt: sinceDate }
      },
      include: {
        dealDraft: { select: { propertyName: true } }
      }
    });

    const inquiries = await Promise.all(
      newResponses.map(async (response) => {
        const buyer = await prisma.authUser.findUnique({
          where: { id: response.buyerUserId },
          select: { name: true, organization: { select: { name: true } } }
        });

        // Parse questionsForBroker properly
        let questionsArray = [];
        if (response.questionsForBroker) {
          try {
            questionsArray = typeof response.questionsForBroker === 'string'
              ? JSON.parse(response.questionsForBroker)
              : response.questionsForBroker;
          } catch (e) {
            questionsArray = [];
          }
        }

        return {
          id: response.id, // Include ID for deduplication in UI
          dealDraftId: response.dealDraftId,
          propertyName: response.dealDraft?.propertyName,
          buyerName: buyer?.name,
          buyerFirm: buyer?.organization?.name,
          responseType: response.response,
          respondedAt: response.respondedAt,
          hasQuestions: Array.isArray(questionsArray) && questionsArray.length > 0
        };
      })
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: inquiries.length, inquiries }));
  } catch (error) {
    console.error('[BrokerDashboard] Error getting new inquiries', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Failed to get inquiries', error: error.message }));
  }
}

/**
 * GET /api/broker/listings/:dealDraftId/inquiries
 * Returns detailed inquiries for a specific listing
 */
async function handleGetListingInquiries(req, res, authUser, dealDraftId) {
  console.log('[BrokerDashboard] Getting listing inquiries', { userId: authUser.id, dealDraftId });

  try {
    const prisma = getPrisma();

    // Verify broker has access to this listing
    const invitation = await prisma.brokerInvitation.findFirst({
      where: {
        dealDraftId,
        respondedByUserId: authUser.id,
        status: 'ACCEPTED'
      }
    });

    if (!invitation) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Access denied - not the listing broker' }));
      return;
    }

    // Get all interested responses
    const responses = await prisma.buyerResponse.findMany({
      where: {
        dealDraftId,
        response: { in: ['INTERESTED', 'INTERESTED_WITH_CONDITIONS'] }
      },
      orderBy: { respondedAt: 'desc' }
    });

    const inquiries = await Promise.all(
      responses.map(async (response) => {
        const buyer = await prisma.authUser.findUnique({
          where: { id: response.buyerUserId },
          select: { id: true, name: true, email: true, organization: { select: { name: true } } }
        });

        const authorization = await prisma.buyerAuthorization.findUnique({
          where: {
            dealDraftId_buyerUserId: {
              dealDraftId,
              buyerUserId: response.buyerUserId
            }
          }
        });

        // Get distribution recipient for view info
        const recipient = await prisma.distributionRecipient.findFirst({
          where: {
            buyerUserId: response.buyerUserId,
            distribution: { dealDraftId }
          }
        });

        // Parse JSON fields (stored as strings in DB)
        let questionsArray = [];
        let conditionsArray = [];
        try {
          if (response.questionsForBroker) {
            questionsArray = typeof response.questionsForBroker === 'string'
              ? JSON.parse(response.questionsForBroker)
              : response.questionsForBroker;
          }
          if (response.conditions) {
            conditionsArray = typeof response.conditions === 'string'
              ? JSON.parse(response.conditions)
              : response.conditions;
          }
        } catch (e) {
          console.error('[BrokerDashboard] Failed to parse JSON fields', e);
        }

        return {
          buyerUserId: response.buyerUserId,
          buyerName: buyer?.name,
          buyerEmail: buyer?.email,
          buyerFirm: buyer?.organization?.name,
          responseType: response.response,
          respondedAt: response.respondedAt,
          questionsForBroker: questionsArray,
          conditions: conditionsArray,
          indicativePriceMin: response.indicativePriceMin,
          indicativePriceMax: response.indicativePriceMax,
          viewedAt: recipient?.viewedAt,
          viewDurationSec: recipient?.viewDurationSec,
          authorization: authorization ? {
            status: authorization.status,
            ndaStatus: authorization.ndaStatus,
            accessLevel: authorization.accessLevel,
            authorizedAt: authorization.authorizedAt
          } : null
        };
      })
    );

    console.log('[BrokerDashboard] Inquiries loaded', { dealDraftId, count: inquiries.length });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ inquiries }));
  } catch (error) {
    console.error('[BrokerDashboard] Error getting inquiries', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Failed to get inquiries', error: error.message }));
  }
}

/**
 * GET /api/broker/inquiry/:dealDraftId/:buyerUserId/thread
 * Gets or creates a chat thread between broker and buyer for a deal
 */
async function handleGetInquiryThread(req, res, authUser, dealDraftId, buyerUserId) {
  console.log('[BrokerDashboard] Getting inquiry thread', {
    userId: authUser.id, dealDraftId, buyerUserId
  });

  try {
    const prisma = getPrisma();

    // Verify broker has access to this listing
    const invitation = await prisma.brokerInvitation.findFirst({
      where: {
        dealDraftId,
        respondedByUserId: authUser.id,
        status: 'ACCEPTED'
      }
    });

    if (!invitation) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Access denied - not the listing broker' }));
      return;
    }

    // Check if conversation exists between broker and buyer for this deal
    // We need to find a conversation where BOTH participants are present
    let conversation = await prisma.conversation.findFirst({
      where: {
        type: 'DEAL_INQUIRY',
        dealDraftId,
        AND: [
          { participants: { some: { userId: authUser.id } } },
          { participants: { some: { userId: buyerUserId } } }
        ]
      }
    });

    let isNew = false;

    if (!conversation) {
      // Get buyer and deal info for conversation name
      const buyer = await prisma.authUser.findUnique({
        where: { id: buyerUserId },
        select: { name: true }
      });

      const deal = await prisma.dealDraft.findUnique({
        where: { id: dealDraftId },
        select: { propertyName: true }
      });

      // Create new conversation
      conversation = await prisma.conversation.create({
        data: {
          type: 'DEAL_INQUIRY',
          name: `Inquiry: ${deal?.propertyName || 'Property'} - ${buyer?.name || 'Buyer'}`,
          dealDraftId,
          participants: {
            create: [
              { userId: authUser.id },
              { userId: buyerUserId }
            ]
          }
        }
      });

      isNew = true;
      console.log('[BrokerDashboard] Created new inquiry thread', { conversationId: conversation.id });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      conversationId: conversation.id,
      isNew
    }));
  } catch (error) {
    console.error('[BrokerDashboard] Error getting inquiry thread', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Failed to get thread', error: error.message }));
  }
}

/**
 * Route dispatcher for /api/broker/* endpoints
 */
export function dispatchBrokerDashboardRoutes(req, res, segments, readJsonBody, authUser) {
  const method = req.method;

  // Require broker role (includes Broker and Brokerage Admin)
  if (!isBrokerRole(authUser.role)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Broker role required' }));
    return;
  }

  // segments = ['broker', ...]
  const subPath = segments.slice(1); // Remove 'broker' prefix

  // GET /api/broker/dashboard
  if (method === 'GET' && subPath[0] === 'dashboard' && subPath.length === 1) {
    return handleGetDashboard(req, res, authUser);
  }

  // GET /api/broker/activity
  if (method === 'GET' && subPath[0] === 'activity' && subPath.length === 1) {
    return handleGetActivity(req, res, authUser);
  }

  // GET /api/broker/unread-count
  if (method === 'GET' && subPath[0] === 'unread-count' && subPath.length === 1) {
    return handleGetUnreadCount(req, res, authUser);
  }

  // GET /api/broker/new-inquiries
  if (method === 'GET' && subPath[0] === 'new-inquiries' && subPath.length === 1) {
    return handleGetNewInquiries(req, res, authUser);
  }

  // GET /api/broker/listings/:dealDraftId/inquiries
  if (method === 'GET' && subPath[0] === 'listings' && subPath[2] === 'inquiries' && subPath.length === 3) {
    return handleGetListingInquiries(req, res, authUser, subPath[1]);
  }

  // GET /api/broker/inquiry/:dealDraftId/:buyerUserId/thread
  if (method === 'GET' && subPath[0] === 'inquiry' && subPath[3] === 'thread' && subPath.length === 4) {
    return handleGetInquiryThread(req, res, authUser, subPath[1], subPath[2]);
  }

  // 404 - route not found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Broker route not found' }));
}

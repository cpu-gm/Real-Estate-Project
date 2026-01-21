/**
 * Intake Read Model Assembler
 *
 * Aggregates UI-shaped payloads for intake screens.
 */

import { PrismaClient } from '@prisma/client';
import { permissionGateService, AUTH_STATUSES, NDA_STATUSES } from './permission-gate.js';

const prisma = new PrismaClient();

const READ_MODEL_VERSION = 'intake.readmodel.v1';
const INTERESTED_RESPONSES = ['INTERESTED', 'INTERESTED_WITH_CONDITIONS'];

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeEvent(event) {
  const parsed = safeJsonParse(event.eventData);
  const hasAuditShape = parsed && typeof parsed === 'object' &&
    (parsed.action || parsed.beforeState || parsed.afterState || parsed.metadata);

  return {
    id: event.id,
    dealId: event.dealDraftId,
    action: hasAuditShape ? parsed.action || event.eventType : event.eventType,
    actor: {
      id: event.actorId,
      name: event.actorName,
      role: event.actorRole
    },
    occurredAt: event.occurredAt || event.createdAt || event.updatedAt,
    beforeState: hasAuditShape ? parsed.beforeState || null : null,
    afterState: hasAuditShape ? parsed.afterState || null : null,
    metadata: hasAuditShape ? parsed.metadata || {} : parsed || {}
  };
}

function summarizeCounts(deals) {
  const byStatus = {};
  for (const deal of deals) {
    byStatus[deal.status] = (byStatus[deal.status] || 0) + 1;
  }
  return byStatus;
}

function computeDealBlockers({ dealDraft, documents, latestOmVersion, distribution, interestedCount }) {
  const blockers = [];
  const hasTeaser = documents.some(doc => doc.classifiedType === 'OFFERING_MEMO');

  if (!dealDraft.propertyName || !dealDraft.propertyAddress) {
    blockers.push({
      code: 'MISSING_PROPERTY_INFO',
      message: 'Property name or address is missing.',
      reason: 'Required to market the deal and match buyers.',
      severity: 'HIGH'
    });
  }

  if (!hasTeaser) {
    blockers.push({
      code: 'MISSING_TEASER',
      message: 'No teaser or offering memo uploaded.',
      reason: 'Buyers cannot view a shareable preview without a teaser.',
      severity: 'HIGH'
    });
  }

  if (!dealDraft.seller) {
    blockers.push({
      code: 'MISSING_SELLER',
      message: 'Seller is not set.',
      reason: 'Seller approvals and distribution policies require a seller record.',
      severity: 'MEDIUM'
    });
  }

  if (!latestOmVersion) {
    blockers.push({
      code: 'MISSING_OM',
      message: 'Offering memo has not been generated.',
      reason: 'Distribution requires a draft OM to review and approve.',
      severity: 'HIGH'
    });
  }

  if (dealDraft.status === 'OM_APPROVED_FOR_MARKETING' && !distribution) {
    blockers.push({
      code: 'MISSING_DISTRIBUTION',
      message: 'Deal has not been distributed to buyers.',
      reason: 'Distribution is required to start buyer outreach.',
      severity: 'MEDIUM'
    });
  }

  if (dealDraft.status === 'DISTRIBUTED' && interestedCount === 0) {
    blockers.push({
      code: 'NO_BUYER_INTEREST',
      message: 'No interested buyers yet.',
      reason: 'Access requests cannot start without buyer interest.',
      severity: 'LOW'
    });
  }

  return blockers;
}

function computePermissions({ dealDraft, brokerRecord, sellerRecord, buyerRecipient, buyerResponse, buyerAuthorization }) {
  const isBroker = Boolean(brokerRecord);
  const isSeller = Boolean(sellerRecord);
  const isBuyer = Boolean(buyerRecipient || buyerResponse || buyerAuthorization);
  const canApproveOM = Boolean(
    (isSeller && sellerRecord?.requiresOMApproval) ||
    (isBroker && brokerRecord?.canApproveOM)
  );
  const canDistribute = Boolean(isBroker && brokerRecord?.canDistribute);
  const canAuthorizeBuyers = Boolean(
    (isBroker && brokerRecord?.canAuthorize) ||
    (isSeller && sellerRecord?.requiresBuyerApproval)
  );
  const canViewBuyerIdentity = Boolean(
    isBroker || (isSeller && sellerRecord?.sellerSeesBuyerIdentity)
  );

  return {
    isBroker,
    isSeller,
    isBuyer,
    canApproveOM,
    canDistribute,
    canAuthorizeBuyers,
    canViewBuyerIdentity,
    canViewDeal: isBroker || isSeller || isBuyer
  };
}

function computeNextActions({ dealDraft, permissions, blockers, pendingAccessCount, buyerNeedsResponse }) {
  const actions = [];

  if (dealDraft.status === 'DRAFT_INGESTED' && permissions.isBroker) {
    actions.push({
      id: 'UPLOAD_TEASER',
      label: 'Upload teaser / OM inputs',
      reason: blockers.some(b => b.code === 'MISSING_TEASER')
        ? 'Teaser missing'
        : 'Complete intake materials'
    });
  }

  if (dealDraft.status === 'OM_DRAFTED' && permissions.isBroker) {
    actions.push({
      id: 'BROKER_APPROVE_OM',
      label: 'Broker approve OM',
      reason: 'OM draft ready for broker approval'
    });
  }

  if (dealDraft.status === 'OM_BROKER_APPROVED' && permissions.isSeller) {
    actions.push({
      id: 'SELLER_APPROVE_OM',
      label: 'Seller approve OM',
      reason: 'Seller approval required before distribution'
    });
  }

  if (dealDraft.status === 'OM_APPROVED_FOR_MARKETING' && permissions.canDistribute) {
    actions.push({
      id: 'CREATE_DISTRIBUTION',
      label: 'Distribute to buyers',
      reason: 'Deal approved for marketing'
    });
  }

  if (dealDraft.status === 'DISTRIBUTED' && permissions.canAuthorizeBuyers && pendingAccessCount > 0) {
    actions.push({
      id: 'REVIEW_ACCESS_REQUESTS',
      label: 'Review access requests',
      reason: `${pendingAccessCount} buyer request(s) pending`
    });
  }

  if (dealDraft.status === 'DISTRIBUTED' && permissions.isBuyer && buyerNeedsResponse) {
    actions.push({
      id: 'SUBMIT_RESPONSE',
      label: 'Respond to deal',
      reason: 'Preview available'
    });
  }

  return actions;
}

async function resolveIntakeDealAccess(dealDraftId, authUser, options = {}) {
  const dealDraft = await prisma.dealDraft.findUnique({
    where: { id: dealDraftId },
    include: {
      brokers: true,
      seller: true,
      documents: {
        select: { id: true, classifiedType: true, status: true, createdAt: true }
      },
      omVersions: {
        orderBy: { versionNumber: 'desc' },
        take: 1
      },
      distributions: {
        orderBy: { distributedAt: 'desc' },
        take: 1
      }
    }
  });

  if (!dealDraft) {
    throw createHttpError(404, 'Deal draft not found');
  }

  const brokerRecord = dealDraft.brokers.find(b => b.userId === authUser.id) || null;
  const sellerRecord = dealDraft.seller?.userId === authUser.id ? dealDraft.seller : null;

  const [buyerRecipient, buyerResponse, buyerAuthorization] = await Promise.all([
    prisma.distributionRecipient.findFirst({
      where: {
        buyerUserId: authUser.id,
        distribution: { dealDraftId }
      }
    }),
    prisma.buyerResponse.findUnique({
      where: {
        dealDraftId_buyerUserId: { dealDraftId, buyerUserId: authUser.id }
      }
    }),
    prisma.buyerAuthorization.findUnique({
      where: {
        dealDraftId_buyerUserId: { dealDraftId, buyerUserId: authUser.id }
      }
    })
  ]);

  const isBuyer = Boolean(buyerRecipient || buyerResponse || buyerAuthorization);
  const isBroker = Boolean(brokerRecord);
  const isSeller = Boolean(sellerRecord);

  if (!isBroker && !isSeller && !isBuyer) {
    throw createHttpError(403, 'Access denied');
  }

  if ((isBroker || isSeller) && dealDraft.organizationId !== authUser.organizationId) {
    throw createHttpError(403, 'Access denied - deal belongs to different organization');
  }

  if (options.requireBrokerOrSeller && !isBroker && !isSeller) {
    throw createHttpError(403, 'Broker or seller role required');
  }

  return {
    dealDraft,
    brokerRecord,
    sellerRecord,
    buyerRecipient,
    buyerResponse,
    buyerAuthorization,
    roles: { isBroker, isSeller, isBuyer }
  };
}

function maskBuyerIdentity(buyer, canViewIdentity) {
  if (!buyer) return null;
  if (canViewIdentity) return buyer;

  return {
    id: null,
    name: buyer.anonymousLabel || 'Anonymous Buyer',
    email: null,
    firmName: buyer.isAnonymous ? buyer.anonymousLabel || 'Anonymous Buyer' : null
  };
}

export async function buildDashboardReadModel(authUser) {
  const [
    brokerLinks,
    sellerLinks,
    buyerRecipients,
    buyerResponses,
    buyerAuthorizations
  ] = await Promise.all([
    prisma.dealDraftBroker.findMany({
      where: { userId: authUser.id },
      select: { dealDraftId: true }
    }),
    prisma.dealDraftSeller.findMany({
      where: { userId: authUser.id },
      select: { dealDraftId: true }
    }),
    prisma.distributionRecipient.findMany({
      where: { buyerUserId: authUser.id },
      select: { distribution: { select: { dealDraftId: true } }, responseId: true }
    }),
    prisma.buyerResponse.findMany({
      where: { buyerUserId: authUser.id },
      select: { dealDraftId: true, response: true }
    }),
    prisma.buyerAuthorization.findMany({
      where: { buyerUserId: authUser.id },
      select: { dealDraftId: true, status: true, ndaStatus: true }
    })
  ]);

  const dealIds = new Set();
  brokerLinks.forEach(link => dealIds.add(link.dealDraftId));
  sellerLinks.forEach(link => dealIds.add(link.dealDraftId));
  buyerRecipients.forEach(link => dealIds.add(link.distribution.dealDraftId));
  buyerResponses.forEach(link => dealIds.add(link.dealDraftId));
  buyerAuthorizations.forEach(link => dealIds.add(link.dealDraftId));

  if (dealIds.size === 0) {
    throw createHttpError(403, 'No intake deals assigned');
  }

  const dealIdList = Array.from(dealIds);

  const deals = await prisma.dealDraft.findMany({
    where: { id: { in: dealIdList } },
    include: {
      brokers: true,
      seller: true,
      documents: {
        select: { id: true, classifiedType: true, status: true, createdAt: true }
      },
      omVersions: {
        orderBy: { versionNumber: 'desc' },
        take: 1
      },
      distributions: {
        orderBy: { distributedAt: 'desc' },
        take: 1
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  const interestedResponses = await prisma.buyerResponse.findMany({
    where: {
      dealDraftId: { in: dealIdList },
      response: { in: INTERESTED_RESPONSES }
    },
    select: { dealDraftId: true, buyerUserId: true }
  });

  const interestedBuyerIds = Array.from(
    new Set(interestedResponses.map(item => item.buyerUserId))
  );

  const authorizationStatuses = await prisma.buyerAuthorization.findMany({
    where: {
      dealDraftId: { in: dealIdList },
      buyerUserId: { in: interestedBuyerIds }
    },
    select: { dealDraftId: true, buyerUserId: true, status: true }
  });

  const authorizationByPair = new Map(
    authorizationStatuses.map(auth => [`${auth.dealDraftId}:${auth.buyerUserId}`, auth.status])
  );

  const pendingAccessCounts = {};
  const interestedCounts = {};

  for (const response of interestedResponses) {
    interestedCounts[response.dealDraftId] = (interestedCounts[response.dealDraftId] || 0) + 1;
    const key = `${response.dealDraftId}:${response.buyerUserId}`;
    const status = authorizationByPair.get(key);
    if (!status || status === AUTH_STATUSES.PENDING) {
      pendingAccessCounts[response.dealDraftId] = (pendingAccessCounts[response.dealDraftId] || 0) + 1;
    }
  }

  const recentEvents = await prisma.dealIntakeEventLog.findMany({
    where: { dealDraftId: { in: dealIdList } },
    orderBy: { occurredAt: 'desc' },
    take: 50
  });

  const lastActivityByDeal = new Map();
  for (const event of recentEvents) {
    if (!lastActivityByDeal.has(event.dealDraftId)) {
      lastActivityByDeal.set(event.dealDraftId, event.occurredAt || event.createdAt);
    }
  }

  const buyerRecipientByDeal = new Map(
    buyerRecipients.map(recipient => [recipient.distribution.dealDraftId, recipient])
  );
  const buyerResponseByDeal = new Map(
    buyerResponses.map(response => [response.dealDraftId, response])
  );
  const buyerAuthorizationByDeal = new Map(
    buyerAuthorizations.map(auth => [auth.dealDraftId, auth])
  );

  const actionQueue = [];
  const dealSummaries = deals.map(deal => {
    const brokerRecord = deal.brokers.find(b => b.userId === authUser.id) || null;
    const sellerRecord = deal.seller?.userId === authUser.id ? deal.seller : null;
    const buyerRecipient = buyerRecipientByDeal.get(deal.id) || null;
    const buyerResponse = buyerResponseByDeal.get(deal.id) || null;
    const buyerAuthorization = buyerAuthorizationByDeal.get(deal.id) || null;
    const latestOmVersion = deal.omVersions[0] || null;
    const distribution = deal.distributions[0] || null;

    const permissions = computePermissions({
      dealDraft: deal,
      brokerRecord,
      sellerRecord,
      buyerRecipient,
      buyerResponse,
      buyerAuthorization
    });

    const blockers = computeDealBlockers({
      dealDraft: deal,
      documents: deal.documents || [],
      latestOmVersion,
      distribution,
      interestedCount: interestedCounts[deal.id] || 0
    });

    const buyerNeedsResponse = permissions.isBuyer && (!buyerResponse || !buyerResponse.response);
    const nextActions = computeNextActions({
      dealDraft: deal,
      permissions,
      blockers,
      pendingAccessCount: pendingAccessCounts[deal.id] || 0,
      buyerNeedsResponse
    });

    nextActions.forEach(action => {
      actionQueue.push({
        dealId: deal.id,
        actionId: action.id,
        label: action.label,
        reason: action.reason
      });
    });

    return {
      dealId: deal.id,
      propertyName: deal.propertyName,
      propertyAddress: deal.propertyAddress,
      assetType: deal.assetType,
      askingPrice: deal.askingPrice,
      status: deal.status,
      listingType: deal.listingType,
      myRoles: [
        permissions.isBroker ? 'BROKER' : null,
        permissions.isSeller ? 'SELLER' : null,
        permissions.isBuyer ? 'BUYER' : null
      ].filter(Boolean),
      lastActivityAt: lastActivityByDeal.get(deal.id) || deal.updatedAt,
      blockers,
      permissions,
      availableActions: nextActions.map(action => action.id),
      stats: {
        documents: deal.documents?.length || 0,
        interestedBuyers: interestedCounts[deal.id] || 0,
        pendingAccessRequests: pendingAccessCounts[deal.id] || 0
      }
    };
  });

  return {
    version: READ_MODEL_VERSION,
    viewer: {
      id: authUser.id,
      organizationId: authUser.organizationId
    },
    counts: {
      totalDeals: dealSummaries.length,
      needsAttention: actionQueue.length,
      byStatus: summarizeCounts(dealSummaries)
    },
    actionQueue,
    deals: dealSummaries,
    recentActivity: recentEvents.slice(0, 20).map(normalizeEvent)
  };
}

export async function buildDealOverviewReadModel(dealDraftId, authUser) {
  const access = await resolveIntakeDealAccess(dealDraftId, authUser);
  const { dealDraft, brokerRecord, sellerRecord, buyerRecipient, buyerResponse, buyerAuthorization } = access;
  const latestOmVersion = dealDraft.omVersions[0] || null;
  const distribution = dealDraft.distributions[0] || null;

  const [recipientCount, interestedCount, pendingAccessCount] = await Promise.all([
    prisma.distributionRecipient.count({
      where: { distribution: { dealDraftId } }
    }),
    prisma.buyerResponse.count({
      where: { dealDraftId, response: { in: INTERESTED_RESPONSES } }
    }),
    prisma.buyerAuthorization.count({
      where: { dealDraftId, status: AUTH_STATUSES.PENDING }
    })
  ]);

  const permissions = computePermissions({
    dealDraft,
    brokerRecord,
    sellerRecord,
    buyerRecipient,
    buyerResponse,
    buyerAuthorization
  });

  const blockers = computeDealBlockers({
    dealDraft,
    documents: dealDraft.documents || [],
    latestOmVersion,
    distribution,
    interestedCount
  });

  const buyerNeedsResponse = permissions.isBuyer && (!buyerResponse || !buyerResponse.response);
  const nextActions = computeNextActions({
    dealDraft,
    permissions,
    blockers,
    pendingAccessCount,
    buyerNeedsResponse
  });

  const documentCounts = {};
  for (const doc of dealDraft.documents || []) {
    const type = doc.classifiedType || 'OTHER';
    documentCounts[type] = (documentCounts[type] || 0) + 1;
  }

  const events = await prisma.dealIntakeEventLog.findMany({
    where: { dealDraftId },
    orderBy: { occurredAt: 'desc' },
    take: 20
  });

  return {
    version: READ_MODEL_VERSION,
    deal: {
      id: dealDraft.id,
      propertyName: dealDraft.propertyName,
      propertyAddress: dealDraft.propertyAddress,
      assetType: dealDraft.assetType,
      askingPrice: dealDraft.askingPrice,
      unitCount: dealDraft.unitCount,
      totalSF: dealDraft.totalSF,
      listingType: dealDraft.listingType,
      status: dealDraft.status,
      isAnonymousSeller: dealDraft.isAnonymousSeller
    },
    participants: {
      brokerCount: dealDraft.brokers?.length || 0,
      sellerAssigned: Boolean(dealDraft.seller),
      recipientCount,
      interestedCount
    },
    currentState: {
      status: dealDraft.status,
      updatedAt: dealDraft.updatedAt
    },
    permissions,
    availableActions: nextActions.map(action => action.id),
    blockers,
    nextActions,
    keyDocuments: {
      total: dealDraft.documents?.length || 0,
      byType: documentCounts,
      hasTeaser: Boolean(documentCounts.OFFERING_MEMO)
    },
    omStatus: latestOmVersion ? {
      id: latestOmVersion.id,
      versionNumber: latestOmVersion.versionNumber,
      status: latestOmVersion.status,
      brokerApprovedAt: latestOmVersion.brokerApprovedAt,
      sellerApprovedAt: latestOmVersion.sellerApprovedAt
    } : null,
    distribution: distribution ? {
      id: distribution.id,
      listingType: distribution.listingType,
      distributedAt: distribution.distributedAt,
      recipientCount
    } : null,
    activity: events.map(normalizeEvent)
  };
}

export async function buildAccessRequestsReadModel(dealDraftId, authUser) {
  const access = await resolveIntakeDealAccess(dealDraftId, authUser, { requireBrokerOrSeller: true });
  const { dealDraft, brokerRecord, sellerRecord } = access;

  const permissions = computePermissions({
    dealDraft,
    brokerRecord,
    sellerRecord,
    buyerRecipient: null,
    buyerResponse: null,
    buyerAuthorization: null
  });

  const [reviewQueue, authorizations, interestedCount] = await Promise.all([
    permissionGateService.getReviewQueue(dealDraftId, { pendingOnly: true }),
    permissionGateService.getAuthorizationsForDeal(dealDraftId),
    prisma.buyerResponse.count({
      where: { dealDraftId, response: { in: INTERESTED_RESPONSES } }
    })
  ]);

  const pendingRequests = reviewQueue.map(item => ({
    buyer: maskBuyerIdentity(item.buyer, permissions.canViewBuyerIdentity),
    response: {
      response: item.response.response,
      indicativePriceMin: item.response.indicativePriceMin,
      indicativePriceMax: item.response.indicativePriceMax,
      intendedStructure: item.response.intendedStructure,
      questionsForBroker: item.response.questionsForBroker,
      conditions: item.response.conditions,
      respondedAt: item.response.respondedAt
    },
    authorization: {
      status: item.authorization.status,
      ndaStatus: item.authorization.ndaStatus,
      dataRoomAccessGranted: item.authorization.dataRoomAccessGranted
    },
    aiScore: item.aiScore,
    matchType: item.matchType,
    viewedAt: item.viewedAt
  }));

  const decisionHistory = authorizations.map(auth => ({
    buyer: maskBuyerIdentity(auth.buyer, permissions.canViewBuyerIdentity),
    status: auth.status,
    decidedBy: auth.authorizedBy || auth.declinedBy || auth.revokedBy,
    decidedByName: auth.authorizedByName || null,
    decidedAt: auth.authorizedAt || auth.declinedAt || auth.revokedAt || auth.createdAt,
    reason: auth.declineReason || auth.revokeReason || null,
    ndaStatus: auth.ndaStatus,
    dataRoomAccessGranted: auth.dataRoomAccessGranted,
    dataRoomAccessLevel: auth.dataRoomAccessLevel
  }));

  const approvers = [
    ...(dealDraft.brokers || [])
      .filter(broker => broker.canAuthorize)
      .map(broker => ({
        id: broker.userId,
        name: broker.name,
        role: 'BROKER'
      })),
    ...(dealDraft.seller?.requiresBuyerApproval
      ? [{
        id: dealDraft.seller.userId,
        name: dealDraft.seller.name,
        role: 'SELLER'
      }]
      : [])
  ];

  const distribution = dealDraft.distributions[0] || null;
  const blockers = computeDealBlockers({
    dealDraft,
    documents: dealDraft.documents || [],
    latestOmVersion: dealDraft.omVersions[0] || null,
    distribution,
    interestedCount
  });

  const events = await prisma.dealIntakeEventLog.findMany({
    where: {
      dealDraftId,
      eventType: {
        in: [
          'BUYER_AUTHORIZED',
          'BUYER_DECLINED',
          'BUYER_ACCESS_REVOKED',
          'NDA_SENT',
          'NDA_SIGNED',
          'DATA_ROOM_ACCESS_GRANTED'
        ]
      }
    },
    orderBy: { occurredAt: 'desc' },
    take: 25
  });

  return {
    version: READ_MODEL_VERSION,
    deal: {
      id: dealDraft.id,
      propertyName: dealDraft.propertyName,
      status: dealDraft.status,
      listingType: dealDraft.listingType
    },
    permissions: {
      ...permissions,
      canApproveAccess: permissions.canAuthorizeBuyers,
      canDeclineAccess: permissions.canAuthorizeBuyers,
      canRevokeAccess: permissions.canAuthorizeBuyers,
      canSendNda: permissions.canAuthorizeBuyers,
      canGrantDataRoomAccess: permissions.canAuthorizeBuyers
    },
    policy: {
      requiresBuyerApproval: dealDraft.seller?.requiresBuyerApproval || false,
      sellerSeesBuyerIdentity: dealDraft.seller?.sellerSeesBuyerIdentity ?? true,
      shareablePreview: Boolean(distribution),
      ndaRequired: true,
      accessLevels: ['STANDARD', 'FULL', 'CUSTOM']
    },
    approvers,
    pendingRequests,
    decisionHistory,
    blockers,
    recentActivity: events.map(normalizeEvent)
  };
}

export { READ_MODEL_VERSION };

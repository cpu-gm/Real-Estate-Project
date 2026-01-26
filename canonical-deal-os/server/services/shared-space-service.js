import crypto from 'crypto';
import { getPrisma } from '../db.js';
const prisma = getPrisma();

// ========== CORE SPACE MANAGEMENT ==========

export async function createSharedSpace(organizationId, data, createdBy) {
  const { name, description, matterId, dealId, expiresAt } = data;

  const space = await prisma.legalSharedSpace.create({
    data: {
      organizationId,
      name,
      description,
      matterId,
      dealId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy,
      isActive: true,
      // Auto-add creator as OWNER
      members: {
        create: {
          userId: createdBy,
          role: 'OWNER',
          invitedBy: createdBy,
        },
      },
    },
    include: {
      members: true,
      documents: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  return space;
}

export async function getSpaceWithMembers(spaceId, organizationId) {
  const space = await prisma.legalSharedSpace.findFirst({
    where: {
      id: spaceId,
      organizationId,
    },
    include: {
      members: {
        orderBy: { invitedAt: 'asc' },
      },
      documents: {
        orderBy: { addedAt: 'desc' },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });

  return space;
}

export async function updateSpace(spaceId, updates, organizationId) {
  const { name, description, isActive, expiresAt } = updates;

  const space = await prisma.legalSharedSpace.updateMany({
    where: {
      id: spaceId,
      organizationId,
    },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
    },
  });

  return space.count > 0;
}

export async function archiveSpace(spaceId, organizationId) {
  const space = await prisma.legalSharedSpace.updateMany({
    where: {
      id: spaceId,
      organizationId,
    },
    data: {
      isActive: false,
    },
  });

  return space.count > 0;
}

// ========== MEMBER MANAGEMENT ==========

export async function inviteInternalMember(spaceId, userId, role, invitedBy) {
  // Check if member already exists
  const existing = await prisma.legalSharedSpaceMember.findFirst({
    where: {
      spaceId,
      userId,
    },
  });

  if (existing) {
    throw new Error('User is already a member of this space');
  }

  const member = await prisma.legalSharedSpaceMember.create({
    data: {
      spaceId,
      userId,
      role,
      invitedBy,
    },
  });

  return member;
}

export async function inviteExternalMember(spaceId, email, name, role, vendorId, invitedBy) {
  // Check if external member already exists
  const existing = await prisma.legalSharedSpaceMember.findFirst({
    where: {
      spaceId,
      externalEmail: email,
    },
  });

  if (existing) {
    throw new Error('External member with this email is already invited');
  }

  // Generate secure access token
  const accessToken = generateExternalAccessToken();

  const member = await prisma.legalSharedSpaceMember.create({
    data: {
      spaceId,
      externalEmail: email,
      externalName: name,
      vendorId,
      role,
      accessToken,
      invitedBy,
    },
  });

  return member;
}

export function generateExternalAccessToken() {
  // Generate cryptographically secure 64-character token
  return crypto.randomBytes(32).toString('hex');
}

export async function validateExternalToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const member = await prisma.legalSharedSpaceMember.findFirst({
    where: {
      accessToken: token,
    },
    include: {
      space: true,
    },
  });

  if (!member) {
    return null;
  }

  // Check if space is active
  if (!member.space.isActive) {
    return null;
  }

  // Check if space has expired
  if (member.space.expiresAt && new Date() > member.space.expiresAt) {
    return null;
  }

  return member;
}

export async function updateMemberRole(spaceId, memberId, newRole) {
  const member = await prisma.legalSharedSpaceMember.updateMany({
    where: {
      id: memberId,
      spaceId,
    },
    data: {
      role: newRole,
    },
  });

  return member.count > 0;
}

export async function removeMember(spaceId, memberId) {
  const member = await prisma.legalSharedSpaceMember.deleteMany({
    where: {
      id: memberId,
      spaceId,
    },
  });

  return member.count > 0;
}

export async function recordMemberAccess(memberId) {
  await prisma.legalSharedSpaceMember.update({
    where: {
      id: memberId,
    },
    data: {
      lastAccessAt: new Date(),
    },
  });
}

// ========== DOCUMENT MANAGEMENT ==========

export async function addDocumentToSpace(spaceId, documentData, addedBy) {
  const { title, documentUrl, documentId } = documentData;

  const document = await prisma.legalSharedSpaceDocument.create({
    data: {
      spaceId,
      title,
      documentUrl,
      documentId,
      addedBy,
    },
  });

  return document;
}

export async function removeDocumentFromSpace(spaceId, documentId) {
  const document = await prisma.legalSharedSpaceDocument.deleteMany({
    where: {
      id: documentId,
      spaceId,
    },
  });

  return document.count > 0;
}

export async function getSpaceDocuments(spaceId) {
  const documents = await prisma.legalSharedSpaceDocument.findMany({
    where: {
      spaceId,
    },
    orderBy: {
      addedAt: 'desc',
    },
  });

  return documents;
}

// ========== MESSAGING ==========

export async function sendSpaceMessage(spaceId, content, author, isExternal = false, parentId = null) {
  const { id, name, email } = author;

  const message = await prisma.legalSharedSpaceMessage.create({
    data: {
      spaceId,
      content,
      authorId: isExternal ? null : id,
      authorName: name,
      authorEmail: email,
      isExternal,
      parentId,
    },
  });

  return message;
}

export async function getSpaceMessages(spaceId, cursor = null, limit = 50) {
  const where = {
    spaceId,
  };

  if (cursor) {
    where.createdAt = {
      lt: new Date(cursor),
    };
  }

  const messages = await prisma.legalSharedSpaceMessage.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  return messages;
}

// ========== ACTIVITY LOGGING ==========

export async function logSpaceActivity(spaceId, activityType, actorId, actorName, metadata = {}) {
  // For now, we'll log activities as special system messages
  // In a real implementation, you might have a separate LegalSharedSpaceActivity table

  const activityMessage = formatActivityMessage(activityType, actorName, metadata);

  await prisma.legalSharedSpaceMessage.create({
    data: {
      spaceId,
      content: activityMessage,
      authorId: actorId,
      authorName: 'System',
      isExternal: false,
    },
  });
}

export async function getSpaceActivity(spaceId, limit = 20) {
  // Return recent messages that represent activities
  const activities = await prisma.legalSharedSpaceMessage.findMany({
    where: {
      spaceId,
      authorName: 'System',
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });

  return activities;
}

// ========== HELPERS ==========

function formatActivityMessage(activityType, actorName, metadata) {
  switch (activityType) {
    case 'MEMBER_JOINED':
      return `${metadata.memberName || actorName} joined the space`;
    case 'MEMBER_REMOVED':
      return `${metadata.memberName} was removed from the space`;
    case 'MEMBER_ROLE_CHANGED':
      return `${metadata.memberName}'s role was changed to ${metadata.newRole}`;
    case 'DOCUMENT_ADDED':
      return `${actorName} added document: ${metadata.documentTitle}`;
    case 'DOCUMENT_REMOVED':
      return `${actorName} removed document: ${metadata.documentTitle}`;
    case 'SPACE_UPDATED':
      return `${actorName} updated space settings`;
    default:
      return `${actorName} performed an action`;
  }
}

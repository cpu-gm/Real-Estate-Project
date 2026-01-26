import { requireGPCounsel, sendJson, sendError, logPermissionAction, AUDIT_ACTIONS } from '../middleware/auth.js';
import * as sharedSpaceService from '../services/shared-space-service.js';

// ========== SPACE CRUD ==========

export async function handleListSpaces(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { matterId, dealId, isActive } = req.query;

    const where = {
      organizationId: authUser.organizationId,
    };

    if (matterId) where.matterId = matterId;
    if (dealId) where.dealId = dealId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const { prisma } = await import('../kernel.js');
    const spaces = await prisma.legalSharedSpace.findMany({
      where,
      include: {
        members: true,
        documents: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    sendJson(res, { spaces });
  } catch (error) {
    console.error('Error listing shared spaces:', error);
    sendError(res, 500, 'Failed to list shared spaces', 'SPACE_LIST_FAILED');
  }
}

export async function handleCreateSpace(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { name, description, matterId, dealId, expiresAt } = req.body;

    if (!name) {
      return sendError(res, 400, 'Space name is required', 'VALIDATION_FAILED');
    }

    const space = await sharedSpaceService.createSharedSpace(
      authUser.organizationId,
      { name, description, matterId, dealId, expiresAt },
      authUser.id
    );

    // TODO: Add audit logging for space creation
    // await logPermissionAction({
    //   actorId: authUser.id,
    //   action: 'SHARED_SPACE_CREATED',
    //   resource: 'LegalSharedSpace',
    //   resourceId: space.id,
    //   afterValue: JSON.stringify({ name, matterId, dealId })
    // });

    sendJson(res, { space }, 201);
  } catch (error) {
    console.error('Error creating shared space:', error);
    sendError(res, 500, 'Failed to create shared space', 'SPACE_CREATE_FAILED');
  }
}

export async function handleGetSpace(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id } = req.params;

    const space = await sharedSpaceService.getSpaceWithMembers(id, authUser.organizationId);

    if (!space) {
      return sendError(res, 404, 'Shared space not found', 'SPACE_NOT_FOUND');
    }

    sendJson(res, { space });
  } catch (error) {
    console.error('Error getting shared space:', error);
    sendError(res, 500, 'Failed to get shared space', 'SPACE_GET_FAILED');
  }
}

export async function handleUpdateSpace(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id } = req.params;
    const { name, description, isActive, expiresAt } = req.body;

    // Verify user is owner
    const { prisma } = await import('../kernel.js');
    const membership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
        role: 'OWNER',
      },
    });

    if (!membership) {
      return sendError(res, 403, 'Only space owners can update settings', 'FORBIDDEN_ROLE');
    }

    const updated = await sharedSpaceService.updateSpace(
      id,
      { name, description, isActive, expiresAt },
      authUser.organizationId
    );

    if (!updated) {
      return sendError(res, 404, 'Shared space not found', 'SPACE_NOT_FOUND');
    }

    await sharedSpaceService.logSpaceActivity(
      id,
      'SPACE_UPDATED',
      authUser.id,
      authUser.name,
      {}
    );

    sendJson(res, { success: true });
  } catch (error) {
    console.error('Error updating shared space:', error);
    sendError(res, 500, 'Failed to update shared space', 'SPACE_UPDATE_FAILED');
  }
}

export async function handleDeleteSpace(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id } = req.params;

    // Verify user is owner
    const { prisma } = await import('../kernel.js');
    const membership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
        role: 'OWNER',
      },
    });

    if (!membership) {
      return sendError(res, 403, 'Only space owners can delete spaces', 'FORBIDDEN_ROLE');
    }

    const deleted = await sharedSpaceService.archiveSpace(id, authUser.organizationId);

    if (!deleted) {
      return sendError(res, 404, 'Shared space not found', 'SPACE_NOT_FOUND');
    }

    // TODO: Add audit logging for space deletion
    // await logPermissionAction({
    //   actorId: authUser.id,
    //   action: 'SHARED_SPACE_DELETED',
    //   resource: 'LegalSharedSpace',
    //   resourceId: id
    // });

    sendJson(res, { success: true });
  } catch (error) {
    console.error('Error deleting shared space:', error);
    sendError(res, 500, 'Failed to delete shared space', 'SPACE_DELETE_FAILED');
  }
}

// ========== MEMBER MANAGEMENT ==========

export async function handleAddMember(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id } = req.params;
    const { userId, externalEmail, externalName, role, vendorId } = req.body;

    if (!role || !['OWNER', 'COLLABORATOR', 'VIEWER'].includes(role)) {
      return sendError(res, 400, 'Invalid role. Must be OWNER, COLLABORATOR, or VIEWER', 'VALIDATION_FAILED');
    }

    // Verify user is owner or collaborator
    const { prisma } = await import('../kernel.js');
    const membership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
        role: { in: ['OWNER', 'COLLABORATOR'] },
      },
    });

    if (!membership) {
      return sendError(res, 403, 'Only owners and collaborators can add members', 'FORBIDDEN_ROLE');
    }

    let member;
    if (userId) {
      // Internal member
      member = await sharedSpaceService.inviteInternalMember(id, userId, role, authUser.id);

      await sharedSpaceService.logSpaceActivity(
        id,
        'MEMBER_JOINED',
        authUser.id,
        authUser.name,
        { memberName: member.userId }
      );
    } else if (externalEmail) {
      // External member
      if (!externalName) {
        return sendError(res, 400, 'External member name is required', 'VALIDATION_FAILED');
      }

      member = await sharedSpaceService.inviteExternalMember(
        id,
        externalEmail,
        externalName,
        role,
        vendorId,
        authUser.id
      );

      await sharedSpaceService.logSpaceActivity(
        id,
        'MEMBER_JOINED',
        authUser.id,
        authUser.name,
        { memberName: externalName }
      );
    } else {
      return sendError(res, 400, 'Either userId or externalEmail is required', 'VALIDATION_FAILED');
    }

    // TODO: Add audit logging for member addition
    // await logPermissionAction({
    //   actorId: authUser.id,
    //   action: 'SHARED_SPACE_MEMBER_ADDED',
    //   resource: 'LegalSharedSpaceMember',
    //   resourceId: member.id,
    //   afterValue: JSON.stringify({ spaceId: id, role })
    // });

    sendJson(res, { member }, 201);
  } catch (error) {
    if (error.message.includes('already')) {
      return sendError(res, 409, error.message, 'MEMBER_EXISTS');
    }
    console.error('Error adding member:', error);
    sendError(res, 500, 'Failed to add member', 'MEMBER_ADD_FAILED');
  }
}

export async function handleRemoveMember(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id, memberId } = req.params;

    // Verify user is owner
    const { prisma } = await import('../kernel.js');
    const ownership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
        role: 'OWNER',
      },
    });

    if (!ownership) {
      return sendError(res, 403, 'Only space owners can remove members', 'FORBIDDEN_ROLE');
    }

    // Get member info before deletion
    const memberToRemove = await prisma.legalSharedSpaceMember.findFirst({
      where: { id: memberId, spaceId: id },
    });

    const removed = await sharedSpaceService.removeMember(id, memberId);

    if (!removed) {
      return sendError(res, 404, 'Member not found', 'MEMBER_NOT_FOUND');
    }

    await sharedSpaceService.logSpaceActivity(
      id,
      'MEMBER_REMOVED',
      authUser.id,
      authUser.name,
      { memberName: memberToRemove?.externalName || memberToRemove?.userId || 'Unknown' }
    );

    sendJson(res, { success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    sendError(res, 500, 'Failed to remove member', 'MEMBER_REMOVE_FAILED');
  }
}

export async function handleUpdateMemberRole(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id, memberId } = req.params;
    const { role } = req.body;

    if (!role || !['OWNER', 'COLLABORATOR', 'VIEWER'].includes(role)) {
      return sendError(res, 400, 'Invalid role', 'VALIDATION_FAILED');
    }

    // Verify user is owner
    const { prisma } = await import('../kernel.js');
    const ownership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
        role: 'OWNER',
      },
    });

    if (!ownership) {
      return sendError(res, 403, 'Only space owners can change member roles', 'FORBIDDEN_ROLE');
    }

    // Get member info
    const member = await prisma.legalSharedSpaceMember.findFirst({
      where: { id: memberId, spaceId: id },
    });

    const updated = await sharedSpaceService.updateMemberRole(id, memberId, role);

    if (!updated) {
      return sendError(res, 404, 'Member not found', 'MEMBER_NOT_FOUND');
    }

    await sharedSpaceService.logSpaceActivity(
      id,
      'MEMBER_ROLE_CHANGED',
      authUser.id,
      authUser.name,
      { memberName: member?.externalName || member?.userId || 'Unknown', newRole: role }
    );

    sendJson(res, { success: true });
  } catch (error) {
    console.error('Error updating member role:', error);
    sendError(res, 500, 'Failed to update member role', 'MEMBER_UPDATE_FAILED');
  }
}

// ========== DOCUMENT MANAGEMENT ==========

export async function handleAddDocument(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id } = req.params;
    const { title, documentUrl, documentId } = req.body;

    if (!title) {
      return sendError(res, 400, 'Document title is required', 'VALIDATION_FAILED');
    }

    // Verify user is owner or collaborator
    const { prisma } = await import('../kernel.js');
    const membership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
        role: { in: ['OWNER', 'COLLABORATOR'] },
      },
    });

    if (!membership) {
      return sendError(res, 403, 'Only owners and collaborators can add documents', 'FORBIDDEN_ROLE');
    }

    const document = await sharedSpaceService.addDocumentToSpace(
      id,
      { title, documentUrl, documentId },
      authUser.id
    );

    await sharedSpaceService.logSpaceActivity(
      id,
      'DOCUMENT_ADDED',
      authUser.id,
      authUser.name,
      { documentTitle: title }
    );

    sendJson(res, { document }, 201);
  } catch (error) {
    console.error('Error adding document:', error);
    sendError(res, 500, 'Failed to add document', 'DOCUMENT_ADD_FAILED');
  }
}

export async function handleRemoveDocument(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id, docId } = req.params;

    // Verify user is owner or collaborator
    const { prisma } = await import('../kernel.js');
    const membership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
        role: { in: ['OWNER', 'COLLABORATOR'] },
      },
    });

    if (!membership) {
      return sendError(res, 403, 'Only owners and collaborators can remove documents', 'FORBIDDEN_ROLE');
    }

    // Get document info before deletion
    const doc = await prisma.legalSharedSpaceDocument.findFirst({
      where: { id: docId, spaceId: id },
    });

    const removed = await sharedSpaceService.removeDocumentFromSpace(id, docId);

    if (!removed) {
      return sendError(res, 404, 'Document not found', 'DOCUMENT_NOT_FOUND');
    }

    await sharedSpaceService.logSpaceActivity(
      id,
      'DOCUMENT_REMOVED',
      authUser.id,
      authUser.name,
      { documentTitle: doc?.title || 'Unknown' }
    );

    sendJson(res, { success: true });
  } catch (error) {
    console.error('Error removing document:', error);
    sendError(res, 500, 'Failed to remove document', 'DOCUMENT_REMOVE_FAILED');
  }
}

// ========== MESSAGING ==========

export async function handleGetMessages(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id } = req.params;
    const { cursor, limit } = req.query;

    // Verify user is a member
    const { prisma } = await import('../kernel.js');
    const membership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
      },
    });

    if (!membership) {
      return sendError(res, 403, 'You must be a member to view messages', 'FORBIDDEN_ROLE');
    }

    const messages = await sharedSpaceService.getSpaceMessages(
      id,
      cursor,
      limit ? parseInt(limit) : 50
    );

    sendJson(res, { messages });
  } catch (error) {
    console.error('Error getting messages:', error);
    sendError(res, 500, 'Failed to get messages', 'MESSAGE_GET_FAILED');
  }
}

export async function handleSendMessage(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id } = req.params;
    const { content, parentId } = req.body;

    if (!content || content.trim().length === 0) {
      return sendError(res, 400, 'Message content is required', 'VALIDATION_FAILED');
    }

    // Verify user is a member
    const { prisma } = await import('../kernel.js');
    const membership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
      },
    });

    if (!membership) {
      return sendError(res, 403, 'You must be a member to send messages', 'FORBIDDEN_ROLE');
    }

    const message = await sharedSpaceService.sendSpaceMessage(
      id,
      content,
      {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
      },
      false, // isExternal
      parentId
    );

    sendJson(res, { message }, 201);
  } catch (error) {
    console.error('Error sending message:', error);
    sendError(res, 500, 'Failed to send message', 'MESSAGE_SEND_FAILED');
  }
}

// ========== ACTIVITY LOG ==========

export async function handleGetActivity(req, res, authUser) {
  if (!requireGPCounsel(authUser, res)) return;

  try {
    const { id } = req.params;
    const { limit } = req.query;

    // Verify user is owner or collaborator
    const { prisma } = await import('../kernel.js');
    const membership = await prisma.legalSharedSpaceMember.findFirst({
      where: {
        spaceId: id,
        userId: authUser.id,
        role: { in: ['OWNER', 'COLLABORATOR'] },
      },
    });

    if (!membership) {
      return sendError(res, 403, 'Only owners and collaborators can view activity log', 'FORBIDDEN_ROLE');
    }

    const activities = await sharedSpaceService.getSpaceActivity(
      id,
      limit ? parseInt(limit) : 20
    );

    sendJson(res, { activities });
  } catch (error) {
    console.error('Error getting activity:', error);
    sendError(res, 500, 'Failed to get activity', 'ACTIVITY_GET_FAILED');
  }
}

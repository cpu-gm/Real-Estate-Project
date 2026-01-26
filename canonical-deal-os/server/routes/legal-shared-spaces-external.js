import { sendJson, sendError } from '../middleware/auth.js';
import { checkRateLimit } from '../services/rate-limiter.js';
import * as sharedSpaceService from '../services/shared-space-service.js';

// ========== EXTERNAL ACCESS (PUBLIC ROUTES) ==========

export async function handleValidateToken(req, res) {
  try {
    const { token } = req.params;

    // Rate limiting for token validation (prevent enumeration)
    const rateLimitKey = `validate-token:${req.ip}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 'token_validation');

    if (!rateLimit.allowed) {
      return sendError(
        res,
        429,
        `Too many validation attempts. Try again in ${Math.ceil(rateLimit.retryAfterSeconds)} seconds`,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    const member = await sharedSpaceService.validateExternalToken(token);

    if (!member) {
      // TODO: Add audit logging
      // await logPermissionAction({
      //   actorId: 'external',
      //   action: 'EXTERNAL_ACCESS_DENIED',
      //   resource: 'LegalSharedSpace',
      //   afterValue: JSON.stringify({ reason: 'Invalid or expired token' })
      // });

      return sendError(res, 404, 'Invalid or expired access token', 'TOKEN_INVALID');
    }

    // Update last access time
    await sharedSpaceService.recordMemberAccess(member.id);

    // TODO: Add audit logging
    // await logPermissionAction({
    //   actorId: member.id,
    //   action: 'EXTERNAL_ACCESS_GRANTED',
    //   resource: 'LegalSharedSpace',
    //   resourceId: member.space.id
    // });

    // Return space data (but not sensitive org info)
    const spaceData = {
      id: member.space.id,
      name: member.space.name,
      description: member.space.description,
      memberRole: member.role,
      memberName: member.externalName,
      memberEmail: member.externalEmail,
      expiresAt: member.space.expiresAt,
    };

    sendJson(res, { space: spaceData, member: {
      id: member.id,
      role: member.role,
      name: member.externalName,
      email: member.externalEmail,
    }});
  } catch (error) {
    console.error('Error validating external token:', error);
    sendError(res, 500, 'Failed to validate token', 'TOKEN_VALIDATION_FAILED');
  }
}

export async function handleGetDocuments(req, res) {
  try {
    const { token } = req.params;

    const member = await sharedSpaceService.validateExternalToken(token);

    if (!member) {
      return sendError(res, 404, 'Invalid or expired access token', 'TOKEN_INVALID');
    }

    const documents = await sharedSpaceService.getSpaceDocuments(member.spaceId);

    sendJson(res, { documents });
  } catch (error) {
    console.error('Error getting documents:', error);
    sendError(res, 500, 'Failed to get documents', 'DOCUMENT_GET_FAILED');
  }
}

export async function handleDownloadDocument(req, res) {
  try {
    const { token, docId } = req.params;

    const member = await sharedSpaceService.validateExternalToken(token);

    if (!member) {
      return sendError(res, 404, 'Invalid or expired access token', 'TOKEN_INVALID');
    }

    // Verify document belongs to this space
    const { prisma } = await import('../kernel.js');
    const document = await prisma.legalSharedSpaceDocument.findFirst({
      where: {
        id: docId,
        spaceId: member.spaceId,
      },
    });

    if (!document) {
      return sendError(res, 404, 'Document not found', 'DOCUMENT_NOT_FOUND');
    }

    // TODO: Add audit logging
    // TODO: Add audit logging
    // await logPermissionAction({
    //   actorId: member.id,
    //   action: 'EXTERNAL_DOCUMENT_DOWNLOAD',
    //   resource: 'LegalSharedSpaceDocument',
    //   resourceId: document.id
    // });

    // Return document metadata and URL
    // In production, you'd generate a signed URL or serve the file directly
    sendJson(res, { document });
  } catch (error) {
    console.error('Error downloading document:', error);
    sendError(res, 500, 'Failed to download document', 'DOCUMENT_DOWNLOAD_FAILED');
  }
}

export async function handleGetMessages(req, res) {
  try {
    const { token } = req.params;
    const { cursor, limit } = req.query;

    const member = await sharedSpaceService.validateExternalToken(token);

    if (!member) {
      return sendError(res, 404, 'Invalid or expired access token', 'TOKEN_INVALID');
    }

    const messages = await sharedSpaceService.getSpaceMessages(
      member.spaceId,
      cursor,
      limit ? parseInt(limit) : 50
    );

    sendJson(res, { messages });
  } catch (error) {
    console.error('Error getting messages:', error);
    sendError(res, 500, 'Failed to get messages', 'MESSAGE_GET_FAILED');
  }
}

export async function handleSendMessage(req, res) {
  try {
    const { token } = req.params;
    const { content, parentId } = req.body;

    if (!content || content.trim().length === 0) {
      return sendError(res, 400, 'Message content is required', 'VALIDATION_FAILED');
    }

    const member = await sharedSpaceService.validateExternalToken(token);

    if (!member) {
      return sendError(res, 404, 'Invalid or expired access token', 'TOKEN_INVALID');
    }

    // Check if member role allows sending messages
    if (member.role === 'VIEWER') {
      return sendError(res, 403, 'Viewers cannot send messages', 'FORBIDDEN_ROLE');
    }

    const message = await sharedSpaceService.sendSpaceMessage(
      member.spaceId,
      content,
      {
        id: member.id,
        name: member.externalName,
        email: member.externalEmail,
      },
      true, // isExternal
      parentId
    );

    // TODO: Add audit logging
    // await logPermissionAction({
    //   actorId: member.id,
    //   action: 'EXTERNAL_MESSAGE_SENT',
    //   resource: 'LegalSharedSpaceMessage',
    //   resourceId: message.id
    // });

    sendJson(res, { message }, 201);
  } catch (error) {
    console.error('Error sending message:', error);
    sendError(res, 500, 'Failed to send message', 'MESSAGE_SEND_FAILED');
  }
}

export async function handleUploadDocument(req, res) {
  try {
    const { token } = req.params;
    const { title, documentUrl } = req.body;

    if (!title) {
      return sendError(res, 400, 'Document title is required', 'VALIDATION_FAILED');
    }

    const member = await sharedSpaceService.validateExternalToken(token);

    if (!member) {
      return sendError(res, 404, 'Invalid or expired access token', 'TOKEN_INVALID');
    }

    // Check if member role allows uploading documents
    if (member.role === 'VIEWER') {
      return sendError(res, 403, 'Viewers cannot upload documents', 'FORBIDDEN_ROLE');
    }

    const document = await sharedSpaceService.addDocumentToSpace(
      member.spaceId,
      { title, documentUrl, documentId: null },
      member.id
    );

    await sharedSpaceService.logSpaceActivity(
      member.spaceId,
      'DOCUMENT_ADDED',
      member.id,
      member.externalName,
      { documentTitle: title }
    );

    // TODO: Add audit logging
    // await logPermissionAction({
    //   actorId: member.id,
    //   action: 'EXTERNAL_DOCUMENT_UPLOAD',
    //   resource: 'LegalSharedSpaceDocument',
    //   resourceId: document.id
    // });

    sendJson(res, { document }, 201);
  } catch (error) {
    console.error('Error uploading document:', error);
    sendError(res, 500, 'Failed to upload document', 'DOCUMENT_UPLOAD_FAILED');
  }
}

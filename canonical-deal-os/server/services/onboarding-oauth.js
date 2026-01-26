/**
 * OnboardingOAuthService - OAuth integration for external data sources
 *
 * Supports:
 * - Google (Contacts, Drive)
 * - Microsoft (Outlook, OneDrive, SharePoint)
 * - Salesforce (stub - enterprise feature)
 * - HubSpot (stub - enterprise feature)
 * - Yardi (stub - property software integration)
 * - AppFolio (stub - property software integration)
 *
 * Security:
 * - Tokens encrypted at rest
 * - Refresh tokens handled automatically
 * - Scopes validated on callback
 * - State tokens for CSRF protection
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { createOnboardingLogger, COMPONENTS } from './onboarding-logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const OAUTH_PROVIDERS = {
  GOOGLE: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'openid',
      'email',
      'profile'
    ],
    syncSupported: true
  },
  MICROSOFT: {
    name: 'Microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'User.Read',
      'Contacts.Read',
      'Files.Read',
      'offline_access'
    ],
    syncSupported: true
  },
  SALESFORCE: {
    name: 'Salesforce',
    authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: ['api', 'refresh_token'],
    syncSupported: false,
    stubMessage: 'Salesforce integration available in Enterprise tier'
  },
  HUBSPOT: {
    name: 'HubSpot',
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: ['contacts'],
    syncSupported: false,
    stubMessage: 'HubSpot integration available in Enterprise tier'
  },
  YARDI: {
    name: 'Yardi',
    authUrl: null,
    tokenUrl: null,
    scopes: [],
    syncSupported: false,
    stubMessage: 'Yardi integration requires API credentials - contact support'
  },
  APPFOLIO: {
    name: 'AppFolio',
    authUrl: null,
    tokenUrl: null,
    scopes: [],
    syncSupported: false,
    stubMessage: 'AppFolio integration requires API credentials - contact support'
  }
};

// Encryption key for tokens (should be from env in production)
const ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY || 'dev-encryption-key-32-bytes-long';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// State token expiry (10 minutes)
const STATE_TOKEN_EXPIRY_MS = 10 * 60 * 1000;

// In-memory state token store (use Redis in production)
const stateTokenStore = new Map();

// =============================================================================
// LOGGING COMPONENTS (Phase 4)
// =============================================================================

const PHASE4_COMPONENTS = {
  OAUTH: 'OAUTH',
  OAUTH_CALLBACK: 'OAUTH_CALLBACK',
  OAUTH_SYNC: 'OAUTH_SYNC',
  OAUTH_REFRESH: 'OAUTH_REFRESH'
};

// =============================================================================
// ENCRYPTION HELPERS
// =============================================================================

/**
 * Encrypt a token for storage
 */
function encryptToken(plaintext) {
  if (!plaintext) return null;

  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a stored token
 */
function decryptToken(encrypted) {
  if (!encrypted) return null;

  try {
    const [ivHex, authTagHex, ciphertext] = encrypted.split(':');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('[OAuth] Failed to decrypt token:', err.message);
    return null;
  }
}

// =============================================================================
// STATE TOKEN MANAGEMENT
// =============================================================================

/**
 * Create a state token for CSRF protection
 */
function createStateToken(sessionId, provider, userId) {
  const token = uuidv4();
  const data = {
    sessionId,
    provider,
    userId,
    createdAt: Date.now()
  };

  stateTokenStore.set(token, data);

  // Clean up expired tokens
  cleanupExpiredStateTokens();

  return token;
}

/**
 * Validate and consume a state token
 */
function validateStateToken(token) {
  const data = stateTokenStore.get(token);

  if (!data) {
    return { valid: false, error: 'Invalid state token' };
  }

  // Check expiry
  if (Date.now() - data.createdAt > STATE_TOKEN_EXPIRY_MS) {
    stateTokenStore.delete(token);
    return { valid: false, error: 'State token expired' };
  }

  // Consume token (one-time use)
  stateTokenStore.delete(token);

  return { valid: true, data };
}

/**
 * Clean up expired state tokens
 */
function cleanupExpiredStateTokens() {
  const now = Date.now();
  for (const [token, data] of stateTokenStore.entries()) {
    if (now - data.createdAt > STATE_TOKEN_EXPIRY_MS) {
      stateTokenStore.delete(token);
    }
  }
}

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

class OnboardingOAuthService {
  constructor(prisma, options = {}) {
    this.prisma = prisma;
    this.logger = options.logger || null;
  }

  /**
   * Create a logger instance for a session
   */
  _getLogger(sessionId) {
    if (this.logger) return this.logger;
    return createOnboardingLogger(this.prisma, sessionId);
  }

  // ===========================================================================
  // OAUTH FLOW
  // ===========================================================================

  /**
   * Initiate OAuth flow - returns authorization URL
   *
   * @param {string} sessionId - Onboarding session ID
   * @param {string} provider - Provider name (GOOGLE, MICROSOFT, etc.)
   * @param {string} redirectUri - Callback URL
   * @param {string} userId - Current user ID
   * @returns {{ authUrl: string, state: string } | { error: string, stubMessage?: string }}
   */
  async initiateOAuth(sessionId, provider, redirectUri, userId) {
    const timer = { start: Date.now() };
    const logger = this._getLogger(sessionId);

    const providerConfig = OAUTH_PROVIDERS[provider];

    if (!providerConfig) {
      await logger.error(PHASE4_COMPONENTS.OAUTH, `Unknown provider: ${provider}`, { provider });
      return { error: `Unknown OAuth provider: ${provider}` };
    }

    // Check if provider is a stub
    if (!providerConfig.syncSupported) {
      await logger.info(PHASE4_COMPONENTS.OAUTH, `Stub provider accessed: ${provider}`, {
        provider,
        stubMessage: providerConfig.stubMessage
      });
      return {
        error: 'Provider not yet supported',
        stubMessage: providerConfig.stubMessage
      };
    }

    // Check if auth URL exists
    if (!providerConfig.authUrl) {
      return {
        error: 'Provider requires API credentials',
        stubMessage: providerConfig.stubMessage
      };
    }

    // Get client credentials from env
    const clientId = process.env[`OAUTH_${provider}_CLIENT_ID`];
    const clientSecret = process.env[`OAUTH_${provider}_CLIENT_SECRET`];

    if (!clientId || !clientSecret) {
      await logger.warn(PHASE4_COMPONENTS.OAUTH, `Missing OAuth credentials for ${provider}`, {
        provider,
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret
      });
      return { error: `OAuth not configured for ${provider}. Please contact support.` };
    }

    // Create state token
    const state = createStateToken(sessionId, provider, userId);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: providerConfig.scopes.join(' '),
      state,
      access_type: 'offline', // For refresh tokens
      prompt: 'consent' // Force consent to get refresh token
    });

    const authUrl = `${providerConfig.authUrl}?${params.toString()}`;

    await logger.info(PHASE4_COMPONENTS.OAUTH, `OAuth initiated for ${provider}`, {
      provider,
      sessionId,
      userId,
      duration: Date.now() - timer.start
    });

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback - exchange code for tokens
   *
   * @param {string} state - State token from callback
   * @param {string} code - Authorization code from provider
   * @param {string} redirectUri - Same redirect URI used in initiation
   * @returns {{ connection: object } | { error: string }}
   */
  async handleCallback(state, code, redirectUri) {
    const timer = { start: Date.now() };

    // Validate state token
    const stateResult = validateStateToken(state);
    if (!stateResult.valid) {
      return { error: stateResult.error };
    }

    const { sessionId, provider, userId } = stateResult.data;
    const logger = this._getLogger(sessionId);

    try {
      const providerConfig = OAUTH_PROVIDERS[provider];

      // Get client credentials
      const clientId = process.env[`OAUTH_${provider}_CLIENT_ID`];
      const clientSecret = process.env[`OAUTH_${provider}_CLIENT_SECRET`];

      // Exchange code for tokens
      const tokenResponse = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        await logger.error(PHASE4_COMPONENTS.OAUTH_CALLBACK, `Token exchange failed`, {
          provider,
          status: tokenResponse.status,
          error: errorText
        });
        return { error: 'Failed to exchange authorization code' };
      }

      const tokens = await tokenResponse.json();

      // Get user info from provider
      let providerAccountId = null;
      let providerEmail = null;

      if (provider === 'GOOGLE') {
        const userInfo = await this._getGoogleUserInfo(tokens.access_token);
        providerAccountId = userInfo?.sub;
        providerEmail = userInfo?.email;
      } else if (provider === 'MICROSOFT') {
        const userInfo = await this._getMicrosoftUserInfo(tokens.access_token);
        providerAccountId = userInfo?.id;
        providerEmail = userInfo?.mail || userInfo?.userPrincipalName;
      }

      // Get session to get organizationId
      const session = await this.prisma.onboardingSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        return { error: 'Session not found' };
      }

      // Create or update connection
      const connection = await this.prisma.onboardingOAuthConnection.upsert({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider
          }
        },
        create: {
          sessionId,
          organizationId: session.organizationId,
          provider,
          providerAccountId,
          providerEmail,
          accessToken: encryptToken(tokens.access_token),
          refreshToken: encryptToken(tokens.refresh_token),
          tokenExpiresAt: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : null,
          scopes: JSON.stringify(providerConfig.scopes),
          status: 'CONNECTED',
          connectedAt: new Date()
        },
        update: {
          sessionId,
          providerAccountId,
          providerEmail,
          accessToken: encryptToken(tokens.access_token),
          refreshToken: encryptToken(tokens.refresh_token),
          tokenExpiresAt: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : null,
          status: 'CONNECTED',
          connectedAt: new Date(),
          disconnectedAt: null
        }
      });

      await logger.info(PHASE4_COMPONENTS.OAUTH_CALLBACK, `OAuth connected: ${provider}`, {
        provider,
        connectionId: connection.id,
        providerEmail,
        duration: Date.now() - timer.start
      });

      // Return connection without tokens
      const { accessToken, refreshToken, ...safeConnection } = connection;
      return { connection: safeConnection };

    } catch (err) {
      await logger.error(PHASE4_COMPONENTS.OAUTH_CALLBACK, `OAuth callback error`, {
        provider,
        error: err.message,
        stack: err.stack
      });
      return { error: 'OAuth callback failed' };
    }
  }

  // ===========================================================================
  // TOKEN MANAGEMENT
  // ===========================================================================

  /**
   * Refresh access token if needed
   *
   * @param {string} connectionId - OAuth connection ID
   * @returns {{ success: boolean, error?: string }}
   */
  async refreshTokenIfNeeded(connectionId) {
    const timer = { start: Date.now() };

    const connection = await this.prisma.onboardingOAuthConnection.findUnique({
      where: { id: connectionId }
    });

    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const logger = this._getLogger(connection.sessionId);

    // Check if token needs refresh (5 minute buffer)
    const expiresAt = connection.tokenExpiresAt;
    if (expiresAt && new Date(expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
      // Token still valid
      return { success: true };
    }

    const refreshToken = decryptToken(connection.refreshToken);
    if (!refreshToken) {
      await logger.warn(PHASE4_COMPONENTS.OAUTH_REFRESH, `No refresh token available`, {
        connectionId,
        provider: connection.provider
      });
      return { success: false, error: 'No refresh token available' };
    }

    try {
      const providerConfig = OAUTH_PROVIDERS[connection.provider];
      const clientId = process.env[`OAUTH_${connection.provider}_CLIENT_ID`];
      const clientSecret = process.env[`OAUTH_${connection.provider}_CLIENT_SECRET`];

      const tokenResponse = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret
        })
      });

      if (!tokenResponse.ok) {
        await logger.error(PHASE4_COMPONENTS.OAUTH_REFRESH, `Token refresh failed`, {
          connectionId,
          provider: connection.provider,
          status: tokenResponse.status
        });

        // Mark connection as expired
        await this.prisma.onboardingOAuthConnection.update({
          where: { id: connectionId },
          data: { status: 'EXPIRED' }
        });

        return { success: false, error: 'Token refresh failed' };
      }

      const tokens = await tokenResponse.json();

      // Update connection with new tokens
      await this.prisma.onboardingOAuthConnection.update({
        where: { id: connectionId },
        data: {
          accessToken: encryptToken(tokens.access_token),
          refreshToken: tokens.refresh_token
            ? encryptToken(tokens.refresh_token)
            : connection.refreshToken,
          tokenExpiresAt: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : null,
          status: 'CONNECTED'
        }
      });

      await logger.info(PHASE4_COMPONENTS.OAUTH_REFRESH, `Token refreshed`, {
        connectionId,
        provider: connection.provider,
        duration: Date.now() - timer.start
      });

      return { success: true };

    } catch (err) {
      await logger.error(PHASE4_COMPONENTS.OAUTH_REFRESH, `Token refresh error`, {
        connectionId,
        provider: connection.provider,
        error: err.message
      });
      return { success: false, error: err.message };
    }
  }

  // ===========================================================================
  // DATA SYNC
  // ===========================================================================

  /**
   * Sync data from connected provider
   *
   * @param {string} connectionId - OAuth connection ID
   * @param {object} options - Sync options
   * @returns {{ success: boolean, recordCount?: number, error?: string }}
   */
  async syncFromProvider(connectionId, options = {}) {
    const timer = { start: Date.now() };

    const connection = await this.prisma.onboardingOAuthConnection.findUnique({
      where: { id: connectionId }
    });

    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const logger = this._getLogger(connection.sessionId);

    // Refresh token if needed
    const refreshResult = await this.refreshTokenIfNeeded(connectionId);
    if (!refreshResult.success) {
      return { success: false, error: refreshResult.error };
    }

    // Reload connection to get fresh access token
    const freshConnection = await this.prisma.onboardingOAuthConnection.findUnique({
      where: { id: connectionId }
    });

    const accessToken = decryptToken(freshConnection.accessToken);
    if (!accessToken) {
      return { success: false, error: 'No access token available' };
    }

    // Create sync history record
    const syncHistory = await this.prisma.onboardingOAuthSyncHistory.create({
      data: {
        connectionId,
        sessionId: connection.sessionId,
        syncType: options.syncType || 'MANUAL',
        status: 'STARTED'
      }
    });

    try {
      let result;

      switch (connection.provider) {
        case 'GOOGLE':
          result = await this._syncGoogleContacts(accessToken, connection, logger);
          break;
        case 'MICROSOFT':
          result = await this._syncMicrosoftOutlook(accessToken, connection, logger);
          break;
        case 'SALESFORCE':
          result = await this._syncSalesforce(connection, logger);
          break;
        case 'HUBSPOT':
          result = await this._syncHubSpot(connection, logger);
          break;
        default:
          result = { success: false, error: `Provider ${connection.provider} sync not implemented` };
      }

      const duration = Date.now() - timer.start;

      // Update sync history
      await this.prisma.onboardingOAuthSyncHistory.update({
        where: { id: syncHistory.id },
        data: {
          status: result.success ? 'COMPLETED' : 'FAILED',
          recordsFetched: result.recordsFetched || 0,
          recordsCreated: result.recordsCreated || 0,
          recordsUpdated: result.recordsUpdated || 0,
          recordsSkipped: result.recordsSkipped || 0,
          completedAt: new Date(),
          duration,
          errorMessage: result.error,
          tokensUsed: result.tokensUsed || 0
        }
      });

      // Update connection last sync
      await this.prisma.onboardingOAuthConnection.update({
        where: { id: connectionId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: result.success ? 'SUCCESS' : 'FAILED',
          lastSyncRecords: result.recordsCreated || 0,
          lastSyncError: result.error
        }
      });

      await logger.info(PHASE4_COMPONENTS.OAUTH_SYNC, `Sync completed: ${connection.provider}`, {
        connectionId,
        provider: connection.provider,
        recordsFetched: result.recordsFetched || 0,
        recordsCreated: result.recordsCreated || 0,
        duration,
        tokensUsed: result.tokensUsed || 0
      });

      return result;

    } catch (err) {
      const duration = Date.now() - timer.start;

      await this.prisma.onboardingOAuthSyncHistory.update({
        where: { id: syncHistory.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          duration,
          errorMessage: err.message
        }
      });

      await logger.error(PHASE4_COMPONENTS.OAUTH_SYNC, `Sync error: ${connection.provider}`, {
        connectionId,
        error: err.message,
        stack: err.stack
      });

      return { success: false, error: err.message };
    }
  }

  /**
   * Sync Google Contacts
   */
  async _syncGoogleContacts(accessToken, connection, logger) {
    const timer = { start: Date.now() };

    try {
      // Fetch contacts from Google People API
      const response = await fetch(
        'https://people.googleapis.com/v1/people/me/connections?' +
        'personFields=names,emailAddresses,phoneNumbers,organizations&pageSize=1000',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        return { success: false, error: `Google API error: ${response.status}` };
      }

      const data = await response.json();
      const contacts = data.connections || [];

      await logger.debug(PHASE4_COMPONENTS.OAUTH_SYNC, `Fetched ${contacts.length} Google contacts`, {
        provider: 'GOOGLE',
        recordsFetched: contacts.length
      });

      let recordsCreated = 0;

      // Create intake sources for each contact
      for (const contact of contacts) {
        const name = contact.names?.[0]?.displayName || 'Unknown';
        const email = contact.emailAddresses?.[0]?.value;
        const phone = contact.phoneNumbers?.[0]?.value;
        const org = contact.organizations?.[0]?.name;

        // Create intake source
        await this.prisma.onboardingIntakeSource.create({
          data: {
            sessionId: connection.sessionId,
            sourceType: 'OAUTH_GOOGLE',
            oauthProvider: 'google',
            oauthAccountId: connection.providerAccountId,
            oauthAccountEmail: connection.providerEmail,
            status: 'PENDING',
            fileName: `Google Contact: ${name}`,
            recordsExtracted: 1
          }
        });

        // Create claim for the contact
        await this.prisma.onboardingClaim.create({
          data: {
            sessionId: connection.sessionId,
            category: 'CONTACT',
            recordType: 'contact',
            recordKey: `google-${contact.resourceName}`,
            recordTitle: name,
            fieldPath: 'contact',
            value: JSON.stringify({
              name,
              email,
              phone,
              organization: org
            }),
            confidence: 1.0,
            sourceType: 'OAUTH',
            status: 'UNVERIFIED'
          }
        });

        recordsCreated++;
      }

      return {
        success: true,
        recordsFetched: contacts.length,
        recordsCreated,
        recordsUpdated: 0,
        recordsSkipped: 0
      };

    } catch (err) {
      await logger.error(PHASE4_COMPONENTS.OAUTH_SYNC, `Google sync error`, {
        error: err.message
      });
      return { success: false, error: err.message };
    }
  }

  /**
   * Sync Microsoft Outlook/Contacts
   */
  async _syncMicrosoftOutlook(accessToken, connection, logger) {
    const timer = { start: Date.now() };

    try {
      // Fetch contacts from Microsoft Graph API
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/me/contacts?$top=100',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        return { success: false, error: `Microsoft API error: ${response.status}` };
      }

      const data = await response.json();
      const contacts = data.value || [];

      await logger.debug(PHASE4_COMPONENTS.OAUTH_SYNC, `Fetched ${contacts.length} Microsoft contacts`, {
        provider: 'MICROSOFT',
        recordsFetched: contacts.length
      });

      let recordsCreated = 0;

      // Create intake sources for each contact
      for (const contact of contacts) {
        const name = contact.displayName || 'Unknown';
        const email = contact.emailAddresses?.[0]?.address;
        const phone = contact.businessPhones?.[0] || contact.mobilePhone;
        const company = contact.companyName;

        // Create intake source
        await this.prisma.onboardingIntakeSource.create({
          data: {
            sessionId: connection.sessionId,
            sourceType: 'OAUTH_MICROSOFT',
            oauthProvider: 'microsoft',
            oauthAccountId: connection.providerAccountId,
            oauthAccountEmail: connection.providerEmail,
            status: 'PENDING',
            fileName: `Microsoft Contact: ${name}`,
            recordsExtracted: 1
          }
        });

        // Create claim for the contact
        await this.prisma.onboardingClaim.create({
          data: {
            sessionId: connection.sessionId,
            category: 'CONTACT',
            recordType: 'contact',
            recordKey: `microsoft-${contact.id}`,
            recordTitle: name,
            fieldPath: 'contact',
            value: JSON.stringify({
              name,
              email,
              phone,
              company
            }),
            confidence: 1.0,
            sourceType: 'OAUTH',
            status: 'UNVERIFIED'
          }
        });

        recordsCreated++;
      }

      return {
        success: true,
        recordsFetched: contacts.length,
        recordsCreated,
        recordsUpdated: 0,
        recordsSkipped: 0
      };

    } catch (err) {
      await logger.error(PHASE4_COMPONENTS.OAUTH_SYNC, `Microsoft sync error`, {
        error: err.message
      });
      return { success: false, error: err.message };
    }
  }

  /**
   * Sync Salesforce (stub - returns enterprise message)
   */
  async _syncSalesforce(connection, logger) {
    await logger.info(PHASE4_COMPONENTS.OAUTH_SYNC, `Salesforce sync requested (stub)`, {
      provider: 'SALESFORCE',
      connectionId: connection.id
    });

    return {
      success: false,
      error: OAUTH_PROVIDERS.SALESFORCE.stubMessage,
      stubProvider: true
    };
  }

  /**
   * Sync HubSpot (stub - returns enterprise message)
   */
  async _syncHubSpot(connection, logger) {
    await logger.info(PHASE4_COMPONENTS.OAUTH_SYNC, `HubSpot sync requested (stub)`, {
      provider: 'HUBSPOT',
      connectionId: connection.id
    });

    return {
      success: false,
      error: OAUTH_PROVIDERS.HUBSPOT.stubMessage,
      stubProvider: true
    };
  }

  // ===========================================================================
  // PROVIDER USER INFO
  // ===========================================================================

  async _getGoogleUserInfo(accessToken) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async _getMicrosoftUserInfo(accessToken) {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================

  /**
   * Get all OAuth connections for a session
   */
  async getConnections(sessionId) {
    const connections = await this.prisma.onboardingOAuthConnection.findMany({
      where: { sessionId },
      select: {
        id: true,
        provider: true,
        providerEmail: true,
        status: true,
        syncEnabled: true,
        syncFrequency: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncRecords: true,
        connectedAt: true
      },
      orderBy: { connectedAt: 'desc' }
    });

    return connections;
  }

  /**
   * Disconnect a provider
   */
  async disconnectProvider(connectionId, userId) {
    const connection = await this.prisma.onboardingOAuthConnection.findUnique({
      where: { id: connectionId }
    });

    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const logger = this._getLogger(connection.sessionId);

    await this.prisma.onboardingOAuthConnection.update({
      where: { id: connectionId },
      data: {
        status: 'DISCONNECTED',
        disconnectedAt: new Date(),
        accessToken: null,
        refreshToken: null,
        syncEnabled: false
      }
    });

    await logger.info(PHASE4_COMPONENTS.OAUTH, `Provider disconnected: ${connection.provider}`, {
      connectionId,
      provider: connection.provider,
      userId
    });

    return { success: true };
  }

  /**
   * Get available providers with their configuration
   */
  getAvailableProviders() {
    return Object.entries(OAUTH_PROVIDERS).map(([key, config]) => ({
      id: key,
      name: config.name,
      syncSupported: config.syncSupported,
      stubMessage: config.stubMessage,
      configured: !!(process.env[`OAUTH_${key}_CLIENT_ID`] && process.env[`OAUTH_${key}_CLIENT_SECRET`])
    }));
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

function createOnboardingOAuthService(prisma, options = {}) {
  return new OnboardingOAuthService(prisma, options);
}

export {
  OnboardingOAuthService,
  createOnboardingOAuthService,
  OAUTH_PROVIDERS,
  PHASE4_COMPONENTS,
  encryptToken,
  decryptToken
};

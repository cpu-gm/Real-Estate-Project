/**
 * Tests for OnboardingOAuthService
 *
 * Covers:
 * - OAuth flow initiation
 * - OAuth callback handling
 * - Token refresh
 * - Provider sync (Google, Microsoft)
 * - Stub provider handling (Salesforce, HubSpot)
 * - Connection management
 * - Token encryption/decryption
 * - State token security
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  OnboardingOAuthService,
  createOnboardingOAuthService,
  OAUTH_PROVIDERS,
  encryptToken,
  decryptToken
} from '../services/onboarding-oauth.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock prisma client
const mockPrisma = {
  onboardingSession: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn()
  },
  onboardingOAuthConnection: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn()
  },
  onboardingOAuthSyncHistory: {
    create: jest.fn(),
    update: jest.fn()
  },
  onboardingIntakeSource: {
    create: jest.fn()
  },
  onboardingClaim: {
    create: jest.fn()
  },
  onboardingProcessingLog: {
    create: jest.fn()
  }
};

// Mock fetch
const originalFetch = global.fetch;
let mockFetchResponses = [];

function mockFetch(url, options) {
  const mockResponse = mockFetchResponses.shift();
  if (!mockResponse) {
    return Promise.reject(new Error(`No mock response for: ${url}`));
  }
  return Promise.resolve({
    ok: mockResponse.ok !== false,
    status: mockResponse.status || 200,
    json: () => Promise.resolve(mockResponse.json || {}),
    text: () => Promise.resolve(mockResponse.text || '')
  });
}

// =============================================================================
// TEST FIXTURES
// =============================================================================

const TEST_SESSION_ID = 'session-123';
const TEST_ORG_ID = 'org-456';
const TEST_USER_ID = 'user-789';
const TEST_CONNECTION_ID = 'conn-abc';

const mockSession = {
  id: TEST_SESSION_ID,
  organizationId: TEST_ORG_ID,
  status: 'PROCESSING'
};

const mockConnection = {
  id: TEST_CONNECTION_ID,
  sessionId: TEST_SESSION_ID,
  organizationId: TEST_ORG_ID,
  provider: 'GOOGLE',
  providerAccountId: 'google-user-123',
  providerEmail: 'test@gmail.com',
  accessToken: null, // Will be set in tests
  refreshToken: null,
  tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
  status: 'CONNECTED'
};

// =============================================================================
// TOKEN ENCRYPTION TESTS
// =============================================================================

describe('Token Encryption', () => {
  it('should encrypt and decrypt tokens correctly', () => {
    const originalToken = 'ya29.a0AfH6SMBxxxxxx_secret_token_xxx';

    const encrypted = encryptToken(originalToken);

    expect(encrypted).not.toEqual(originalToken);
    expect(encrypted).toContain(':'); // iv:authTag:ciphertext format

    const decrypted = decryptToken(encrypted);

    expect(decrypted).toEqual(originalToken);
  });

  it('should return null for null input', () => {
    expect(encryptToken(null)).toBeNull();
    expect(decryptToken(null)).toBeNull();
  });

  it('should return null for invalid encrypted data', () => {
    expect(decryptToken('invalid-data')).toBeNull();
    expect(decryptToken('ab:cd')).toBeNull(); // Not enough parts (needs 3)
  });

  it('should handle empty string by returning null', () => {
    // Empty strings are treated as null (no token to encrypt)
    const encrypted = encryptToken('');
    expect(encrypted).toBeNull();
  });
});

// =============================================================================
// OAUTH FLOW TESTS
// =============================================================================

describe('OnboardingOAuthService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchResponses = [];
    global.fetch = jest.fn(mockFetch);

    // Set up environment variables for OAuth
    process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    process.env.OAUTH_MICROSOFT_CLIENT_ID = 'test-microsoft-client-id';
    process.env.OAUTH_MICROSOFT_CLIENT_SECRET = 'test-microsoft-client-secret';

    service = createOnboardingOAuthService(mockPrisma);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OAUTH_GOOGLE_CLIENT_ID;
    delete process.env.OAUTH_GOOGLE_CLIENT_SECRET;
    delete process.env.OAUTH_MICROSOFT_CLIENT_ID;
    delete process.env.OAUTH_MICROSOFT_CLIENT_SECRET;
  });

  // ===========================================================================
  // initiateOAuth Tests
  // ===========================================================================

  describe('initiateOAuth', () => {
    it('should generate authorization URL for Google', async () => {
      const redirectUri = 'https://app.example.com/oauth/callback';

      const result = await service.initiateOAuth(
        TEST_SESSION_ID,
        'GOOGLE',
        redirectUri,
        TEST_USER_ID
      );

      expect(result.error).toBeUndefined();
      expect(result.authUrl).toBeDefined();
      expect(result.state).toBeDefined();

      // Verify URL contains required params
      const url = new URL(result.authUrl);
      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('client_id')).toBe('test-google-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBe(result.state);
      expect(url.searchParams.get('access_type')).toBe('offline');
    });

    it('should generate authorization URL for Microsoft', async () => {
      const redirectUri = 'https://app.example.com/oauth/callback';

      const result = await service.initiateOAuth(
        TEST_SESSION_ID,
        'MICROSOFT',
        redirectUri,
        TEST_USER_ID
      );

      expect(result.error).toBeUndefined();
      expect(result.authUrl).toBeDefined();

      const url = new URL(result.authUrl);
      expect(url.hostname).toBe('login.microsoftonline.com');
      expect(url.searchParams.get('client_id')).toBe('test-microsoft-client-id');
    });

    it('should return stub message for unsupported providers', async () => {
      const result = await service.initiateOAuth(
        TEST_SESSION_ID,
        'SALESFORCE',
        'https://app.example.com/oauth/callback',
        TEST_USER_ID
      );

      expect(result.error).toBe('Provider not yet supported');
      expect(result.stubMessage).toContain('Enterprise tier');
    });

    it('should return error for unknown provider', async () => {
      const result = await service.initiateOAuth(
        TEST_SESSION_ID,
        'UNKNOWN_PROVIDER',
        'https://app.example.com/oauth/callback',
        TEST_USER_ID
      );

      expect(result.error).toContain('Unknown OAuth provider');
    });

    it('should return error when credentials not configured', async () => {
      delete process.env.OAUTH_GOOGLE_CLIENT_ID;

      const result = await service.initiateOAuth(
        TEST_SESSION_ID,
        'GOOGLE',
        'https://app.example.com/oauth/callback',
        TEST_USER_ID
      );

      expect(result.error).toContain('not configured');
    });
  });

  // ===========================================================================
  // handleCallback Tests
  // ===========================================================================

  describe('handleCallback', () => {
    it('should exchange code for tokens on valid callback', async () => {
      // First, initiate OAuth to get a valid state token
      const { state } = await service.initiateOAuth(
        TEST_SESSION_ID,
        'GOOGLE',
        'https://app.example.com/oauth/callback',
        TEST_USER_ID
      );

      // Mock session lookup
      mockPrisma.onboardingSession.findUnique.mockResolvedValue(mockSession);

      // Mock token exchange response
      mockFetchResponses.push({
        ok: true,
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600
        }
      });

      // Mock user info response
      mockFetchResponses.push({
        ok: true,
        json: {
          sub: 'google-user-id',
          email: 'user@gmail.com'
        }
      });

      // Mock connection upsert
      mockPrisma.onboardingOAuthConnection.upsert.mockResolvedValue({
        id: 'new-conn-id',
        provider: 'GOOGLE',
        providerEmail: 'user@gmail.com',
        status: 'CONNECTED'
      });

      const result = await service.handleCallback(
        state,
        'authorization-code-from-google',
        'https://app.example.com/oauth/callback'
      );

      expect(result.error).toBeUndefined();
      expect(result.connection).toBeDefined();
      expect(result.connection.provider).toBe('GOOGLE');
      expect(result.connection.status).toBe('CONNECTED');

      // Verify token exchange was called
      expect(global.fetch).toHaveBeenCalledWith(
        OAUTH_PROVIDERS.GOOGLE.tokenUrl,
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should return error for invalid state token', async () => {
      const result = await service.handleCallback(
        'invalid-state-token',
        'some-code',
        'https://app.example.com/oauth/callback'
      );

      expect(result.error).toBe('Invalid state token');
    });

    it('should return error when token exchange fails', async () => {
      const { state } = await service.initiateOAuth(
        TEST_SESSION_ID,
        'GOOGLE',
        'https://app.example.com/oauth/callback',
        TEST_USER_ID
      );

      mockPrisma.onboardingSession.findUnique.mockResolvedValue(mockSession);

      mockFetchResponses.push({
        ok: false,
        status: 400,
        text: 'invalid_grant'
      });

      const result = await service.handleCallback(
        state,
        'bad-code',
        'https://app.example.com/oauth/callback'
      );

      expect(result.error).toContain('Failed to exchange');
    });

    it('should return error when session not found', async () => {
      const { state } = await service.initiateOAuth(
        TEST_SESSION_ID,
        'GOOGLE',
        'https://app.example.com/oauth/callback',
        TEST_USER_ID
      );

      mockPrisma.onboardingSession.findUnique.mockResolvedValue(null);

      mockFetchResponses.push({
        ok: true,
        json: { access_token: 'token' }
      });

      mockFetchResponses.push({
        ok: true,
        json: { sub: 'id', email: 'test@gmail.com' }
      });

      const result = await service.handleCallback(
        state,
        'code',
        'https://app.example.com/oauth/callback'
      );

      expect(result.error).toBe('Session not found');
    });
  });

  // ===========================================================================
  // refreshTokenIfNeeded Tests
  // ===========================================================================

  describe('refreshTokenIfNeeded', () => {
    it('should not refresh if token is still valid', async () => {
      const validConnection = {
        ...mockConnection,
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      };
      mockPrisma.onboardingOAuthConnection.findUnique.mockResolvedValue(validConnection);

      const result = await service.refreshTokenIfNeeded(TEST_CONNECTION_ID);

      expect(result.success).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should refresh if token is about to expire', async () => {
      const encryptedRefresh = encryptToken('refresh-token');
      const expiringConnection = {
        ...mockConnection,
        tokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes from now (within 5 min buffer)
        refreshToken: encryptedRefresh
      };
      mockPrisma.onboardingOAuthConnection.findUnique.mockResolvedValue(expiringConnection);

      mockFetchResponses.push({
        ok: true,
        json: {
          access_token: 'new-access-token',
          expires_in: 3600
        }
      });

      mockPrisma.onboardingOAuthConnection.update.mockResolvedValue({});

      const result = await service.refreshTokenIfNeeded(TEST_CONNECTION_ID);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
      expect(mockPrisma.onboardingOAuthConnection.update).toHaveBeenCalled();
    });

    it('should return error if no refresh token available', async () => {
      const noRefreshConnection = {
        ...mockConnection,
        tokenExpiresAt: new Date(Date.now() - 1000), // Expired
        refreshToken: null
      };
      mockPrisma.onboardingOAuthConnection.findUnique.mockResolvedValue(noRefreshConnection);

      const result = await service.refreshTokenIfNeeded(TEST_CONNECTION_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No refresh token');
    });

    it('should mark connection as expired on refresh failure', async () => {
      const encryptedRefresh = encryptToken('refresh-token');
      const expiredConnection = {
        ...mockConnection,
        tokenExpiresAt: new Date(Date.now() - 1000),
        refreshToken: encryptedRefresh
      };
      mockPrisma.onboardingOAuthConnection.findUnique.mockResolvedValue(expiredConnection);

      mockFetchResponses.push({
        ok: false,
        status: 400
      });

      mockPrisma.onboardingOAuthConnection.update.mockResolvedValue({});

      const result = await service.refreshTokenIfNeeded(TEST_CONNECTION_ID);

      expect(result.success).toBe(false);
      expect(mockPrisma.onboardingOAuthConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'EXPIRED' })
        })
      );
    });
  });

  // ===========================================================================
  // syncFromProvider Tests
  // ===========================================================================

  describe('syncFromProvider', () => {
    it('should sync Google contacts successfully', async () => {
      const encryptedAccess = encryptToken('access-token');
      const connection = {
        ...mockConnection,
        accessToken: encryptedAccess,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000)
      };

      mockPrisma.onboardingOAuthConnection.findUnique
        .mockResolvedValueOnce(connection) // First call in syncFromProvider
        .mockResolvedValueOnce(connection) // In refreshTokenIfNeeded
        .mockResolvedValueOnce(connection); // After refresh check (reload)

      mockPrisma.onboardingOAuthSyncHistory.create.mockResolvedValue({ id: 'sync-1' });
      mockPrisma.onboardingOAuthSyncHistory.update.mockResolvedValue({});
      mockPrisma.onboardingOAuthConnection.update.mockResolvedValue({});
      mockPrisma.onboardingIntakeSource.create.mockResolvedValue({ id: 'source-1' });
      mockPrisma.onboardingClaim.create.mockResolvedValue({ id: 'claim-1' });

      // Mock Google People API response
      mockFetchResponses.push({
        ok: true,
        json: {
          connections: [
            {
              resourceName: 'people/123',
              names: [{ displayName: 'John Doe' }],
              emailAddresses: [{ value: 'john@example.com' }],
              phoneNumbers: [{ value: '+1234567890' }],
              organizations: [{ name: 'Acme Corp' }]
            },
            {
              resourceName: 'people/456',
              names: [{ displayName: 'Jane Smith' }],
              emailAddresses: [{ value: 'jane@example.com' }]
            }
          ]
        }
      });

      const result = await service.syncFromProvider(TEST_CONNECTION_ID);

      expect(result.success).toBe(true);
      expect(result.recordsFetched).toBe(2);
      expect(result.recordsCreated).toBe(2);

      // Verify intake sources were created
      expect(mockPrisma.onboardingIntakeSource.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.onboardingClaim.create).toHaveBeenCalledTimes(2);
    });

    it('should return stub message for unsupported providers', async () => {
      const salesforceConnection = {
        ...mockConnection,
        provider: 'SALESFORCE',
        accessToken: encryptToken('access-token'),
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000)
      };

      mockPrisma.onboardingOAuthConnection.findUnique
        .mockResolvedValueOnce(salesforceConnection) // syncFromProvider
        .mockResolvedValueOnce(salesforceConnection) // refreshTokenIfNeeded
        .mockResolvedValueOnce(salesforceConnection); // reload after refresh

      mockPrisma.onboardingOAuthSyncHistory.create.mockResolvedValue({ id: 'sync-1' });
      mockPrisma.onboardingOAuthSyncHistory.update.mockResolvedValue({});
      mockPrisma.onboardingOAuthConnection.update.mockResolvedValue({});

      const result = await service.syncFromProvider(TEST_CONNECTION_ID);

      expect(result.success).toBe(false);
      // The stub providers return error message, not stubProvider flag from syncFromProvider
      expect(result.error).toContain('Enterprise tier');
    });

    it('should handle connection not found', async () => {
      mockPrisma.onboardingOAuthConnection.findUnique.mockResolvedValue(null);

      const result = await service.syncFromProvider('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection not found');
    });
  });

  // ===========================================================================
  // Connection Management Tests
  // ===========================================================================

  describe('getConnections', () => {
    it('should return all connections for a session', async () => {
      mockPrisma.onboardingOAuthConnection.findMany.mockResolvedValue([
        { id: 'conn-1', provider: 'GOOGLE', status: 'CONNECTED' },
        { id: 'conn-2', provider: 'MICROSOFT', status: 'EXPIRED' }
      ]);

      const connections = await service.getConnections(TEST_SESSION_ID);

      expect(connections).toHaveLength(2);
      expect(mockPrisma.onboardingOAuthConnection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: TEST_SESSION_ID }
        })
      );
    });
  });

  describe('disconnectProvider', () => {
    it('should disconnect provider and clear tokens', async () => {
      mockPrisma.onboardingOAuthConnection.findUnique.mockResolvedValue(mockConnection);
      mockPrisma.onboardingOAuthConnection.update.mockResolvedValue({});

      const result = await service.disconnectProvider(TEST_CONNECTION_ID, TEST_USER_ID);

      expect(result.success).toBe(true);
      expect(mockPrisma.onboardingOAuthConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DISCONNECTED',
            accessToken: null,
            refreshToken: null,
            syncEnabled: false
          })
        })
      );
    });

    it('should return error for non-existent connection', async () => {
      mockPrisma.onboardingOAuthConnection.findUnique.mockResolvedValue(null);

      const result = await service.disconnectProvider('nonexistent', TEST_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection not found');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of providers with configuration status', () => {
      const providers = service.getAvailableProviders();

      expect(providers).toBeInstanceOf(Array);
      expect(providers.length).toBeGreaterThan(0);

      const google = providers.find(p => p.id === 'GOOGLE');
      expect(google).toBeDefined();
      expect(google.name).toBe('Google');
      expect(google.syncSupported).toBe(true);
      expect(google.configured).toBe(true); // We set env vars in beforeEach

      const salesforce = providers.find(p => p.id === 'SALESFORCE');
      expect(salesforce).toBeDefined();
      expect(salesforce.syncSupported).toBe(false);
      expect(salesforce.stubMessage).toBeDefined();
    });
  });
});

// =============================================================================
// OAUTH PROVIDERS CONFIG TESTS
// =============================================================================

describe('OAUTH_PROVIDERS', () => {
  it('should have correct configuration for Google', () => {
    expect(OAUTH_PROVIDERS.GOOGLE).toBeDefined();
    expect(OAUTH_PROVIDERS.GOOGLE.authUrl).toContain('google.com');
    expect(OAUTH_PROVIDERS.GOOGLE.tokenUrl).toContain('googleapis.com');
    expect(OAUTH_PROVIDERS.GOOGLE.syncSupported).toBe(true);
    expect(OAUTH_PROVIDERS.GOOGLE.scopes).toContain('https://www.googleapis.com/auth/contacts.readonly');
  });

  it('should have correct configuration for Microsoft', () => {
    expect(OAUTH_PROVIDERS.MICROSOFT).toBeDefined();
    expect(OAUTH_PROVIDERS.MICROSOFT.authUrl).toContain('microsoftonline.com');
    expect(OAUTH_PROVIDERS.MICROSOFT.syncSupported).toBe(true);
    expect(OAUTH_PROVIDERS.MICROSOFT.scopes).toContain('Contacts.Read');
  });

  it('should have stub configuration for enterprise providers', () => {
    expect(OAUTH_PROVIDERS.SALESFORCE.syncSupported).toBe(false);
    expect(OAUTH_PROVIDERS.SALESFORCE.stubMessage).toBeDefined();

    expect(OAUTH_PROVIDERS.HUBSPOT.syncSupported).toBe(false);
    expect(OAUTH_PROVIDERS.HUBSPOT.stubMessage).toBeDefined();

    expect(OAUTH_PROVIDERS.YARDI.syncSupported).toBe(false);
    expect(OAUTH_PROVIDERS.YARDI.authUrl).toBeNull();

    expect(OAUTH_PROVIDERS.APPFOLIO.syncSupported).toBe(false);
    expect(OAUTH_PROVIDERS.APPFOLIO.authUrl).toBeNull();
  });
});

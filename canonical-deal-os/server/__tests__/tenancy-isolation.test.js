/**
 * Tenancy Isolation Tests
 *
 * Sprint 1, Day 4: Production Readiness
 *
 * CRITICAL SECURITY INVARIANT:
 * Users from Organization A MUST NEVER access resources from Organization B.
 * Cross-org requests MUST return 404 (not 403) to prevent enumeration attacks.
 *
 * Test Categories:
 * 1. Deal access isolation
 * 2. User data isolation
 * 3. Document access isolation
 * 4. API endpoint isolation
 * 5. Error message security (no information leakage)
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  assertCrossOrgDenied,
  assertSameOrgAllowed,
  createTestLogger
} from './utils/security-assertions.js';
import crypto from 'crypto';

// =============================================================================
// MOCK DATA LAYER
// =============================================================================

class MockDataLayer {
  constructor() {
    this.organizations = new Map();
    this.users = new Map();
    this.deals = new Map();
    this.documents = new Map();
    this.accessLog = [];
  }

  reset() {
    this.organizations.clear();
    this.users.clear();
    this.deals.clear();
    this.documents.clear();
    this.accessLog.length = 0;
  }

  logAccess(type, resourceId, userId, orgId, allowed, responseCode) {
    this.accessLog.push({
      timestamp: new Date().toISOString(),
      type,
      resourceId,
      userId,
      userOrgId: orgId,
      allowed,
      responseCode
    });
  }

  createOrganization(name) {
    const id = crypto.randomUUID();
    const org = { id, name, createdAt: new Date().toISOString() };
    this.organizations.set(id, org);
    return org;
  }

  createUser(orgId, name, role = 'GP') {
    const id = crypto.randomUUID();
    const user = {
      id,
      organizationId: orgId,
      name,
      role,
      email: `${name.toLowerCase().replace(/\s/g, '.')}@test.com`,
      createdAt: new Date().toISOString()
    };
    this.users.set(id, user);
    return user;
  }

  createDeal(orgId, name) {
    const id = crypto.randomUUID();
    const deal = {
      id,
      organizationId: orgId,
      name,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    this.deals.set(id, deal);
    return deal;
  }

  createDocument(dealId, name, type = 'GENERAL') {
    const deal = this.deals.get(dealId);
    if (!deal) throw new Error('Deal not found');

    const id = crypto.randomUUID();
    const doc = {
      id,
      dealId,
      organizationId: deal.organizationId,
      name,
      type,
      createdAt: new Date().toISOString()
    };
    this.documents.set(id, doc);
    return doc;
  }

  // Simulates org-isolated data access
  getDeal(dealId, requestingUser) {
    const deal = this.deals.get(dealId);

    // If deal doesn't exist, return null (404)
    if (!deal) {
      this.logAccess('deal', dealId, requestingUser.id, requestingUser.organizationId, false, 404);
      return { found: false, data: null, status: 404 };
    }

    // SECURITY: Cross-org access returns 404, not 403
    if (deal.organizationId !== requestingUser.organizationId) {
      this.logAccess('deal', dealId, requestingUser.id, requestingUser.organizationId, false, 404);
      // Return 404 to prevent enumeration
      return { found: false, data: null, status: 404 };
    }

    this.logAccess('deal', dealId, requestingUser.id, requestingUser.organizationId, true, 200);
    return { found: true, data: deal, status: 200 };
  }

  getDocument(docId, requestingUser) {
    const doc = this.documents.get(docId);

    if (!doc) {
      this.logAccess('document', docId, requestingUser.id, requestingUser.organizationId, false, 404);
      return { found: false, data: null, status: 404 };
    }

    // SECURITY: Cross-org access returns 404
    if (doc.organizationId !== requestingUser.organizationId) {
      this.logAccess('document', docId, requestingUser.id, requestingUser.organizationId, false, 404);
      return { found: false, data: null, status: 404 };
    }

    this.logAccess('document', docId, requestingUser.id, requestingUser.organizationId, true, 200);
    return { found: true, data: doc, status: 200 };
  }

  getUser(userId, requestingUser) {
    const user = this.users.get(userId);

    if (!user) {
      this.logAccess('user', userId, requestingUser.id, requestingUser.organizationId, false, 404);
      return { found: false, data: null, status: 404 };
    }

    // SECURITY: Cross-org user lookup returns 404
    if (user.organizationId !== requestingUser.organizationId) {
      this.logAccess('user', userId, requestingUser.id, requestingUser.organizationId, false, 404);
      return { found: false, data: null, status: 404 };
    }

    this.logAccess('user', userId, requestingUser.id, requestingUser.organizationId, true, 200);
    return { found: true, data: user, status: 200 };
  }

  // List operations with org filtering
  listDeals(requestingUser) {
    const orgDeals = [];
    for (const [_, deal] of this.deals) {
      if (deal.organizationId === requestingUser.organizationId) {
        orgDeals.push(deal);
      }
    }
    this.logAccess('deal_list', 'all', requestingUser.id, requestingUser.organizationId, true, 200);
    return { data: orgDeals, status: 200 };
  }

  listDocuments(dealId, requestingUser) {
    const deal = this.deals.get(dealId);

    if (!deal || deal.organizationId !== requestingUser.organizationId) {
      return { data: [], status: 404 };
    }

    const docs = [];
    for (const [_, doc] of this.documents) {
      if (doc.dealId === dealId) {
        docs.push(doc);
      }
    }
    return { data: docs, status: 200 };
  }

  getAccessLog() {
    return this.accessLog;
  }

  getSecurityViolations() {
    return this.accessLog.filter(log => !log.allowed && log.responseCode === 403);
  }
}

// =============================================================================
// MOCK API HANDLER
// =============================================================================

class MockAPIHandler {
  constructor(dataLayer) {
    this.dataLayer = dataLayer;
    this.requestLog = [];
  }

  logRequest(method, path, userId, result) {
    this.requestLog.push({
      timestamp: new Date().toISOString(),
      method,
      path,
      userId,
      status: result.status,
      allowed: result.status < 400
    });
  }

  // Simulates authenticated request handling
  handleRequest(method, path, user, body = null) {
    // Parse path
    const segments = path.split('/').filter(Boolean);

    if (segments[0] === 'api') {
      if (segments[1] === 'deals') {
        if (segments.length === 2 && method === 'GET') {
          // GET /api/deals - list deals
          const result = this.dataLayer.listDeals(user);
          this.logRequest(method, path, user.id, result);
          return result;
        }
        if (segments.length === 3 && method === 'GET') {
          // GET /api/deals/:id
          const result = this.dataLayer.getDeal(segments[2], user);
          this.logRequest(method, path, user.id, result);
          return result;
        }
        if (segments.length === 4 && segments[3] === 'documents' && method === 'GET') {
          // GET /api/deals/:id/documents
          const result = this.dataLayer.listDocuments(segments[2], user);
          this.logRequest(method, path, user.id, result);
          return result;
        }
      }
      if (segments[1] === 'documents' && segments.length === 3 && method === 'GET') {
        // GET /api/documents/:id
        const result = this.dataLayer.getDocument(segments[2], user);
        this.logRequest(method, path, user.id, result);
        return result;
      }
      if (segments[1] === 'users' && segments.length === 3 && method === 'GET') {
        // GET /api/users/:id
        const result = this.dataLayer.getUser(segments[2], user);
        this.logRequest(method, path, user.id, result);
        return result;
      }
    }

    return { status: 404, found: false, data: null };
  }

  getRequestLog() {
    return this.requestLog;
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('Tenancy Isolation', () => {
  let dataLayer;
  let api;
  let logger;

  // Test data
  let orgA, orgB;
  let userA, userB;
  let dealA, dealB;
  let docA, docB;

  beforeEach(() => {
    dataLayer = new MockDataLayer();
    api = new MockAPIHandler(dataLayer);
    logger = createTestLogger('tenancy-isolation');

    // Create two organizations
    orgA = dataLayer.createOrganization('Organization A');
    orgB = dataLayer.createOrganization('Organization B');

    // Create users in each org
    userA = dataLayer.createUser(orgA.id, 'User A', 'GP');
    userB = dataLayer.createUser(orgB.id, 'User B', 'GP');

    // Create deals in each org
    dealA = dataLayer.createDeal(orgA.id, 'Deal A');
    dealB = dataLayer.createDeal(orgB.id, 'Deal B');

    // Create documents in each deal
    docA = dataLayer.createDocument(dealA.id, 'Doc A');
    docB = dataLayer.createDocument(dealB.id, 'Doc B');

    logger.log('Test setup complete', {
      orgA: orgA.id,
      orgB: orgB.id,
      userA: userA.id,
      userB: userB.id,
      dealA: dealA.id,
      dealB: dealB.id
    });
  });

  afterEach(() => {
    // Check for security violations
    const violations = dataLayer.getSecurityViolations();
    if (violations.length > 0) {
      logger.error('SECURITY VIOLATIONS DETECTED', violations);
    }
    // Uncomment to debug:
    // logger.print();
  });

  describe('Deal Access Isolation', () => {
    test('User can access deals in their own organization', () => {
      logger.log('Testing same-org deal access');

      const result = api.handleRequest('GET', `/api/deals/${dealA.id}`, userA);

      expect(result.status).toBe(200);
      expect(result.found).toBe(true);
      expect(result.data.id).toBe(dealA.id);

      logger.log('Same-org access allowed', { dealId: dealA.id });
    });

    test('User CANNOT access deals in other organization (returns 404)', () => {
      logger.log('Testing cross-org deal access');

      const result = api.handleRequest('GET', `/api/deals/${dealB.id}`, userA);

      // CRITICAL: Must be 404, not 403
      expect(result.status).toBe(404);
      expect(result.found).toBe(false);
      expect(result.data).toBeNull();

      // Verify using security assertion
      assertCrossOrgDenied({ status: result.status, body: result }, 'Deal access');

      logger.security('CROSS_ORG_BLOCKED', {
        resource: 'deal',
        resourceId: dealB.id,
        requestingUser: userA.id,
        responseCode: result.status
      });
    });

    test('Deal listing only shows own organization deals', () => {
      logger.log('Testing deal listing isolation');

      const resultA = api.handleRequest('GET', '/api/deals', userA);
      const resultB = api.handleRequest('GET', '/api/deals', userB);

      // User A sees only Deal A
      expect(resultA.data.length).toBe(1);
      expect(resultA.data[0].id).toBe(dealA.id);

      // User B sees only Deal B
      expect(resultB.data.length).toBe(1);
      expect(resultB.data[0].id).toBe(dealB.id);

      logger.log('Deal listing isolated', {
        userADeals: resultA.data.length,
        userBDeals: resultB.data.length
      });
    });
  });

  describe('Document Access Isolation', () => {
    test('User can access documents in their own organization', () => {
      logger.log('Testing same-org document access');

      const result = api.handleRequest('GET', `/api/documents/${docA.id}`, userA);

      expect(result.status).toBe(200);
      expect(result.found).toBe(true);
      expect(result.data.id).toBe(docA.id);

      logger.log('Same-org document access allowed', { docId: docA.id });
    });

    test('User CANNOT access documents in other organization (returns 404)', () => {
      logger.log('Testing cross-org document access');

      const result = api.handleRequest('GET', `/api/documents/${docB.id}`, userA);

      expect(result.status).toBe(404);
      expect(result.found).toBe(false);

      assertCrossOrgDenied({ status: result.status }, 'Document access');

      logger.security('CROSS_ORG_BLOCKED', {
        resource: 'document',
        resourceId: docB.id,
        requestingUser: userA.id
      });
    });

    test('Document listing via deal respects isolation', () => {
      logger.log('Testing document listing via deal');

      // User A can list docs for Deal A
      const resultOwnDeal = api.handleRequest('GET', `/api/deals/${dealA.id}/documents`, userA);
      expect(resultOwnDeal.status).toBe(200);
      expect(resultOwnDeal.data.length).toBe(1);

      // User A cannot list docs for Deal B
      const resultOtherDeal = api.handleRequest('GET', `/api/deals/${dealB.id}/documents`, userA);
      expect(resultOtherDeal.status).toBe(404);
      expect(resultOtherDeal.data.length).toBe(0);

      logger.log('Document listing isolated');
    });
  });

  describe('User Access Isolation', () => {
    test('User can view users in their own organization', () => {
      logger.log('Testing same-org user access');

      // Create another user in org A
      const userA2 = dataLayer.createUser(orgA.id, 'User A2', 'Analyst');

      const result = api.handleRequest('GET', `/api/users/${userA2.id}`, userA);

      expect(result.status).toBe(200);
      expect(result.found).toBe(true);

      logger.log('Same-org user access allowed');
    });

    test('User CANNOT view users in other organization (returns 404)', () => {
      logger.log('Testing cross-org user access');

      const result = api.handleRequest('GET', `/api/users/${userB.id}`, userA);

      expect(result.status).toBe(404);
      expect(result.found).toBe(false);

      assertCrossOrgDenied({ status: result.status }, 'User access');

      logger.security('CROSS_ORG_BLOCKED', {
        resource: 'user',
        resourceId: userB.id,
        requestingUser: userA.id
      });
    });
  });

  describe('Error Message Security', () => {
    test('Cross-org denial does not leak resource existence', () => {
      logger.log('Testing error message security');

      // Access non-existent resource
      const nonExistent = api.handleRequest('GET', '/api/deals/non-existent-id', userA);

      // Access existing but cross-org resource
      const crossOrg = api.handleRequest('GET', `/api/deals/${dealB.id}`, userA);

      // Both should return identical response structure
      expect(nonExistent.status).toBe(crossOrg.status);
      expect(nonExistent.found).toBe(crossOrg.found);
      expect(nonExistent.data).toEqual(crossOrg.data);

      logger.log('Error responses are indistinguishable', {
        nonExistentStatus: nonExistent.status,
        crossOrgStatus: crossOrg.status
      });
    });

    test('No 403 responses for cross-org access', () => {
      logger.log('Testing no 403 responses');

      // Try various cross-org accesses
      const results = [
        api.handleRequest('GET', `/api/deals/${dealB.id}`, userA),
        api.handleRequest('GET', `/api/documents/${docB.id}`, userA),
        api.handleRequest('GET', `/api/users/${userB.id}`, userA),
        api.handleRequest('GET', `/api/deals/${dealB.id}/documents`, userA)
      ];

      // None should return 403
      for (const result of results) {
        expect(result.status).not.toBe(403);
        expect(result.status).toBe(404);
      }

      logger.log('All cross-org requests returned 404');
    });
  });

  describe('Access Logging', () => {
    test('All access attempts are logged', () => {
      logger.log('Testing access logging');

      // Perform various accesses
      api.handleRequest('GET', `/api/deals/${dealA.id}`, userA); // allowed
      api.handleRequest('GET', `/api/deals/${dealB.id}`, userA); // denied
      api.handleRequest('GET', `/api/documents/${docA.id}`, userA); // allowed
      api.handleRequest('GET', `/api/documents/${docB.id}`, userA); // denied

      const accessLog = dataLayer.getAccessLog();

      expect(accessLog.length).toBe(4);

      // Check allowed accesses
      const allowed = accessLog.filter(l => l.allowed);
      expect(allowed.length).toBe(2);

      // Check denied accesses
      const denied = accessLog.filter(l => !l.allowed);
      expect(denied.length).toBe(2);
      expect(denied.every(l => l.responseCode === 404)).toBe(true);

      logger.log('Access logging verified', {
        total: accessLog.length,
        allowed: allowed.length,
        denied: denied.length
      });
    });

    test('Security violations are tracked separately', () => {
      logger.log('Testing security violation tracking');

      // Perform cross-org accesses (should be blocked with 404, not 403)
      api.handleRequest('GET', `/api/deals/${dealB.id}`, userA);
      api.handleRequest('GET', `/api/documents/${docB.id}`, userA);

      // Should have no 403 violations (all should be 404)
      const violations = dataLayer.getSecurityViolations();
      expect(violations.length).toBe(0);

      logger.log('No security violations (correct 404 responses)');
    });
  });

  describe('Edge Cases', () => {
    test('Empty organization has no visible resources', () => {
      logger.log('Testing empty organization');

      const orgC = dataLayer.createOrganization('Organization C');
      const userC = dataLayer.createUser(orgC.id, 'User C', 'GP');

      const result = api.handleRequest('GET', '/api/deals', userC);

      expect(result.data.length).toBe(0);

      logger.log('Empty org returns empty list');
    });

    test('User switching orgs loses access to old org resources', () => {
      logger.log('Testing org switch simulation');

      // Simulate user "switching" orgs by creating new user identity
      const userASwitched = {
        ...userA,
        organizationId: orgB.id // Now in org B
      };

      // Should no longer access Deal A
      const result = api.handleRequest('GET', `/api/deals/${dealA.id}`, userASwitched);

      expect(result.status).toBe(404);

      logger.log('Org switch correctly removes access');
    });

    test('Admin in one org cannot access other orgs', () => {
      logger.log('Testing admin isolation');

      const adminA = dataLayer.createUser(orgA.id, 'Admin A', 'Admin');

      // Admin in org A still cannot access org B resources
      const result = api.handleRequest('GET', `/api/deals/${dealB.id}`, adminA);

      expect(result.status).toBe(404);

      logger.log('Admin isolation enforced');
    });

    test('Multiple resources in same org all accessible', () => {
      logger.log('Testing multiple resources access');

      // Create multiple deals in org A
      const deal2 = dataLayer.createDeal(orgA.id, 'Deal A2');
      const deal3 = dataLayer.createDeal(orgA.id, 'Deal A3');

      const result = api.handleRequest('GET', '/api/deals', userA);

      expect(result.data.length).toBe(3);
      expect(result.data.map(d => d.id)).toContain(dealA.id);
      expect(result.data.map(d => d.id)).toContain(deal2.id);
      expect(result.data.map(d => d.id)).toContain(deal3.id);

      logger.log('Multiple resources accessible', { count: result.data.length });
    });
  });
});

describe('Security Invariant Assertions', () => {
  test('assertCrossOrgDenied validates 404 response', () => {
    expect(() => {
      assertCrossOrgDenied({ status: 404 });
    }).not.toThrow();
  });

  test('assertCrossOrgDenied rejects 403 response', () => {
    expect(() => {
      assertCrossOrgDenied({ status: 403 });
    }).toThrow(/SECURITY VIOLATION/);
  });

  test('assertCrossOrgDenied rejects 200 response', () => {
    expect(() => {
      assertCrossOrgDenied({ status: 200 });
    }).toThrow();
  });

  test('assertSameOrgAllowed validates 200 response', () => {
    expect(() => {
      assertSameOrgAllowed({ status: 200 });
    }).not.toThrow();
  });

  test('assertSameOrgAllowed rejects 404 response', () => {
    expect(() => {
      assertSameOrgAllowed({ status: 404 });
    }).toThrow();
  });
});

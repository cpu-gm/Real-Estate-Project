/**
 * TestDataFactory - Comprehensive test data generation with logging
 *
 * Sprint 1: Production Readiness
 * Purpose: Create test data with full audit trail for debugging test failures
 *
 * Features:
 * - All operations logged with timestamps
 * - Automatic cleanup tracking
 * - Cross-org test data generation
 * - Comprehensive debug output on failure
 */

import crypto from 'crypto';

/**
 * Test Data Factory with comprehensive logging
 */
export class TestDataFactory {
  constructor(prisma) {
    this.prisma = prisma;
    this.logger = [];
    this.createdRecords = {
      organizations: [],
      users: [],
      deals: [],
      dealDrafts: [],
      events: [],
      other: []
    };
  }

  /**
   * Log an operation with timestamp and data
   */
  log(action, data, level = 'INFO') {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      action,
      data: typeof data === 'object' ? { ...data } : data
    };
    this.logger.push(entry);

    if (level === 'ERROR') {
      console.error(`[TestDataFactory] ${action}:`, JSON.stringify(data, null, 2));
    }
  }

  /**
   * Generate a unique ID for test data
   */
  generateId() {
    return crypto.randomUUID();
  }

  /**
   * Generate a unique slug
   */
  generateSlug(prefix = 'test') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  // =============================================================================
  // ORGANIZATION OPERATIONS
  // =============================================================================

  /**
   * Create a test organization
   * @param {object} overrides - Override default values
   * @returns {Promise<object>} Created organization
   */
  async createOrganization(overrides = {}) {
    const id = overrides.id || this.generateId();
    const slug = this.generateSlug('org');

    const org = {
      id,
      name: overrides.name || `Test Org ${Date.now()}`,
      slug,
      domain: overrides.domain || `${slug}.example.com`,
      type: overrides.type || 'GP',
      status: overrides.status || 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };

    this.log('createOrganization', { id: org.id, name: org.name, type: org.type });

    try {
      const created = await this.prisma.organization.create({ data: org });
      this.createdRecords.organizations.push(created.id);
      this.log('createOrganization.success', { id: created.id });
      return created;
    } catch (error) {
      this.log('createOrganization.error', { error: error.message, org }, 'ERROR');
      throw error;
    }
  }

  /**
   * Create two organizations for cross-org testing
   * @returns {Promise<{orgA: object, orgB: object}>}
   */
  async createCrossOrgPair() {
    this.log('createCrossOrgPair.start', {});

    const orgA = await this.createOrganization({ name: 'Org A (Test)' });
    const orgB = await this.createOrganization({ name: 'Org B (Test)' });

    this.log('createCrossOrgPair.complete', {
      orgAId: orgA.id,
      orgBId: orgB.id
    });

    return { orgA, orgB };
  }

  // =============================================================================
  // USER OPERATIONS
  // =============================================================================

  /**
   * Create a test user
   * @param {string} organizationId - Organization ID
   * @param {object} overrides - Override default values
   * @returns {Promise<object>} Created user
   */
  async createUser(organizationId, overrides = {}) {
    const id = overrides.id || this.generateId();
    const email = overrides.email || `user-${Date.now()}@test.example.com`;

    const user = {
      id,
      email,
      name: overrides.name || `Test User ${Date.now()}`,
      role: overrides.role || 'GP',
      organizationId,
      status: overrides.status || 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };

    this.log('createUser', {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId
    });

    try {
      const created = await this.prisma.user.create({ data: user });
      this.createdRecords.users.push(created.id);
      this.log('createUser.success', { id: created.id, email: created.email });
      return created;
    } catch (error) {
      this.log('createUser.error', { error: error.message, user }, 'ERROR');
      throw error;
    }
  }

  /**
   * Create a user in each of two organizations for cross-org testing
   * @param {object} orgA - First organization
   * @param {object} orgB - Second organization
   * @returns {Promise<{userA: object, userB: object}>}
   */
  async createCrossOrgUsers(orgA, orgB, roleA = 'GP', roleB = 'GP') {
    this.log('createCrossOrgUsers.start', {
      orgAId: orgA.id,
      orgBId: orgB.id,
      roleA,
      roleB
    });

    const userA = await this.createUser(orgA.id, {
      name: 'User A',
      role: roleA
    });
    const userB = await this.createUser(orgB.id, {
      name: 'User B',
      role: roleB
    });

    this.log('createCrossOrgUsers.complete', {
      userAId: userA.id,
      userBId: userB.id
    });

    return { userA, userB };
  }

  // =============================================================================
  // DEAL OPERATIONS
  // =============================================================================

  /**
   * Create a test deal
   * @param {string} organizationId - Organization ID
   * @param {object} overrides - Override default values
   * @returns {Promise<object>} Created deal
   */
  async createDeal(organizationId, overrides = {}) {
    const id = overrides.id || this.generateId();

    const deal = {
      id,
      name: overrides.name || `Test Deal ${Date.now()}`,
      organizationId,
      status: overrides.status || 'ACTIVE',
      propertyType: overrides.propertyType || 'MULTIFAMILY',
      purchasePrice: overrides.purchasePrice || 10000000,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };

    this.log('createDeal', {
      id: deal.id,
      name: deal.name,
      organizationId,
      status: deal.status
    });

    try {
      const created = await this.prisma.deal.create({ data: deal });
      this.createdRecords.deals.push(created.id);
      this.log('createDeal.success', { id: created.id, name: created.name });
      return created;
    } catch (error) {
      this.log('createDeal.error', { error: error.message, deal }, 'ERROR');
      throw error;
    }
  }

  /**
   * Create a deal draft
   * @param {string} organizationId - Organization ID
   * @param {object} overrides - Override default values
   * @returns {Promise<object>} Created deal draft
   */
  async createDealDraft(organizationId, overrides = {}) {
    const id = overrides.id || this.generateId();

    const draft = {
      id,
      name: overrides.name || `Test Draft ${Date.now()}`,
      organizationId,
      status: overrides.status || 'DRAFT',
      propertyType: overrides.propertyType || 'MULTIFAMILY',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };

    this.log('createDealDraft', {
      id: draft.id,
      name: draft.name,
      organizationId
    });

    try {
      const created = await this.prisma.dealDraft.create({ data: draft });
      this.createdRecords.dealDrafts.push(created.id);
      this.log('createDealDraft.success', { id: created.id });
      return created;
    } catch (error) {
      this.log('createDealDraft.error', { error: error.message, draft }, 'ERROR');
      throw error;
    }
  }

  // =============================================================================
  // AUTH CONTEXT HELPERS
  // =============================================================================

  /**
   * Create a mock auth user object for testing
   * @param {object} user - User record
   * @returns {object} Auth user context
   */
  createAuthContext(user) {
    const authContext = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      claims: {
        sub: user.id,
        email: user.email,
        role: user.role,
        org_id: user.organizationId
      }
    };

    this.log('createAuthContext', {
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId
    });

    return authContext;
  }

  /**
   * Create a mock request object with auth context
   * @param {object} authUser - Auth user context
   * @param {object} overrides - Additional request properties
   * @returns {object} Mock request
   */
  createMockRequest(authUser, overrides = {}) {
    const requestId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const req = {
      requestId,
      headers: {
        'x-request-id': requestId,
        authorization: `Bearer mock-token-${authUser.id}`,
        ...overrides.headers
      },
      authUser,
      ...overrides
    };

    this.log('createMockRequest', {
      requestId,
      userId: authUser.id,
      method: overrides.method || 'GET',
      url: overrides.url || '/'
    });

    return req;
  }

  // =============================================================================
  // SECURITY TEST HELPERS
  // =============================================================================

  /**
   * Set up a complete cross-org test scenario
   * Creates two orgs, users in each, and a deal in org A
   * @returns {Promise<object>} Complete test context
   */
  async setupCrossOrgScenario() {
    this.log('setupCrossOrgScenario.start', {});

    const { orgA, orgB } = await this.createCrossOrgPair();
    const { userA, userB } = await this.createCrossOrgUsers(orgA, orgB);
    const dealInOrgA = await this.createDeal(orgA.id, { name: 'Deal in Org A' });

    const context = {
      orgA,
      orgB,
      userA,
      userB,
      dealInOrgA,
      authContextA: this.createAuthContext(userA),
      authContextB: this.createAuthContext(userB)
    };

    this.log('setupCrossOrgScenario.complete', {
      orgAId: orgA.id,
      orgBId: orgB.id,
      userAId: userA.id,
      userBId: userB.id,
      dealId: dealInOrgA.id
    });

    return context;
  }

  /**
   * Log a security-relevant event
   * @param {string} event - Event type
   * @param {object} details - Event details
   */
  logSecurityEvent(event, details) {
    this.log(`SECURITY.${event}`, details, 'SECURITY');
  }

  // =============================================================================
  // CLEANUP & DEBUGGING
  // =============================================================================

  /**
   * Clean up all created test data
   * @returns {Promise<object>} Cleanup summary
   */
  async cleanup() {
    this.log('cleanup.start', { records: this.createdRecords });

    const summary = {
      deleted: {
        deals: 0,
        dealDrafts: 0,
        users: 0,
        organizations: 0,
        other: 0
      },
      errors: []
    };

    // Delete in reverse order of dependencies
    try {
      // Delete events first (if any)
      for (const id of this.createdRecords.events) {
        try {
          await this.prisma.dealEvent.delete({ where: { id } });
          summary.deleted.other++;
        } catch (e) {
          // May already be deleted via cascade
        }
      }

      // Delete deals
      for (const id of this.createdRecords.deals) {
        try {
          await this.prisma.deal.delete({ where: { id } });
          summary.deleted.deals++;
        } catch (e) {
          summary.errors.push({ type: 'deal', id, error: e.message });
        }
      }

      // Delete deal drafts
      for (const id of this.createdRecords.dealDrafts) {
        try {
          await this.prisma.dealDraft.delete({ where: { id } });
          summary.deleted.dealDrafts++;
        } catch (e) {
          summary.errors.push({ type: 'dealDraft', id, error: e.message });
        }
      }

      // Delete users
      for (const id of this.createdRecords.users) {
        try {
          await this.prisma.user.delete({ where: { id } });
          summary.deleted.users++;
        } catch (e) {
          summary.errors.push({ type: 'user', id, error: e.message });
        }
      }

      // Delete organizations last
      for (const id of this.createdRecords.organizations) {
        try {
          await this.prisma.organization.delete({ where: { id } });
          summary.deleted.organizations++;
        } catch (e) {
          summary.errors.push({ type: 'organization', id, error: e.message });
        }
      }
    } catch (error) {
      this.log('cleanup.error', { error: error.message }, 'ERROR');
      summary.errors.push({ type: 'general', error: error.message });
    }

    this.log('cleanup.complete', summary);
    return summary;
  }

  /**
   * Print full operation log (useful for debugging test failures)
   */
  printLog() {
    console.log('\n' + '='.repeat(80));
    console.log('TEST DATA FACTORY LOG');
    console.log('='.repeat(80));

    this.logger.forEach((entry, index) => {
      const levelColor = {
        INFO: '\x1b[36m',    // Cyan
        ERROR: '\x1b[31m',   // Red
        SECURITY: '\x1b[33m' // Yellow
      }[entry.level] || '\x1b[0m';

      console.log(
        `${levelColor}[${entry.timestamp}] [${entry.level}] ${entry.action}\x1b[0m`
      );
      if (entry.data && Object.keys(entry.data).length > 0) {
        console.log('  ', JSON.stringify(entry.data, null, 2).replace(/\n/g, '\n  '));
      }
    });

    console.log('='.repeat(80) + '\n');
  }

  /**
   * Get log entries for a specific action pattern
   * @param {string} pattern - Action pattern to match
   * @returns {array} Matching log entries
   */
  getLogEntries(pattern) {
    return this.logger.filter(entry => entry.action.includes(pattern));
  }

  /**
   * Get summary of all created records
   * @returns {object} Record counts
   */
  getSummary() {
    return {
      organizations: this.createdRecords.organizations.length,
      users: this.createdRecords.users.length,
      deals: this.createdRecords.deals.length,
      dealDrafts: this.createdRecords.dealDrafts.length,
      events: this.createdRecords.events.length,
      totalOperations: this.logger.length
    };
  }
}

/**
 * Create a new TestDataFactory instance
 * @param {PrismaClient} prisma - Prisma client instance
 * @returns {TestDataFactory}
 */
export function createTestDataFactory(prisma) {
  return new TestDataFactory(prisma);
}

export default TestDataFactory;

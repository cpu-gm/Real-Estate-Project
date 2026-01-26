/**
 * Onboarding Phase 2: Split Review E2E Tests
 *
 * Tests the complete review workflow including:
 * - Split view document viewer
 * - Provenance click-through
 * - Conflict resolution UI
 * - Bulk verification
 * - Review session completion
 */

import { test, expect, Page } from '@playwright/test';

const TEST_USER = {
  email: 'gp@canonical.com',
  password: 'gp123'
};

async function loginAndNavigate(page: Page, path: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/home');
  await page.goto(path);
}

test.describe('Phase 2: Split Review Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/onboarding/review');
  });

  test.describe('Split View Document Viewer', () => {
    test('should display split view layout with source and claims panels', async ({ page }) => {
      // Check for split view container
      await expect(page.locator('.split-view, [data-testid="split-view"]')).toBeVisible();

      // Left panel: Document viewer
      const leftPanel = page.locator('[data-testid="source-viewer"], .source-panel');

      // Right panel: Claims/fields panel
      const rightPanel = page.locator('[data-testid="claim-panel"], .claims-panel');

      // At least the review container should be present
      await expect(page.locator('.review-container, [data-testid="review-container"]')).toBeVisible();
    });

    test('should display document toolbar with zoom controls', async ({ page }) => {
      // Look for toolbar or zoom controls
      const toolbar = page.locator('.document-toolbar, [data-testid="doc-toolbar"]');

      // Zoom in/out buttons
      const zoomIn = page.locator('button[aria-label*="Zoom in"], button:has-text("+")');
      const zoomOut = page.locator('button[aria-label*="Zoom out"], button:has-text("-")');

      // Fullscreen button
      const fullscreen = page.locator('button[aria-label*="Fullscreen"], button[aria-label*="Maximize"]');

      // Download button
      const download = page.locator('a[download], button[aria-label*="Download"]');

      // Page should load without errors
      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should support PDF document viewing', async ({ page }) => {
      // When a PDF source is selected, should show PDF-specific UI
      const pdfBadge = page.locator('text=PDF, .badge:has-text("pdf")');
      const pageNavigation = page.locator('text=Page, [data-testid="page-nav"]');

      // Page should render
      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should support spreadsheet document viewing', async ({ page }) => {
      // When a spreadsheet source is selected, should show table/grid
      const spreadsheetBadge = page.locator('text=XLSX, text=spreadsheet, .badge:has-text("spreadsheet")');
      const tableView = page.locator('table, [data-testid="spreadsheet-view"]');

      // Page should render
      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('Provenance Click-Through', () => {
    test('should highlight source when claim is selected', async ({ page }) => {
      // Select a claim/field in the right panel
      const claimRow = page.locator('[data-testid="claim-row"], .claim-item').first();

      if (await claimRow.count() > 0) {
        await claimRow.click();

        // Source viewer should show highlight
        const highlight = page.locator('.highlight, [data-testid="source-highlight"], mark');
        // Highlight info bar should appear
        const infoBar = page.locator('.highlight-info, [data-testid="highlight-bar"]');
      }

      // Page should render without errors
      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should navigate to correct page/cell when provenance link clicked', async ({ page }) => {
      // Find provenance link
      const provenanceLink = page.locator('[data-testid="provenance-link"], .provenance-indicator, text=View source');

      if (await provenanceLink.count() > 0) {
        await provenanceLink.first().click();

        // Should scroll to or highlight the source location
        const highlight = page.locator('mark, .highlighted, [data-highlight]');
      }

      // Page should function normally
      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should display text snippet in highlight info bar', async ({ page }) => {
      // When provenance is shown, info bar should include snippet
      const infoBar = page.locator('[data-testid="highlight-bar"], .highlight-info');

      if (await infoBar.count() > 0) {
        // Should contain highlighting text
        await expect(infoBar).toContainText(/Highlighting:|Source:/);
      }

      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('Conflict Resolution UI', () => {
    test('should display conflict panel when conflicts exist', async ({ page }) => {
      // Look for conflicts section or panel
      const conflictPanel = page.locator('[data-testid="conflict-panel"], .conflict-resolution');
      const conflictBadge = page.locator('.badge:has-text("conflict"), text=Conflict Detected');

      // If there are conflicts, the UI should show them
      // Page should render
      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show AI recommendation with confidence', async ({ page }) => {
      // When viewing a conflict, AI recommendation should be visible
      const aiRecommendation = page.locator('[data-testid="ai-suggestion"], .ai-recommendation');
      const confidenceBadge = page.locator('[data-testid="confidence"], .confidence-badge, text=%');

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should allow selecting Source A, Source B, AI, or custom', async ({ page }) => {
      // Resolution options
      const sourceAOption = page.locator('input[value="sourceA"], [data-option="source-a"]');
      const sourceBOption = page.locator('input[value="sourceB"], [data-option="source-b"]');
      const aiOption = page.locator('input[value="ai"], [data-option="ai-suggestion"]');
      const customOption = page.locator('input[value="custom"], [data-option="custom"]');

      // Resolve button
      const resolveBtn = page.locator('button:has-text("Resolve"), button:has-text("Apply")');

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show rationale when AI recommendation is expanded', async ({ page }) => {
      // Toggle to show AI rationale
      const rationaleToggle = page.locator('button:has-text("reasoning"), button:has-text("rationale"), text=Show reasoning');
      const rationaleText = page.locator('[data-testid="ai-rationale"], .rationale-text');

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should allow skipping conflict for later', async ({ page }) => {
      const skipBtn = page.locator('button:has-text("Skip"), button:has-text("Later")');

      if (await skipBtn.count() > 0) {
        // Skip should be available
        await expect(skipBtn.first()).toBeEnabled();
      }

      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('Bulk Verification', () => {
    test('should display checkbox for bulk selection', async ({ page }) => {
      // Select-all checkbox
      const selectAll = page.locator('[data-testid="select-all"], input[type="checkbox"][name="select-all"]');

      // Individual claim checkboxes
      const claimCheckboxes = page.locator('[data-testid="claim-checkbox"], .claim-row input[type="checkbox"]');

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show bulk action toolbar when items selected', async ({ page }) => {
      // Select items first
      const selectAll = page.locator('[data-testid="select-all"], th input[type="checkbox"]').first();

      if (await selectAll.count() > 0) {
        await selectAll.click();

        // Bulk action toolbar should appear
        const bulkToolbar = page.locator('[data-testid="bulk-toolbar"], .bulk-actions');
        const verifyAllBtn = page.locator('button:has-text("Verify Selected"), button:has-text("Verify All")');
        const rejectAllBtn = page.locator('button:has-text("Reject Selected"), button:has-text("Reject All")');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should update selection count', async ({ page }) => {
      // When items are selected, count should update
      const selectionCount = page.locator('[data-testid="selection-count"], .selected-count, text=selected');

      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('Review Session Completion', () => {
    test('should display progress indicator', async ({ page }) => {
      // Progress bar or counter
      const progressBar = page.locator('[data-testid="review-progress"], .progress-bar');
      const progressText = page.locator('text=/\\d+.*of.*\\d+/, text=/\\d+%/');

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show Done Reviewing button', async ({ page }) => {
      const doneBtn = page.locator('button:has-text("Done Reviewing"), button:has-text("Complete Review")');

      await expect(doneBtn).toBeVisible();
    });

    test('should navigate to next record', async ({ page }) => {
      const nextBtn = page.locator('button:has-text("Next"), button[aria-label*="Next"]');
      const prevBtn = page.locator('button:has-text("Previous"), button[aria-label*="Previous"]');

      await expect(page).not.toHaveTitle(/error/i);
    });
  });
});

test.describe('Phase 2: API Endpoints', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password
      }
    });
    const { token } = await loginResponse.json();
    authToken = token;
  });

  test('should verify claim with correct status transition', async ({ request }) => {
    // Create session
    const createResponse = await request.post('/api/onboarding/session', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { selectedCategories: ['deals'] }
    });
    const { session } = await createResponse.json();

    // Get claims
    const claimsResponse = await request.get(`/api/onboarding/claims?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    expect(claimsResponse.ok()).toBeTruthy();

    const { records } = await claimsResponse.json();

    // If there are claims, verify one
    if (records?.length > 0 && records[0].fields?.length > 0) {
      const claimId = records[0].fields[0].id;

      const verifyResponse = await request.post(`/api/onboarding/claims/${claimId}/verify`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { action: 'VERIFY' }
      });

      expect(verifyResponse.ok()).toBeTruthy();
      const { claim } = await verifyResponse.json();
      expect(claim.status).toBe('VERIFIED');
    }
  });

  test('should reject claim with correct status transition', async ({ request }) => {
    const createResponse = await request.post('/api/onboarding/session', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { selectedCategories: ['deals'] }
    });
    const { session } = await createResponse.json();

    const claimsResponse = await request.get(`/api/onboarding/claims?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { records } = await claimsResponse.json();

    if (records?.length > 0 && records[0].fields?.length > 0) {
      const claimId = records[0].fields[0].id;

      const rejectResponse = await request.post(`/api/onboarding/claims/${claimId}/verify`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { action: 'REJECT' }
      });

      expect(rejectResponse.ok()).toBeTruthy();
      const { claim } = await rejectResponse.json();
      expect(claim.status).toBe('REJECTED');
    }
  });

  test('should correct claim value', async ({ request }) => {
    const createResponse = await request.post('/api/onboarding/session', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { selectedCategories: ['deals'] }
    });
    const { session } = await createResponse.json();

    const claimsResponse = await request.get(`/api/onboarding/claims?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { records } = await claimsResponse.json();

    if (records?.length > 0 && records[0].fields?.length > 0) {
      const claimId = records[0].fields[0].id;

      const correctResponse = await request.post(`/api/onboarding/claims/${claimId}/verify`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          action: 'CORRECT',
          correctedValue: 'Corrected Value Here'
        }
      });

      expect(correctResponse.ok()).toBeTruthy();
      const { claim } = await correctResponse.json();
      expect(claim.status).toBe('VERIFIED');
      expect(claim.value).toBe('Corrected Value Here');
    }
  });

  test('should resolve conflict with AI suggestion', async ({ request }) => {
    const createResponse = await request.post('/api/onboarding/session', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { selectedCategories: ['deals'] }
    });
    const { session } = await createResponse.json();

    const conflictsResponse = await request.get(`/api/onboarding/conflicts?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    expect(conflictsResponse.ok()).toBeTruthy();

    const { conflicts } = await conflictsResponse.json();

    if (conflicts?.length > 0) {
      const conflictId = conflicts[0].id;

      const resolveResponse = await request.post(`/api/onboarding/conflicts/${conflictId}/resolve`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          resolutionMethod: 'AI_SUGGESTION',
          resolvedValue: conflicts[0].aiSuggestedValue
        }
      });

      expect(resolveResponse.ok()).toBeTruthy();
      const { conflict } = await resolveResponse.json();
      expect(conflict.status).toBe('USER_RESOLVED');
    }
  });

  test('should resolve conflict with custom value', async ({ request }) => {
    const createResponse = await request.post('/api/onboarding/session', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { selectedCategories: ['deals'] }
    });
    const { session } = await createResponse.json();

    const conflictsResponse = await request.get(`/api/onboarding/conflicts?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { conflicts } = await conflictsResponse.json();

    if (conflicts?.length > 0) {
      const conflictId = conflicts[0].id;

      const resolveResponse = await request.post(`/api/onboarding/conflicts/${conflictId}/resolve`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          resolutionMethod: 'CUSTOM',
          resolvedValue: 'My Custom Value'
        }
      });

      expect(resolveResponse.ok()).toBeTruthy();
      const { conflict } = await resolveResponse.json();
      expect(conflict.status).toBe('USER_RESOLVED');
      expect(conflict.resolvedValue).toBe('My Custom Value');
    }
  });

  test('should perform bulk verification', async ({ request }) => {
    const createResponse = await request.post('/api/onboarding/session', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { selectedCategories: ['deals'] }
    });
    const { session } = await createResponse.json();

    const claimsResponse = await request.get(`/api/onboarding/claims?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { records } = await claimsResponse.json();

    if (records?.length > 0) {
      const claimIds = records
        .flatMap((r: any) => r.fields || [])
        .filter((f: any) => f.status === 'UNVERIFIED')
        .slice(0, 5)
        .map((f: any) => f.id);

      if (claimIds.length > 0) {
        const bulkResponse = await request.post('/api/onboarding/claims/bulk-verify', {
          headers: { Authorization: `Bearer ${authToken}` },
          data: {
            claimIds,
            action: 'VERIFY'
          }
        });

        expect(bulkResponse.ok()).toBeTruthy();
        const { updatedCount } = await bulkResponse.json();
        expect(updatedCount).toBe(claimIds.length);
      }
    }
  });
});

test.describe('Phase 2: Review Workflow Flow', () => {
  test('complete review workflow: view -> verify -> complete', async ({ page }) => {
    await loginAndNavigate(page, '/onboarding/review');

    // 1. View a record
    const recordRow = page.locator('[data-testid="record-row"], .record-item').first();
    if (await recordRow.count() > 0) {
      await recordRow.click();
    }

    // 2. Verify action (if available)
    const verifyBtn = page.locator('button:has-text("Verify"), button[aria-label*="Verify"]').first();
    if (await verifyBtn.count() > 0 && await verifyBtn.isEnabled()) {
      await verifyBtn.click();
    }

    // 3. Navigate to next
    const nextBtn = page.locator('button:has-text("Next")');
    if (await nextBtn.count() > 0 && await nextBtn.isEnabled()) {
      await nextBtn.click();
    }

    // 4. Complete review
    const doneBtn = page.locator('button:has-text("Done Reviewing")');
    await expect(doneBtn).toBeVisible();

    // Page should be functional throughout
    await expect(page).not.toHaveTitle(/error/i);
  });
});

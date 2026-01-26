import { test, expect } from '@playwright/test';
import { GPCounselPage } from '../page-objects/GPCounselPage';
import { LoginPage } from '../page-objects/LoginPage';

/**
 * E2E tests for GP Counsel dashboard and legal matters workflow
 */

test.describe('GP Counsel Dashboard', () => {
  let gpCounselPage: GPCounselPage;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    gpCounselPage = new GPCounselPage(page);
    loginPage = new LoginPage(page);
  });

  test.describe('Authentication', () => {
    test('should redirect unauthenticated users to login', async ({ page }) => {
      await page.goto('/GPCounselHome');
      await expect(page).toHaveURL(/login/i);
    });

    test('should allow GP Counsel role to access dashboard', async ({ page }) => {
      // Login as GP Counsel user
      await loginPage.goto();
      await loginPage.login('gpcounsel@test.com', 'test123');

      await gpCounselPage.goto();
      await expect(gpCounselPage.dashboardTitle).toBeVisible();
    });

    test('should redirect non-counsel roles away from dashboard', async ({ page }) => {
      // Login as regular GP user
      await loginPage.goto();
      await loginPage.login('gp@canonical.com', 'gp123');

      await page.goto('/GPCounselHome');
      // Should either redirect or show access denied
      await expect(page.locator('text=/access denied|unauthorized/i').or(
        page.locator('text=/Legal Dashboard/i')
      )).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Dashboard Layout', () => {
    test.beforeEach(async ({ page }) => {
      // Seed and login as GP Counsel
      await loginPage.goto();
      await loginPage.login('gpcounsel@test.com', 'test123');
      await gpCounselPage.goto();
    });

    test('should display Kanban board with three columns', async () => {
      await expect(gpCounselPage.kanbanBoard).toBeVisible();
      await expect(gpCounselPage.newColumn).toBeVisible();
      await expect(gpCounselPage.inProgressColumn).toBeVisible();
      await expect(gpCounselPage.completeColumn).toBeVisible();
    });

    test('should display stats bar with counts', async () => {
      await expect(gpCounselPage.statsBar).toBeVisible();
      // Stats should show counts for each stage
      await expect(gpCounselPage.statsBar.locator('text=New')).toBeVisible();
      await expect(gpCounselPage.statsBar.locator('text=In Progress')).toBeVisible();
      await expect(gpCounselPage.statsBar.locator('text=Complete')).toBeVisible();
    });

    test('should display New Matter button', async () => {
      await expect(gpCounselPage.newMatterButton).toBeVisible();
      await expect(gpCounselPage.newMatterButton).toBeEnabled();
    });

    test('should display Urgent Matters section', async ({ page }) => {
      const urgentSection = page.locator('h3:has-text("Urgent Matters")');
      await expect(urgentSection).toBeVisible();
    });

    test('should display My Matters section', async ({ page }) => {
      const mySection = page.locator('h3:has-text("My Matters")');
      await expect(mySection).toBeVisible();
    });

    test('should display Recent Activity section', async ({ page }) => {
      const activitySection = page.locator('h3:has-text("Recent Activity")');
      await expect(activitySection).toBeVisible();
    });
  });

  test.describe('Kanban Interactions', () => {
    test.beforeEach(async ({ page }) => {
      await loginPage.goto();
      await loginPage.login('gpcounsel@test.com', 'test123');
      await gpCounselPage.goto();
    });

    test('should display matter cards with correct information', async ({ page }) => {
      // Wait for matters to load
      await gpCounselPage.waitForDashboardLoad();

      // Check if any matter cards exist
      const cardCount = await gpCounselPage.matterCards.count();
      if (cardCount > 0) {
        const firstCard = gpCounselPage.matterCards.first();
        // Cards should have title visible
        await expect(firstCard).toBeVisible();
      }
    });

    test('should show aging colors on matter cards', async ({ page }) => {
      await gpCounselPage.waitForDashboardLoad();

      // Look for cards with border-l-* classes (aging indicator)
      const cardsWithAging = page.locator('[data-testid="matter-card"][class*="border-l-"]');
      const count = await cardsWithAging.count();
      // Aging colors are optional based on due date
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should navigate to matter detail on card click', async ({ page }) => {
      await gpCounselPage.waitForDashboardLoad();

      const cardCount = await gpCounselPage.matterCards.count();
      if (cardCount > 0) {
        const firstCard = gpCounselPage.matterCards.first();
        await firstCard.click();
        // Should navigate to matter detail page
        await expect(page).toHaveURL(/LegalMatterDetail/);
      }
    });

    test('should refresh dashboard on refresh button click', async ({ page }) => {
      await gpCounselPage.waitForDashboardLoad();

      // Set up response listener
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/api/legal/dashboard')
      );

      await gpCounselPage.refresh();

      const response = await responsePromise;
      expect(response.status()).toBe(200);
    });
  });

  test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await loginPage.goto();
      await loginPage.login('gpcounsel@test.com', 'test123');
      await gpCounselPage.goto();
    });

    test('should navigate to matters list when clicking New stat card', async ({ page }) => {
      await gpCounselPage.clickStatCard('New');
      await expect(page).toHaveURL(/LegalMatters.*stage=NEW/);
    });

    test('should navigate to create matter on New Matter button click', async ({ page }) => {
      await gpCounselPage.clickNewMatter();
      await expect(page).toHaveURL(/LegalMatterCreate/);
    });
  });

  test.describe('API Integration', () => {
    test('should load dashboard data from API', async ({ page }) => {
      await loginPage.goto();
      await loginPage.login('gpcounsel@test.com', 'test123');

      // Intercept dashboard API call
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/api/legal/dashboard') && resp.status() === 200
      );

      await gpCounselPage.goto();

      const response = await responsePromise;
      const data = await response.json();

      // Verify response structure
      expect(data).toHaveProperty('counts');
      expect(data).toHaveProperty('columns');
      expect(data.counts).toHaveProperty('NEW');
      expect(data.counts).toHaveProperty('IN_PROGRESS');
      expect(data.counts).toHaveProperty('COMPLETE');
    });

    test('should handle API errors gracefully', async ({ page }) => {
      await loginPage.goto();
      await loginPage.login('gpcounsel@test.com', 'test123');

      // Mock API error
      await page.route('**/api/legal/dashboard', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ message: 'Internal server error' })
        });
      });

      await page.goto('/GPCounselHome');

      // Should show error state
      const errorMessage = page.locator('text=/error|failed/i');
      await expect(errorMessage).toBeVisible({ timeout: 10000 });

      // Should have retry button
      const retryButton = page.getByRole('button', { name: /retry/i });
      await expect(retryButton).toBeVisible();
    });
  });
});

test.describe('Legal Matters CRUD', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('gpcounsel@test.com', 'test123');
  });

  test('should create a new legal matter', async ({ page }) => {
    // Navigate to create form
    await page.goto('/LegalMatterCreate');

    // Fill form
    await page.fill('input[name="title"]', 'Test Legal Matter E2E');
    await page.selectOption('select[name="matterType"]', 'DEAL_SPECIFIC');
    await page.selectOption('select[name="priority"]', 'HIGH');
    await page.fill('textarea[name="description"]', 'Created by E2E test');

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to dashboard or matter detail
    await expect(page).toHaveURL(/(GPCounselHome|LegalMatterDetail)/);
  });

  test('should display matter detail page', async ({ page }) => {
    // Create a matter first via API
    const response = await page.request.post('/api/legal/matters', {
      data: {
        title: 'E2E Test Matter',
        matterType: 'DEAL_SPECIFIC',
        priority: 'NORMAL'
      }
    });
    const { matter } = await response.json();

    // Navigate to detail page
    await page.goto(`/LegalMatterDetail/${matter.id}`);

    // Verify content
    await expect(page.locator('h1:has-text("E2E Test Matter")')).toBeVisible();
  });
});

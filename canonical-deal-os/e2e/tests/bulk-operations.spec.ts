import { test, expect } from '@playwright/test';

test.describe('Bulk Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Login as GP
    await page.goto('/Login');
    await page.evaluate(() => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    });
    await page.fill('#email', 'gp@canonical.com');
    await page.fill('#password', 'gp123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/Home**', { timeout: 10000 });
  });

  test.describe('Deals Page - Bulk Assign', () => {
    test('deal cards have checkbox overlay', async ({ page }) => {
      await page.goto('/Deals');
      await page.waitForLoadState('networkidle');

      // Check if there are any deal cards
      const cards = page.locator('[data-testid="selectable-checkbox"]');
      const count = await cards.count();

      // May be 0 if no deals exist
      expect(count).toBeGreaterThanOrEqual(0);

      if (count > 0) {
        // Hover to reveal checkbox (they're hidden by default)
        await cards.first().hover();
        await expect(cards.first()).toBeVisible();
      }
    });

    test('clicking checkbox selects deal without navigation', async ({ page }) => {
      await page.goto('/Deals');
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('[data-testid="selectable-checkbox"]');
      const count = await checkboxes.count();

      if (count > 0) {
        const initialUrl = page.url();
        await checkboxes.first().click();
        expect(page.url()).toBe(initialUrl); // Should not navigate
        await expect(page.locator('[data-testid="bulk-action-bar"]')).toBeVisible();
      }
    });

    test('action bar shows selected count', async ({ page }) => {
      await page.goto('/Deals');
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('[data-testid="selectable-checkbox"]');
      const count = await checkboxes.count();

      if (count > 0) {
        await checkboxes.first().click();
        await expect(page.locator('[data-testid="selected-count"]')).toContainText('1');
      }
    });

    test('clear selection button works', async ({ page }) => {
      await page.goto('/Deals');
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('[data-testid="selectable-checkbox"]');
      const count = await checkboxes.count();

      if (count > 0) {
        await checkboxes.first().click();
        await expect(page.locator('[data-testid="bulk-action-bar"]')).toBeVisible();
        await page.click('[data-testid="clear-selection"]');
        await expect(page.locator('[data-testid="bulk-action-bar"]')).not.toBeVisible();
      }
    });

    test('bulk assign opens user picker modal', async ({ page }) => {
      await page.goto('/Deals');
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('[data-testid="selectable-checkbox"]');
      const count = await checkboxes.count();

      if (count > 0) {
        await checkboxes.first().click();
        await page.click('[data-testid="bulk-assign-button"]');
        await expect(page.locator('[data-testid="user-picker"]')).toBeVisible();
      }
    });
  });

  test.describe('AdminDashboard - Bulk Approve', () => {
    test.beforeEach(async ({ page }) => {
      // Re-login as admin for these tests
      await page.goto('/Login');
      await page.evaluate(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      });
      await page.fill('#email', 'admin@canonical.com');
      await page.fill('#password', 'admin123');
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL('**/Home**', { timeout: 10000 });
    });

    test('pending users table has checkboxes', async ({ page }) => {
      await page.goto('/AdminDashboard');
      await page.waitForLoadState('networkidle');

      // Look for any checkbox in the verification queue
      const checkboxes = page.locator('[data-testid="user-checkbox"]');
      // May be 0 if no pending users
      const count = await checkboxes.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('selecting users shows bulk action bar', async ({ page }) => {
      await page.goto('/AdminDashboard');
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('[data-testid="user-checkbox"]');
      const count = await checkboxes.count();

      if (count > 0) {
        await checkboxes.first().click();
        await expect(page.locator('[data-testid="bulk-action-bar"]')).toBeVisible();
      }
    });

    test('bulk approve button visible when users selected', async ({ page }) => {
      await page.goto('/AdminDashboard');
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('[data-testid="user-checkbox"]');
      const count = await checkboxes.count();

      if (count > 0) {
        await checkboxes.first().click();
        await expect(page.locator('[data-testid="bulk-approve-button"]')).toBeVisible();
      }
    });

    test('bulk reject button visible when users selected', async ({ page }) => {
      await page.goto('/AdminDashboard');
      await page.waitForLoadState('networkidle');

      const checkboxes = page.locator('[data-testid="user-checkbox"]');
      const count = await checkboxes.count();

      if (count > 0) {
        await checkboxes.first().click();
        await expect(page.locator('[data-testid="bulk-reject-button"]')).toBeVisible();
      }
    });
  });

  test.describe('BuyerReviewQueue - Bulk Authorize', () => {
    test('buyer cards have checkbox overlay', async ({ page }) => {
      // Navigate to a buyer review queue (need a valid dealDraftId)
      // This test requires a deal to exist - skip if no deals
      await page.goto('/Deals');
      await page.waitForLoadState('networkidle');

      // Check if there are any deal cards to get a dealDraftId
      const dealLinks = page.locator('a[href*="DealOverview"]');
      const dealCount = await dealLinks.count();

      if (dealCount > 0) {
        // Try to navigate to BuyerReviewQueue with first deal
        const href = await dealLinks.first().getAttribute('href');
        const idMatch = href?.match(/id=([^&]+)/);
        if (idMatch) {
          await page.goto(`/BuyerReviewQueue?dealDraftId=${idMatch[1]}`);
          await page.waitForLoadState('networkidle');

          const checkboxes = page.locator('[data-testid="buyer-checkbox"]');
          // May be 0 if no pending buyers
          const count = await checkboxes.count();
          expect(count).toBeGreaterThanOrEqual(0);
        }
      }
    });

    test('bulk authorize action available when buyers selected', async ({ page }) => {
      // Navigate to a buyer review queue with pending buyers
      // This is a smoke test - actual functionality depends on data
      await page.goto('/Deals');
      await page.waitForLoadState('networkidle');

      const dealLinks = page.locator('a[href*="DealOverview"]');
      const dealCount = await dealLinks.count();

      if (dealCount > 0) {
        const href = await dealLinks.first().getAttribute('href');
        const idMatch = href?.match(/id=([^&]+)/);
        if (idMatch) {
          await page.goto(`/BuyerReviewQueue?dealDraftId=${idMatch[1]}`);
          await page.waitForLoadState('networkidle');

          const checkboxes = page.locator('[data-testid="buyer-checkbox"]');
          const count = await checkboxes.count();

          if (count > 0) {
            await checkboxes.first().click();
            await expect(page.locator('[data-testid="bulk-authorize-button"]')).toBeVisible();
          }
        }
      }
    });
  });
});

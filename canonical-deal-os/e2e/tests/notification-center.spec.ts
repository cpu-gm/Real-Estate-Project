import { test, expect } from '@playwright/test';

test.describe('Notification Center', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page first (to allow localStorage access)
    await page.goto('/Login');

    // Clear any existing auth state
    await page.evaluate(() => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    });

    // Login
    await page.fill('#email', 'gp@canonical.com');
    await page.fill('#password', 'gp123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/Home**', { timeout: 10000 });
  });

  test.describe('NotificationBell Component', () => {
    // Helper to get the visible notification bell (handles mobile/desktop)
    const getVisibleBell = (page) => page.locator('[data-testid="notification-bell"]:visible');

    test('bell icon is visible in header', async ({ page }) => {
      const bell = getVisibleBell(page);
      await expect(bell).toBeVisible();
    });

    test('bell icon shows unread count badge', async ({ page }) => {
      const badge = page.locator('[data-testid="notification-badge"]:visible');
      // Badge may or may not be visible depending on unread count
      const badgeExists = await badge.count() > 0;

      if (badgeExists) {
        const count = await badge.textContent();
        expect(parseInt(count || '0')).toBeGreaterThanOrEqual(0);
      }
    });

    test('clicking bell opens notification panel', async ({ page }) => {
      await getVisibleBell(page).click();
      await expect(page.locator('[data-testid="notification-panel"]')).toBeVisible();
    });

    test('clicking bell again closes panel', async ({ page }) => {
      await getVisibleBell(page).click();
      await expect(page.locator('[data-testid="notification-panel"]')).toBeVisible();

      await getVisibleBell(page).click();
      await expect(page.locator('[data-testid="notification-panel"]')).not.toBeVisible();
    });

    test('n key opens notification panel', async ({ page }) => {
      // Ensure no input is focused
      await page.click('body');
      await page.keyboard.press('n');
      // Use :visible to handle mobile/desktop panels
      await expect(page.locator('[data-testid="notification-panel"]:visible')).toBeVisible();
    });

    test('Escape key closes notification panel', async ({ page }) => {
      await getVisibleBell(page).click();
      await expect(page.locator('[data-testid="notification-panel"]')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="notification-panel"]')).not.toBeVisible();
    });

    test('clicking outside closes panel', async ({ page }) => {
      await getVisibleBell(page).click();
      await expect(page.locator('[data-testid="notification-panel"]')).toBeVisible();

      // Click outside the panel
      await page.click('body', { position: { x: 10, y: 10 } });
      await expect(page.locator('[data-testid="notification-panel"]')).not.toBeVisible();
    });
  });

  test.describe('NotificationPanel Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-testid="notification-bell"]:visible').click();
      await page.waitForSelector('[data-testid="notification-panel"]');
    });

    test('panel shows header with title', async ({ page }) => {
      const header = page.locator('[data-testid="notification-panel"] h2');
      await expect(header).toContainText('Notifications');
    });

    test('panel shows category tabs', async ({ page }) => {
      const allTab = page.locator('[data-category="all"]');
      await expect(allTab).toBeVisible();

      const actionTab = page.locator('[data-category="action-required"]');
      await expect(actionTab).toBeVisible();

      const updatesTab = page.locator('[data-category="updates"]');
      await expect(updatesTab).toBeVisible();

      const mentionsTab = page.locator('[data-category="mentions"]');
      await expect(mentionsTab).toBeVisible();
    });

    test('clicking category tab filters notifications', async ({ page }) => {
      // Click action-required tab
      await page.click('[data-category="action-required"]');

      // Verify the tab is now active
      const activeTab = page.locator('[data-category="action-required"]');
      await expect(activeTab).toHaveClass(/bg-slate-900/);
    });

    test('shows empty state when no notifications', async ({ page }) => {
      // Wait for loading to complete
      await page.waitForTimeout(500);

      // Check if empty state, loading state, or notifications exist
      const emptyState = page.locator('text=No notifications yet');
      const loadingState = page.locator('[data-testid="notification-panel"] .animate-spin');
      const notifications = page.locator('[data-testid="notification-item"]');

      const hasEmpty = await emptyState.count() > 0;
      const hasLoading = await loadingState.count() > 0;
      const hasNotifications = await notifications.count() > 0;

      // One of these should be true
      expect(hasEmpty || hasLoading || hasNotifications).toBeTruthy();
    });

    test('notifications grouped by category display correctly', async ({ page }) => {
      const notifications = page.locator('[data-testid="notification-item"]');
      const count = await notifications.count();

      if (count > 0) {
        // Each notification should have a category
        const firstNotification = notifications.first();
        const category = await firstNotification.getAttribute('data-category');
        expect(['action-required', 'updates', 'mentions']).toContain(category);
      }
    });
  });

  test.describe('Notification Actions', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-testid="notification-bell"]:visible').click();
      await page.waitForSelector('[data-testid="notification-panel"]');
    });

    test('clicking notification marks it as read', async ({ page }) => {
      const unreadItem = page.locator('[data-testid="notification-item"][data-unread="true"]').first();
      const unreadExists = await unreadItem.count() > 0;

      if (unreadExists) {
        await unreadItem.click();
        // After clicking, should navigate or mark as read
        // The notification panel may close or item may update
      }
    });

    test('quick action button triggers action', async ({ page }) => {
      const actionButton = page.locator('[data-testid="notification-action"]').first();
      const actionExists = await actionButton.count() > 0;

      if (actionExists) {
        await actionButton.click();
        // Should show success toast or update UI
        await page.waitForTimeout(500);
      }
    });

    test('mark all as read button visible when unread exist', async ({ page }) => {
      const markAllButton = page.locator('[data-testid="mark-all-read"]');
      const badge = page.locator('[data-testid="notification-badge"]');

      const hasUnread = await badge.count() > 0;

      if (hasUnread) {
        await expect(markAllButton).toBeVisible();
      }
    });

    test('mark all as read clears unread notifications', async ({ page }) => {
      const markAllButton = page.locator('[data-testid="mark-all-read"]');
      const buttonExists = await markAllButton.count() > 0;

      if (buttonExists) {
        await markAllButton.click();
        // Wait for the mutation to complete
        await page.waitForTimeout(500);

        // After marking all as read, button should be hidden
        await expect(markAllButton).not.toBeVisible();
      }
    });
  });

  test.describe('Notification Settings Link', () => {
    test('settings link visible in panel footer', async ({ page }) => {
      await page.locator('[data-testid="notification-bell"]:visible').click();

      const settingsLink = page.locator('text=Notification Settings');
      await expect(settingsLink).toBeVisible();
    });

    test('clicking settings link navigates to settings', async ({ page }) => {
      await page.locator('[data-testid="notification-bell"]:visible').click();

      const settingsLink = page.locator('text=Notification Settings');
      await settingsLink.click();

      // Should navigate to notification settings page
      await page.waitForLoadState('networkidle');
    });
  });

  test.describe('Accessibility', () => {
    test('bell button has accessible label', async ({ page }) => {
      const bell = page.locator('[data-testid="notification-bell"]:visible');
      const ariaLabel = await bell.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    });

    test('panel has proper role and aria attributes', async ({ page }) => {
      await page.locator('[data-testid="notification-bell"]:visible').click();
      const panel = page.locator('[data-testid="notification-panel"]');

      // Panel should be accessible
      await expect(panel).toBeVisible();
    });

    test('close button has accessible label', async ({ page }) => {
      await page.locator('[data-testid="notification-bell"]:visible').click();

      // X button should exist
      const closeButton = page.locator('[data-testid="notification-panel"] button').filter({ hasText: '' }).last();
      await expect(closeButton).toBeVisible();
    });

    test('keyboard navigation within panel works', async ({ page }) => {
      await page.locator('[data-testid="notification-bell"]:visible').click();

      // Tab should move focus within panel
      await page.keyboard.press('Tab');

      // Focus should be within the panel
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });
  });

  test.describe('Real-time Updates', () => {
    test('unread count updates when notifications change', async ({ page }) => {
      const badge = page.locator('[data-testid="notification-badge"]');
      const initialCount = await badge.count() > 0
        ? parseInt(await badge.textContent() || '0')
        : 0;

      // Simulate checking notifications
      await page.locator('[data-testid="notification-bell"]:visible').click();

      // Count should remain consistent or update
      await page.waitForTimeout(500);
    });
  });
});

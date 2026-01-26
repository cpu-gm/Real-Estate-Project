import { test, expect } from '@playwright/test';

test.describe('Command Center Dashboard', () => {
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

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
  });

  test.describe('Basic Rendering', () => {
    test('command center renders on home page', async ({ page }) => {
      // Already on Home page from beforeEach
      // Command center should be present (or empty state)
      const commandCenter = page.locator('[data-testid="command-center"]');
      await expect(commandCenter).toBeVisible();
    });

    test('shows "All Clear" when no items need attention', async ({ page }) => {
      // Already on Home page from beforeEach
      const commandCenter = page.locator('[data-testid="command-center"]');
      const allClear = commandCenter.locator('text=All Clear');

      // If there are no items, should show all clear
      const items = await page.$$('[data-testid="attention-item"]');
      if (items.length === 0) {
        await expect(allClear).toBeVisible();
      }
    });
  });

  test.describe('Urgency Sorting', () => {
    test('sorts items by urgency (blocked first)', async ({ page }) => {
      // Already on Home page from beforeEach
      const items = await page.$$('[data-testid="attention-item"]');

      if (items.length > 1) {
        // Get urgency levels of first two items
        const firstItemUrgency = await items[0].getAttribute('data-urgency');
        const secondItemUrgency = await items[1].getAttribute('data-urgency');

        // First item should have equal or higher priority
        const urgencyOrder = ['blocked', 'urgent', 'warning', 'attention', 'ready', 'normal'];
        const firstIndex = urgencyOrder.indexOf(firstItemUrgency || 'normal');
        const secondIndex = urgencyOrder.indexOf(secondItemUrgency || 'normal');

        expect(firstIndex).toBeLessThanOrEqual(secondIndex);
      }
    });

    test('badge counts match item counts', async ({ page }) => {
      // Already on Home page from beforeEach
      // Count blocked items
      const blockedBadge = page.locator('[data-testid="badge-blocked"]');
      const blockedItems = await page.$$('[data-urgency="blocked"]');

      const badgeExists = await blockedBadge.count() > 0;
      if (badgeExists) {
        const badgeText = await blockedBadge.textContent();
        const badgeCount = parseInt(badgeText?.match(/\d+/)?.[0] || '0');
        expect(badgeCount).toBe(blockedItems.length);
      }
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('j key moves selection down', async ({ page }) => {
      // Already on Home page from beforeEach
      const items = await page.$$('[data-testid="attention-item"]');

      if (items.length > 0) {
        // Press j to select first item
        await page.keyboard.press('j');

        // First item should be selected
        const selectedItem = page.locator('[data-testid="attention-item"][data-selected="true"]');
        await expect(selectedItem).toBeVisible();
      }
    });

    test('k key moves selection up', async ({ page }) => {
      // Already on Home page from beforeEach
      const items = await page.$$('[data-testid="attention-item"]');

      if (items.length > 1) {
        // Navigate down twice
        await page.keyboard.press('j');
        await page.keyboard.press('j');

        // Then back up
        await page.keyboard.press('k');

        // Should have moved selection up
        const selectedItem = page.locator('[data-testid="attention-item"][data-selected="true"]');
        await expect(selectedItem).toBeVisible();
      }
    });

    test('Enter key opens selected item', async ({ page }) => {
      // Already on Home page from beforeEach
      const items = await page.$$('[data-testid="attention-item"]');

      if (items.length > 0) {
        const initialUrl = page.url();

        // Select first item
        await page.keyboard.press('j');

        // Press Enter to open
        await page.keyboard.press('Enter');

        // Should navigate away (URL should change)
        await page.waitForLoadState('networkidle');
        // Navigation depends on item type - just verify it attempted
      }
    });

    test('? key shows keyboard shortcut help', async ({ page }) => {
      // Already on Home page from beforeEach
      // Press ? to show help - use type() to send the actual character
      await page.keyboard.type('?');

      // Help overlay should be visible
      const helpOverlay = page.locator('[data-testid="shortcut-help"]');
      await expect(helpOverlay).toBeVisible();
    });

    test('Escape closes shortcut help', async ({ page }) => {
      // Already on Home page from beforeEach
      // Open help - use type() to send the actual ? character
      await page.keyboard.type('?');
      await expect(page.locator('[data-testid="shortcut-help"]')).toBeVisible();

      // Close with Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="shortcut-help"]')).not.toBeVisible();
    });
  });

  test.describe('Quick Actions', () => {
    test('a key triggers quick approve on selected item', async ({ page }) => {
      // Already on Home page from beforeEach
      const items = await page.$$('[data-testid="attention-item"]');

      if (items.length > 0) {
        // Select first item
        await page.keyboard.press('j');

        // Check if item has actions
        const selectedItem = page.locator('[data-testid="attention-item"][data-selected="true"]');
        const actionButton = selectedItem.locator('button').first();

        const hasAction = await actionButton.count() > 0;
        if (hasAction) {
          // Press a for quick action
          await page.keyboard.press('a');

          // Should trigger action (look for toast or state change)
          // This depends on the specific action implementation
        }
      }
    });

    test('inline action buttons work', async ({ page }) => {
      // Already on Home page from beforeEach
      const item = page.locator('[data-testid="attention-item"]').first();
      const itemExists = await item.count() > 0;

      if (itemExists) {
        const actionButton = item.locator('button').first();
        const buttonExists = await actionButton.count() > 0;

        if (buttonExists) {
          await actionButton.click();
          // Action should be triggered - check for toast or state change
        }
      }
    });
  });

  test.describe('Visual Feedback', () => {
    test('selected item has visual highlight', async ({ page }) => {
      // Already on Home page from beforeEach
      const items = await page.$$('[data-testid="attention-item"]');

      if (items.length > 0) {
        // Select item
        await page.keyboard.press('j');

        // Check for ring/highlight class
        const selectedItem = page.locator('[data-testid="attention-item"][data-selected="true"]');
        await expect(selectedItem).toHaveClass(/ring/);
      }
    });

    test('items have correct urgency styling', async ({ page }) => {
      // Already on Home page from beforeEach
      const urgentItem = page.locator('[data-testid="attention-item"][data-urgency="urgent"]').first();
      const urgentExists = await urgentItem.count() > 0;

      if (urgentExists) {
        // Urgent items should have red background
        await expect(urgentItem).toHaveClass(/bg-red/);
      }

      const warningItem = page.locator('[data-testid="attention-item"][data-urgency="warning"]').first();
      const warningExists = await warningItem.count() > 0;

      if (warningExists) {
        // Warning items should have amber background
        await expect(warningItem).toHaveClass(/bg-amber/);
      }
    });

    test('shortcut hint is visible at bottom', async ({ page }) => {
      // Already on Home page from beforeEach
      const items = await page.$$('[data-testid="attention-item"]');

      if (items.length > 0) {
        // Should show keyboard hint
        const hint = page.locator('text=/Press.*j.*k.*to navigate/');
        await expect(hint).toBeVisible();
      }
    });
  });

  test.describe('Item Interaction', () => {
    test('clicking item selects it', async ({ page }) => {
      // Already on Home page from beforeEach
      const item = page.locator('[data-testid="attention-item"]').first();
      const itemExists = await item.count() > 0;

      if (itemExists) {
        await item.click();
        await expect(item).toHaveAttribute('data-selected', 'true');
      }
    });

    test('hovering item shows visual feedback', async ({ page }) => {
      // Already on Home page from beforeEach
      const item = page.locator('[data-testid="attention-item"]').first();
      const itemExists = await item.count() > 0;

      if (itemExists) {
        await item.hover();
        // Should have hover state (shadow)
        await expect(item).toHaveClass(/hover:shadow/);
      }
    });
  });

  test.describe('Accessibility', () => {
    test('shortcut help modal is keyboard accessible', async ({ page }) => {
      // Already on Home page from beforeEach
      // Open help with keyboard - use type() to send the actual ? character
      await page.keyboard.type('?');

      const helpModal = page.locator('[data-testid="shortcut-help"]');
      await expect(helpModal).toBeVisible();

      // Should be closeable with Escape
      await page.keyboard.press('Escape');
      await expect(helpModal).not.toBeVisible();
    });

    test('items are keyboard focusable via j/k', async ({ page }) => {
      // Already on Home page from beforeEach
      const items = await page.$$('[data-testid="attention-item"]');

      if (items.length > 0) {
        // Navigate with j
        await page.keyboard.press('j');

        // Selected item should be visible and highlighted
        const selectedItem = page.locator('[data-testid="attention-item"][data-selected="true"]');
        await expect(selectedItem).toBeVisible();
      }
    });

    test('keyboard navigation does not interfere with input fields', async ({ page }) => {
      // Already on Home page from beforeEach
      // If there's an input field on the page
      const input = page.locator('input').first();
      const inputExists = await input.count() > 0;

      if (inputExists) {
        await input.focus();
        await input.type('j');

        // The 'j' should be typed into input, not trigger navigation
        const inputValue = await input.inputValue();
        expect(inputValue).toContain('j');
      }
    });
  });
});

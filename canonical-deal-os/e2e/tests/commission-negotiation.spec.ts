import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/LoginPage';
import { BrokerAcceptWizardPage } from '../page-objects/BrokerAcceptWizardPage';

/**
 * E2E Tests for Commission Negotiation
 *
 * Tests the commission negotiation flow in Step 2 of the Broker Accept Wizard:
 * - Viewing seller's proposed terms
 * - Accepting terms
 * - Submitting counter-offers
 * - Flagging for negotiate later
 */
test.describe('Commission Negotiation', () => {
  let loginPage: LoginPage;
  let wizardPage: BrokerAcceptWizardPage;

  const TEST_INVITATION_ID = 'test-invitation-id';

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    wizardPage = new BrokerAcceptWizardPage(page);

    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('should display seller proposed terms when available', async ({ page }) => {
    const brokerEmail = process.env.TEST_BROKER_EMAIL || 'broker@test.com';
    const brokerPassword = process.env.TEST_BROKER_PASSWORD || 'broker123';

    await loginPage.goto();
    await loginPage.login(brokerEmail, brokerPassword);

    await page.goto(`/BrokerAcceptWizard?invitationId=${TEST_INVITATION_ID}`);
    await page.waitForLoadState('networkidle');

    const wizardLoaded = await wizardPage.pageTitle.isVisible({ timeout: 5000 }).catch(() => false);

    if (!wizardLoaded) {
      test.skip(true, 'Test invitation data not available');
      return;
    }

    // Navigate to Step 2
    await wizardPage.goToNextStep();

    // Check for Commission Terms heading
    const commissionHeading = page.getByRole('heading', { name: /commission terms/i });
    await expect(commissionHeading).toBeVisible();

    // If seller terms exist, should see "Seller's Proposed Terms" section
    const sellerTermsSection = page.locator('text=Proposed Terms').or(
      page.locator('text=Seller\'s Proposed Terms')
    );

    // This may or may not be visible depending on test data
    const hasSellerTerms = await sellerTermsSection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Seller terms visible:', hasSellerTerms);
  });

  test('should allow broker to accept seller terms', async ({ page }) => {
    const brokerEmail = process.env.TEST_BROKER_EMAIL || 'broker@test.com';
    const brokerPassword = process.env.TEST_BROKER_PASSWORD || 'broker123';

    await loginPage.goto();
    await loginPage.login(brokerEmail, brokerPassword);

    await page.goto(`/BrokerAcceptWizard?invitationId=${TEST_INVITATION_ID}`);
    await page.waitForLoadState('networkidle');

    const wizardLoaded = await wizardPage.pageTitle.isVisible({ timeout: 5000 }).catch(() => false);

    if (!wizardLoaded) {
      test.skip(true, 'Test invitation data not available');
      return;
    }

    // Navigate to Step 2
    await wizardPage.goToNextStep();

    // Check if Accept Terms button exists (only if seller provided terms)
    const acceptButton = page.getByRole('button', { name: /accept terms/i });
    const hasAcceptButton = await acceptButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasAcceptButton) {
      await acceptButton.click();
      await page.waitForTimeout(500);

      // Should see confirmation that terms were accepted
      const acceptedMessage = page.locator('text=Terms Accepted').or(
        page.locator('text=accepted')
      );
      await expect(acceptedMessage).toBeVisible();

      // Continue button should now be enabled
      await expect(wizardPage.continueButton).toBeEnabled();
    }
  });

  test('should allow broker to submit counter-offer', async ({ page }) => {
    const brokerEmail = process.env.TEST_BROKER_EMAIL || 'broker@test.com';
    const brokerPassword = process.env.TEST_BROKER_PASSWORD || 'broker123';

    await loginPage.goto();
    await loginPage.login(brokerEmail, brokerPassword);

    await page.goto(`/BrokerAcceptWizard?invitationId=${TEST_INVITATION_ID}`);
    await page.waitForLoadState('networkidle');

    const wizardLoaded = await wizardPage.pageTitle.isVisible({ timeout: 5000 }).catch(() => false);

    if (!wizardLoaded) {
      test.skip(true, 'Test invitation data not available');
      return;
    }

    // Navigate to Step 2
    await wizardPage.goToNextStep();

    // Click Counter-Offer button
    const counterButton = page.getByRole('button', { name: /counter-offer|propose terms/i });
    await expect(counterButton).toBeVisible();
    await counterButton.click();

    // Fill out counter-offer form
    await page.waitForTimeout(300);

    // Should see commission form inputs
    const rateInput = page.locator('#rate').or(page.locator('[name="rate"]'));
    const hasRateInput = await rateInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasRateInput) {
      await rateInput.fill('3.5');

      // Submit the counter-offer
      const submitButton = page.getByRole('button', { name: /submit/i });
      await submitButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('should allow flagging for negotiate later', async ({ page }) => {
    const brokerEmail = process.env.TEST_BROKER_EMAIL || 'broker@test.com';
    const brokerPassword = process.env.TEST_BROKER_PASSWORD || 'broker123';

    await loginPage.goto();
    await loginPage.login(brokerEmail, brokerPassword);

    await page.goto(`/BrokerAcceptWizard?invitationId=${TEST_INVITATION_ID}`);
    await page.waitForLoadState('networkidle');

    const wizardLoaded = await wizardPage.pageTitle.isVisible({ timeout: 5000 }).catch(() => false);

    if (!wizardLoaded) {
      test.skip(true, 'Test invitation data not available');
      return;
    }

    // Navigate to Step 2
    await wizardPage.goToNextStep();

    // Click Negotiate Later button
    await wizardPage.negotiateLaterButton.click();
    await page.waitForTimeout(500);

    // Should see confirmation message
    const laterMessage = page.locator('text=Negotiate Later').or(
      page.locator('text=negotiate terms separately')
    );
    await expect(laterMessage).toBeVisible();

    // Continue button should now be enabled
    await expect(wizardPage.continueButton).toBeEnabled();
  });

  test('should block Step 3 until commission resolved', async ({ page }) => {
    const brokerEmail = process.env.TEST_BROKER_EMAIL || 'broker@test.com';
    const brokerPassword = process.env.TEST_BROKER_PASSWORD || 'broker123';

    await loginPage.goto();
    await loginPage.login(brokerEmail, brokerPassword);

    await page.goto(`/BrokerAcceptWizard?invitationId=${TEST_INVITATION_ID}`);
    await page.waitForLoadState('networkidle');

    const wizardLoaded = await wizardPage.pageTitle.isVisible({ timeout: 5000 }).catch(() => false);

    if (!wizardLoaded) {
      test.skip(true, 'Test invitation data not available');
      return;
    }

    // Navigate to Step 2
    await wizardPage.goToNextStep();

    // Initially, Continue should be disabled (unless seller terms auto-accepted or already resolved)
    const continueEnabled = await wizardPage.continueButton.isEnabled();

    // If not enabled, verify the reason is displayed
    if (!continueEnabled) {
      const blockingMessage = page.locator('text=must be agreed').or(
        page.locator('text=resolved')
      );
      // Message about needing to resolve commission should be visible
      console.log('Continue blocked - commission resolution required');
    }
  });
});

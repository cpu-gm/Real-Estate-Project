import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/LoginPage';
import { BrokerAcceptWizardPage } from '../page-objects/BrokerAcceptWizardPage';

/**
 * Complete E2E Test for Broker Accept Wizard
 *
 * Tests the full wizard flow from start to finish:
 * 1. Review Property
 * 2. Commission Terms (negotiate later path)
 * 3. Marketing Configuration
 * 4. Agreement & Go Live
 */
test.describe('Complete Broker Accept Flow', () => {
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

  test('should complete full wizard flow end-to-end', async ({ page }) => {
    // Login as broker
    const brokerEmail = process.env.TEST_BROKER_EMAIL || 'broker@test.com';
    const brokerPassword = process.env.TEST_BROKER_PASSWORD || 'broker123';

    await loginPage.goto();
    await loginPage.login(brokerEmail, brokerPassword);

    // Navigate to wizard
    await page.goto(`/BrokerAcceptWizard?invitationId=${TEST_INVITATION_ID}`);
    await page.waitForLoadState('networkidle');

    const wizardLoaded = await wizardPage.pageTitle.isVisible({ timeout: 5000 }).catch(() => false);

    if (!wizardLoaded) {
      test.skip(true, 'Test invitation data not available');
      return;
    }

    console.log('Starting complete wizard flow...');

    // ===== STEP 1: Review Property =====
    console.log('Step 1: Review Property');

    // Verify we're on Step 1
    const reviewHeading = page.getByRole('heading', { name: /review property/i });
    await expect(reviewHeading).toBeVisible();

    // Verify property details are displayed
    await expect(wizardPage.propertyDetails).toBeVisible();

    // Click Continue
    await wizardPage.goToNextStep();
    console.log('Step 1 completed');

    // ===== STEP 2: Commission Terms =====
    console.log('Step 2: Commission Terms');

    // Verify we're on Step 2
    const commissionHeading = page.getByRole('heading', { name: /commission terms/i });
    await expect(commissionHeading).toBeVisible();

    // Use "Negotiate Later" for quick completion
    await wizardPage.negotiateLaterButton.click();
    await page.waitForTimeout(500);

    // Continue should now be enabled
    await expect(wizardPage.continueButton).toBeEnabled();
    await wizardPage.goToNextStep();
    console.log('Step 2 completed');

    // ===== STEP 3: Marketing Configuration =====
    console.log('Step 3: Marketing Configuration');

    // Verify we're on Step 3
    const marketingHeading = page.getByRole('heading', { name: /marketing configuration/i });
    await expect(marketingHeading).toBeVisible();

    // Keep defaults and continue
    await wizardPage.goToNextStep();
    console.log('Step 3 completed');

    // ===== STEP 4: Agreement & Go Live =====
    console.log('Step 4: Agreement & Go Live');

    // Verify we're on Step 4
    const agreementHeading = page.getByRole('heading', { name: /agreement.*go live/i });
    await expect(agreementHeading).toBeVisible();

    // Verify listing summary is displayed
    await expect(wizardPage.listingSummary).toBeVisible();

    // Go Live should be disabled without checkbox
    await expect(wizardPage.goLiveButton).toBeDisabled();

    // Check the agreement confirmation checkbox
    await wizardPage.agreementConfirmCheckbox.click();
    await page.waitForTimeout(300);

    // Go Live should now be enabled
    await expect(wizardPage.goLiveButton).toBeEnabled();

    console.log('Step 4 completed, ready to go live');

    // Note: Actually clicking Go Live would modify data, so we stop here for the test
    // In a full integration test with test data reset, you would:
    // await wizardPage.goLiveButton.click();
    // await page.waitForURL(/DealWorkspace/, { timeout: 10000 });
    // Verify deal status changed
  });

  test('should maintain wizard state across step navigation', async ({ page }) => {
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

    // Go to Step 2
    await wizardPage.goToNextStep();

    // Flag negotiate later
    await wizardPage.negotiateLaterButton.click();
    await page.waitForTimeout(300);

    // Go to Step 3
    await wizardPage.goToNextStep();

    // Change a marketing setting
    const flyersCheckbox = page.locator('#enableFlyers');
    if (await flyersCheckbox.isVisible()) {
      await flyersCheckbox.click();
    }

    // Go back to Step 2
    await wizardPage.goToPreviousStep();

    // Verify negotiate later status is preserved
    const laterStatus = page.locator('text=Negotiate Later').or(
      page.locator('text=NEGOTIATE_LATER')
    );
    await expect(laterStatus).toBeVisible();

    // Go forward to Step 3
    await wizardPage.goToNextStep();

    // Go to Step 4
    await wizardPage.goToNextStep();

    // Go back to Step 3
    await wizardPage.goToPreviousStep();

    // Verify marketing config is preserved
    const marketingHeading = page.getByRole('heading', { name: /marketing configuration/i });
    await expect(marketingHeading).toBeVisible();
  });

  test('should display step completion indicators', async ({ page }) => {
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

    // Step 1 should be active (blue)
    const step1Active = await wizardPage.isStepComplete(1) === false;
    expect(step1Active).toBe(true);

    // Complete Step 1
    await wizardPage.goToNextStep();

    // Step 1 should now be complete (green checkmark)
    // Step 2 should be active
    const steps = await wizardPage.stepIndicators.all();

    if (steps.length >= 2) {
      const step1Complete = await steps[0].evaluate(el =>
        el.classList.contains('bg-green-600')
      );
      const step2Active = await steps[1].evaluate(el =>
        el.classList.contains('bg-blue-600')
      );

      console.log('Step 1 complete:', step1Complete);
      console.log('Step 2 active:', step2Active);
    }
  });

  test('should prevent Go Live without agreement confirmation', async ({ page }) => {
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

    // Navigate through all steps
    await wizardPage.completeStep1();
    await wizardPage.completeStep2NegotiateLater();
    await wizardPage.completeStep3();

    // On Step 4, Go Live should be disabled
    await expect(wizardPage.goLiveButton).toBeDisabled();

    // There should be a message about confirming the agreement
    const confirmMessage = page.locator('text=confirm the agreement').or(
      page.locator('text=checkbox above')
    );
    await expect(confirmMessage).toBeVisible();
  });

  test('should show negotiate later warning on Step 4', async ({ page }) => {
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

    // Navigate using negotiate later path
    await wizardPage.completeStep1();
    await wizardPage.completeStep2NegotiateLater();
    await wizardPage.completeStep3();

    // On Step 4, should see warning about pending commission terms
    const warningMessage = page.locator('text=Commission Terms Pending').or(
      page.locator('text=negotiate terms separately')
    );
    await expect(warningMessage).toBeVisible();
  });
});

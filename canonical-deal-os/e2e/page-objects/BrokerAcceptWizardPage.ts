import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for the Broker Accept Wizard
 */
export class BrokerAcceptWizardPage extends BasePage {
  // Header elements
  readonly pageTitle: Locator;
  readonly propertyName: Locator;
  readonly backButton: Locator;

  // Step indicator
  readonly progressBar: Locator;
  readonly stepIndicators: Locator;

  // Navigation buttons
  readonly continueButton: Locator;
  readonly goLiveButton: Locator;
  readonly backNavButton: Locator;

  // Step 1: Review
  readonly propertyPhotos: Locator;
  readonly propertyDetails: Locator;
  readonly invitationInfo: Locator;

  // Step 2: Commission
  readonly commissionTermsDisplay: Locator;
  readonly acceptTermsButton: Locator;
  readonly counterOfferButton: Locator;
  readonly negotiateLaterButton: Locator;
  readonly commissionTypeRadio: Locator;
  readonly commissionRateInput: Locator;
  readonly commissionAmountInput: Locator;
  readonly counterNotesInput: Locator;
  readonly submitCounterButton: Locator;

  // Step 3: Marketing
  readonly visibilityRadio: Locator;
  readonly buyerTypeCheckboxes: Locator;
  readonly omToggle: Locator;
  readonly flyersToggle: Locator;
  readonly websiteToggle: Locator;
  readonly offerDeadlineInput: Locator;
  readonly listingDurationInput: Locator;

  // Step 4: Agreement
  readonly agreementTypeRadio: Locator;
  readonly agreementConfirmCheckbox: Locator;
  readonly listingSummary: Locator;

  // Error display
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);

    // Header elements
    this.pageTitle = page.getByRole('heading', { name: /accept listing invitation/i });
    this.propertyName = page.locator('p.text-sm.text-slate-500');
    this.backButton = page.locator('button').filter({ has: page.locator('svg.h-5.w-5') }).first();

    // Step indicator
    this.progressBar = page.locator('.h-2.mb-4'); // Progress bar
    this.stepIndicators = page.locator('.w-8.h-8.rounded-full');

    // Navigation buttons
    this.continueButton = page.getByRole('button', { name: /continue/i });
    this.goLiveButton = page.getByRole('button', { name: /go live/i });
    this.backNavButton = page.getByRole('button', { name: /back/i });

    // Step 1: Review
    this.propertyPhotos = page.locator('.aspect-video');
    this.propertyDetails = page.locator('.bg-slate-50.rounded-lg');
    this.invitationInfo = page.locator('.bg-amber-50.border-amber-200');

    // Step 2: Commission
    this.commissionTermsDisplay = page.locator('text=Proposed Terms').locator('..');
    this.acceptTermsButton = page.getByRole('button', { name: /accept terms/i });
    this.counterOfferButton = page.getByRole('button', { name: /counter-offer|propose terms/i });
    this.negotiateLaterButton = page.getByRole('button', { name: /negotiate later/i });
    this.commissionTypeRadio = page.locator('[role="radiogroup"]');
    this.commissionRateInput = page.locator('#rate');
    this.commissionAmountInput = page.locator('#amount');
    this.counterNotesInput = page.locator('#notes');
    this.submitCounterButton = page.getByRole('button', { name: /submit/i });

    // Step 3: Marketing
    this.visibilityRadio = page.locator('[role="radiogroup"]').first();
    this.buyerTypeCheckboxes = page.locator('[role="checkbox"]');
    this.omToggle = page.locator('#enableOM');
    this.flyersToggle = page.locator('#enableFlyers');
    this.websiteToggle = page.locator('#enablePropertyWebsite');
    this.offerDeadlineInput = page.locator('#offerDeadline');
    this.listingDurationInput = page.locator('#listingDuration');

    // Step 4: Agreement
    this.agreementTypeRadio = page.locator('[role="radiogroup"]');
    this.agreementConfirmCheckbox = page.locator('#agreementConfirmed');
    this.listingSummary = page.locator('text=Listing Summary').locator('..');

    // Error display
    this.errorAlert = page.locator('.bg-red-50.border-red-200');
  }

  /**
   * Navigate to the wizard with a specific invitation ID
   */
  async goto(invitationId: string) {
    await this.page.goto(`/BrokerAcceptWizard?invitationId=${invitationId}`);
    await this.waitForPageLoad();
  }

  /**
   * Get the current step number (1-4)
   */
  async getCurrentStep(): Promise<number> {
    const activeStep = this.stepIndicators.filter({ hasText: '' }).filter({
      has: this.page.locator('.bg-blue-600')
    });
    const allSteps = await this.stepIndicators.all();

    for (let i = 0; i < allSteps.length; i++) {
      const hasActiveClass = await allSteps[i].evaluate(el =>
        el.classList.contains('bg-blue-600')
      );
      if (hasActiveClass) {
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * Check if a specific step is complete
   */
  async isStepComplete(stepNumber: number): Promise<boolean> {
    const steps = await this.stepIndicators.all();
    if (stepNumber - 1 >= steps.length) return false;

    const hasCheckmark = await steps[stepNumber - 1].evaluate(el =>
      el.classList.contains('bg-green-600')
    );
    return hasCheckmark;
  }

  /**
   * Navigate to the next step
   */
  async goToNextStep() {
    await this.continueButton.click();
    await this.page.waitForTimeout(300); // Wait for animation
  }

  /**
   * Navigate to the previous step
   */
  async goToPreviousStep() {
    await this.backNavButton.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Complete Step 1: Review (just view and continue)
   */
  async completeStep1() {
    console.log('[BrokerAcceptWizardPage] Completing Step 1: Review');
    await expect(this.propertyDetails).toBeVisible();
    await this.goToNextStep();
  }

  /**
   * Complete Step 2: Accept commission terms
   */
  async completeStep2AcceptTerms() {
    console.log('[BrokerAcceptWizardPage] Completing Step 2: Accept Terms');
    await this.acceptTermsButton.click();
    await this.page.waitForTimeout(300);
    await this.goToNextStep();
  }

  /**
   * Complete Step 2: Negotiate later
   */
  async completeStep2NegotiateLater() {
    console.log('[BrokerAcceptWizardPage] Completing Step 2: Negotiate Later');
    await this.negotiateLaterButton.click();
    await this.page.waitForTimeout(300);
    await this.goToNextStep();
  }

  /**
   * Complete Step 3: Marketing config (use defaults)
   */
  async completeStep3() {
    console.log('[BrokerAcceptWizardPage] Completing Step 3: Marketing');
    // Use defaults and continue
    await this.goToNextStep();
  }

  /**
   * Complete Step 4: Confirm agreement and go live
   */
  async completeStep4AndGoLive() {
    console.log('[BrokerAcceptWizardPage] Completing Step 4: Agreement & Go Live');
    await this.agreementConfirmCheckbox.click();
    await expect(this.goLiveButton).toBeEnabled();
    await this.goLiveButton.click();
    // Wait for navigation to deal workspace
    await this.page.waitForURL(/DealWorkspace/, { timeout: 10000 });
  }

  /**
   * Complete the full wizard flow
   */
  async completeFullWizard() {
    await this.completeStep1();
    await this.completeStep2NegotiateLater(); // Use negotiate later for quick completion
    await this.completeStep3();
    await this.completeStep4AndGoLive();
  }
}

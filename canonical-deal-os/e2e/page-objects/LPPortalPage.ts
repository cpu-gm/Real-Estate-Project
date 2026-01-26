import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for the LP Portal
 * Sprint 4: Test Coverage
 *
 * Covers:
 * - LP login and investment viewing
 * - Capital calls tab
 * - Distributions tab
 * - Documents tab
 */
export class LPPortalPage extends BasePage {
  // Main portal elements
  readonly investmentsHeading: Locator;
  readonly investmentCards: Locator;
  readonly welcomeMessage: Locator;

  // Navigation tabs
  readonly overviewTab: Locator;
  readonly capitalCallsTab: Locator;
  readonly distributionsTab: Locator;
  readonly documentsTab: Locator;
  readonly updatesTab: Locator;

  // Capital calls section
  readonly capitalCallsList: Locator;
  readonly capitalCallCard: Locator;
  readonly wireInitiatedButton: Locator;
  readonly uploadProofButton: Locator;

  // Distributions section
  readonly distributionsList: Locator;
  readonly distributionCard: Locator;
  readonly viewStatementButton: Locator;

  // Documents section
  readonly documentsList: Locator;
  readonly documentRow: Locator;
  readonly downloadButton: Locator;

  // Summary metrics
  readonly totalInvestedAmount: Locator;
  readonly totalDistributedAmount: Locator;
  readonly pendingCapitalCalls: Locator;

  constructor(page: Page) {
    super(page);

    // Main portal elements
    this.investmentsHeading = page.getByRole('heading', { name: /my investments|investments|portfolio/i });
    this.investmentCards = page.locator('[data-testid="investment-card"]');
    this.welcomeMessage = page.locator('[data-testid="welcome-message"]').or(
      page.getByText(/welcome/i)
    );

    // Navigation tabs
    this.overviewTab = page.getByRole('tab', { name: /overview/i }).or(
      page.locator('[data-tab="overview"]')
    );
    this.capitalCallsTab = page.getByRole('tab', { name: /capital calls/i }).or(
      page.locator('[data-tab="capital-calls"]')
    );
    this.distributionsTab = page.getByRole('tab', { name: /distributions/i }).or(
      page.locator('[data-tab="distributions"]')
    );
    this.documentsTab = page.getByRole('tab', { name: /documents/i }).or(
      page.locator('[data-tab="documents"]')
    );
    this.updatesTab = page.getByRole('tab', { name: /updates/i }).or(
      page.locator('[data-tab="updates"]')
    );

    // Capital calls section
    this.capitalCallsList = page.locator('[data-testid="capital-calls-list"]');
    this.capitalCallCard = page.locator('[data-testid="capital-call-card"]');
    this.wireInitiatedButton = page.getByRole('button', { name: /wire initiated|mark.*wire/i });
    this.uploadProofButton = page.getByRole('button', { name: /upload.*proof|attach.*proof/i });

    // Distributions section
    this.distributionsList = page.locator('[data-testid="distributions-list"]');
    this.distributionCard = page.locator('[data-testid="distribution-card"]');
    this.viewStatementButton = page.getByRole('button', { name: /view statement/i });

    // Documents section
    this.documentsList = page.locator('[data-testid="documents-list"]');
    this.documentRow = page.locator('[data-testid="document-row"]');
    this.downloadButton = page.getByRole('button', { name: /download/i });

    // Summary metrics
    this.totalInvestedAmount = page.locator('[data-testid="total-invested"]');
    this.totalDistributedAmount = page.locator('[data-testid="total-distributed"]');
    this.pendingCapitalCalls = page.locator('[data-testid="pending-calls"]');
  }

  /**
   * Navigate to LP portal
   */
  async goto() {
    await this.page.goto('/lp/portal');
    await this.waitForPageLoad();
  }

  /**
   * Navigate to LP portal with specific deal context
   */
  async gotoInvestment(dealId: string) {
    await this.page.goto(`/lp/portal/my-investments/${dealId}`);
    await this.waitForPageLoad();
  }

  /**
   * Navigate via magic link token
   */
  async gotoWithToken(token: string) {
    await this.page.goto(`/lp/portal?token=${token}`);
    await this.waitForPageLoad();
  }

  /**
   * Verify LP portal is visible
   */
  async expectPortalVisible() {
    // Look for any indication we're on the LP portal
    const portalIndicators = this.page.locator('[data-page="lp-portal"]').or(
      this.investmentsHeading
    ).or(
      this.page.getByText(/your investments/i)
    );

    await expect(portalIndicators.first()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get count of investment cards
   */
  async getInvestmentCount(): Promise<number> {
    return await this.investmentCards.count();
  }

  /**
   * Click on an investment card by deal name
   */
  async clickInvestment(dealName: string) {
    await this.investmentCards.filter({ hasText: dealName }).first().click();
    await this.waitForPageLoad();
  }

  /**
   * Switch to capital calls tab
   */
  async goToCapitalCallsTab() {
    await this.capitalCallsTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Switch to distributions tab
   */
  async goToDistributionsTab() {
    await this.distributionsTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Switch to documents tab
   */
  async goToDocumentsTab() {
    await this.documentsTab.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get capital call count
   */
  async getCapitalCallCount(): Promise<number> {
    return await this.capitalCallCard.count();
  }

  /**
   * Get distribution count
   */
  async getDistributionCount(): Promise<number> {
    return await this.distributionCard.count();
  }

  /**
   * Get document count
   */
  async getDocumentCount(): Promise<number> {
    return await this.documentRow.count();
  }

  /**
   * Click capital call to view details
   */
  async viewCapitalCallDetail(title: string) {
    await this.capitalCallCard.filter({ hasText: title }).first().click();
    await this.waitForPageLoad();
  }

  /**
   * Click distribution to view details
   */
  async viewDistributionDetail(title: string) {
    await this.distributionCard.filter({ hasText: title }).first().click();
    await this.waitForPageLoad();
  }

  /**
   * Mark wire as initiated for a capital call
   */
  async markWireInitiated(wireReference?: string) {
    await this.wireInitiatedButton.click();

    // If wire reference modal appears, fill it
    const wireRefInput = this.page.locator('input[name="wireReference"]');
    if (await wireRefInput.isVisible() && wireReference) {
      await wireRefInput.fill(wireReference);
    }

    // Confirm
    const confirmButton = this.page.getByRole('button', { name: /confirm|submit/i });
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    await this.waitForPageLoad();
  }

  /**
   * Upload wire proof document
   */
  async uploadWireProof(filePath: string) {
    await this.uploadProofButton.click();

    // Handle file upload
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Wait for upload
    await this.page.waitForTimeout(1000);
    await this.waitForPageLoad();
  }

  /**
   * Download a distribution statement
   */
  async downloadStatement(distributionTitle: string) {
    await this.distributionCard.filter({ hasText: distributionTitle })
      .locator(this.viewStatementButton)
      .click();

    // Wait for download to start
    const downloadPromise = this.page.waitForEvent('download');
    await downloadPromise;
  }

  /**
   * Download a document
   */
  async downloadDocument(documentName: string) {
    const downloadPromise = this.page.waitForEvent('download');
    await this.documentRow.filter({ hasText: documentName })
      .locator(this.downloadButton)
      .click();
    return await downloadPromise;
  }

  /**
   * Get total invested amount displayed
   */
  async getTotalInvested(): Promise<string> {
    return await this.totalInvestedAmount.textContent() || '';
  }

  /**
   * Get total distributed amount displayed
   */
  async getTotalDistributed(): Promise<string> {
    return await this.totalDistributedAmount.textContent() || '';
  }

  /**
   * Check if there are pending capital calls
   */
  async hasPendingCapitalCalls(): Promise<boolean> {
    const pendingText = await this.pendingCapitalCalls.textContent();
    return pendingText !== null && !pendingText.includes('0');
  }

  /**
   * Verify user cannot access GP routes
   */
  async verifyCannotAccessGPRoutes() {
    // Try to navigate to GP-only pages
    await this.page.goto('/deals');
    await this.waitForPageLoad();

    // Should be redirected or see access denied
    const currentUrl = this.getCurrentUrl();
    const accessDenied = this.page.getByText(/access denied|unauthorized|forbidden/i);

    // Either redirected back or showing access denied
    const isBlocked = currentUrl.includes('/lp/') ||
                      currentUrl.includes('/login') ||
                      await accessDenied.isVisible().catch(() => false);

    expect(isBlocked).toBe(true);
  }

  /**
   * Verify LP can only see their own data
   */
  async verifyDataIsolation(expectedDealName: string, unexpectedDealName: string) {
    await this.goto();
    await this.expectPortalVisible();

    // Should see their investment
    const ownInvestment = this.page.getByText(expectedDealName);
    await expect(ownInvestment).toBeVisible();

    // Should NOT see other LP's investment
    const otherInvestment = this.page.getByText(unexpectedDealName);
    await expect(otherInvestment).not.toBeVisible();
  }
}

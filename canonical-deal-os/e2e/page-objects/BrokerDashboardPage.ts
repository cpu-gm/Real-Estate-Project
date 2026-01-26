import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for Broker Dashboard
 * Tests broker-specific dashboard with listings, inquiries, and activity
 */
export class BrokerDashboardPage extends BasePage {
  // Summary Cards
  readonly activeListingsCard: Locator;
  readonly pendingInquiriesCard: Locator;
  readonly buyersInDDCard: Locator;
  readonly projectedCommissionCard: Locator;

  // Funnel Chart
  readonly funnelSection: Locator;
  readonly funnelChart: Locator;

  // Activity Timeline
  readonly activitySection: Locator;
  readonly activityItems: Locator;

  // Listings Grid
  readonly listingsSection: Locator;
  readonly listingCards: Locator;

  // Quick Stats
  readonly quickStatsSection: Locator;

  // Page Header
  readonly pageTitle: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    super(page);

    // Summary Cards - look for the card titles
    this.activeListingsCard = page.locator('text=Active Listings').first();
    this.pendingInquiriesCard = page.locator('text=Pending Inquiries').first();
    this.buyersInDDCard = page.locator('text=Buyers in DD').first();
    this.projectedCommissionCard = page.locator('text=Projected Commission').first();

    // Funnel Chart section - look for the card containing "Buyer Funnel"
    this.funnelSection = page.locator('h3, [class*="CardTitle"]').filter({ hasText: 'Buyer Funnel' }).first();
    this.funnelChart = page.locator('[data-testid="funnel-chart"]').or(
      page.locator('.recharts-responsive-container')
    ).or(
      page.locator('text=Distributed')
    ).or(
      this.funnelSection
    );

    // Activity Timeline - look for the card containing "Recent Activity"
    this.activitySection = page.locator('h3, [class*="CardTitle"]').filter({ hasText: 'Recent Activity' }).first();
    this.activityItems = page.locator('[data-testid="activity-item"]');

    // Listings Grid
    this.listingsSection = page.locator('text=Your Active Listings').or(
      page.locator('text=Active Listings')
    ).first();
    this.listingCards = page.locator('[data-testid="listing-card"]').or(
      page.locator('.listing-card')
    );

    // Quick Stats
    this.quickStatsSection = page.locator('text=Quick Stats').first();

    // Page Header
    this.pageTitle = page.locator('h1, h2').filter({ hasText: /Broker Dashboard|Dashboard/ }).first();
    this.refreshButton = page.locator('button').filter({ hasText: /refresh/i });
  }

  /**
   * Navigate to broker dashboard
   */
  async goto() {
    await this.navigateTo('BrokerDashboard');
  }

  /**
   * Check if dashboard loaded successfully
   */
  async isLoaded(): Promise<boolean> {
    try {
      // Wait for either page title or summary cards
      await Promise.race([
        this.pageTitle.waitFor({ timeout: 10000 }),
        this.activeListingsCard.waitFor({ timeout: 10000 })
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the value from a summary card by label
   */
  async getSummaryCardValue(label: string): Promise<string> {
    const card = this.page.locator(`text=${label}`).locator('..').locator('xpath=..').locator('.text-2xl, .text-3xl, .font-bold').first();
    const value = await card.textContent({ timeout: 5000 }).catch(() => null);
    return value || '0';
  }

  /**
   * Get total active listings count
   */
  async getActiveListingsCount(): Promise<number> {
    const value = await this.getSummaryCardValue('Active Listings');
    return parseInt(value.replace(/[^0-9]/g, '')) || 0;
  }

  /**
   * Get pending inquiries count
   */
  async getPendingInquiriesCount(): Promise<number> {
    const value = await this.getSummaryCardValue('Pending Inquiries');
    return parseInt(value.replace(/[^0-9]/g, '')) || 0;
  }

  /**
   * Click on a listing card by index
   */
  async clickListing(index: number = 0) {
    await this.listingCards.nth(index).click();
    await this.waitForPageLoad();
  }

  /**
   * Check if funnel chart is visible
   */
  async isFunnelVisible(): Promise<boolean> {
    return await this.funnelSection.isVisible({ timeout: 5000 }).catch(() => false) ||
           await this.funnelChart.isVisible({ timeout: 5000 }).catch(() => false);
  }

  /**
   * Check if activity timeline is visible
   */
  async isActivityVisible(): Promise<boolean> {
    return await this.activitySection.isVisible({ timeout: 5000 }).catch(() => false);
  }

  /**
   * Get activity item count
   */
  async getActivityCount(): Promise<number> {
    const count = await this.activityItems.count();
    return count;
  }

  /**
   * Get listing card count
   */
  async getListingCount(): Promise<number> {
    const count = await this.listingCards.count();
    return count;
  }

  /**
   * Check if empty state is shown (no listings)
   */
  async hasEmptyState(): Promise<boolean> {
    return await this.page.locator('text=No active listings').isVisible({ timeout: 3000 }).catch(() => false) ||
           await this.page.locator('text=no listings').isVisible({ timeout: 3000 }).catch(() => false);
  }
}

import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for GP Counsel Dashboard (Kanban view)
 */
export class GPCounselPage extends BasePage {
  readonly dashboardTitle: Locator;
  readonly newMatterButton: Locator;
  readonly kanbanBoard: Locator;
  readonly newColumn: Locator;
  readonly inProgressColumn: Locator;
  readonly completeColumn: Locator;
  readonly matterCards: Locator;
  readonly statsBar: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dashboardTitle = page.locator('h1:has-text("Legal Dashboard")');
    this.newMatterButton = page.getByRole('button', { name: /new matter/i });
    this.kanbanBoard = page.locator('[data-testid="kanban-board"]');
    this.newColumn = page.locator('[data-stage="NEW"]');
    this.inProgressColumn = page.locator('[data-stage="IN_PROGRESS"]');
    this.completeColumn = page.locator('[data-stage="COMPLETE"]');
    this.matterCards = page.locator('[data-testid="matter-card"]');
    this.statsBar = page.locator('[data-testid="stats-bar"]');
    this.refreshButton = page.getByRole('button', { name: /refresh/i });
  }

  async goto() {
    await this.page.goto('/GPCounselHome', { waitUntil: 'domcontentloaded' });
    await this.dashboardTitle.waitFor({ state: 'visible', timeout: 10000 });
  }

  async getMatterCount(stage: 'NEW' | 'IN_PROGRESS' | 'COMPLETE'): Promise<number> {
    const column = stage === 'NEW' ? this.newColumn :
                   stage === 'IN_PROGRESS' ? this.inProgressColumn :
                   this.completeColumn;
    const countBadge = column.locator('.count-badge');
    const text = await countBadge.textContent();
    return parseInt(text || '0', 10);
  }

  async clickNewMatter() {
    await this.newMatterButton.click();
  }

  async getMatterCardByTitle(title: string): Promise<Locator> {
    return this.page.locator(`[data-testid="matter-card"]:has-text("${title}")`);
  }

  async dragMatterToStage(matterTitle: string, targetStage: 'IN_PROGRESS' | 'COMPLETE') {
    const card = await this.getMatterCardByTitle(matterTitle);
    const targetColumn = targetStage === 'IN_PROGRESS' ? this.inProgressColumn : this.completeColumn;
    await card.dragTo(targetColumn);
  }

  async getUrgentMattersCount(): Promise<number> {
    const urgentSection = this.page.locator('h3:has-text("Urgent Matters")').locator('..');
    const items = urgentSection.locator('button');
    return await items.count();
  }

  async getMyMattersCount(): Promise<number> {
    const mySection = this.page.locator('h3:has-text("My Matters")').locator('..');
    const items = mySection.locator('button');
    return await items.count();
  }

  async clickStatCard(label: string) {
    const statCard = this.statsBar.locator(`button:has-text("${label}")`);
    await statCard.click();
  }

  async refresh() {
    await this.refreshButton.click();
    // Wait for refresh to complete
    await this.page.waitForResponse(resp => resp.url().includes('/api/legal/dashboard'));
  }

  async waitForDashboardLoad() {
    await this.kanbanBoard.waitFor({ state: 'visible', timeout: 10000 });
  }
}

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for the Login page
 */
export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.getByRole('button', { name: /sign in/i });
    this.errorAlert = page.locator('[role="alert"]');
  }

  /**
   * Navigate to the login page
   */
  async goto() {
    await this.page.goto('/Login', { waitUntil: 'domcontentloaded' });
    // Wait for the email input to be visible, indicating the page has loaded
    await this.emailInput.waitFor({ state: 'visible', timeout: 30000 });
  }

  /**
   * Fill in credentials and submit the login form
   */
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();

    // Wait for navigation or error
    await Promise.race([
      this.page.waitForURL(/Home|PendingVerification/, { timeout: 10000 }),
      this.errorAlert.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);
  }

  /**
   * Log out the current user
   */
  async logout() {
    // Click user menu / avatar dropdown
    const userMenu = this.page.locator('[data-testid="user-menu"]').or(
      this.page.getByRole('button', { name: /profile|account|logout/i })
    ).or(
      this.page.locator('.user-avatar, .avatar-button')
    );

    // Try to find and click logout - could be in dropdown or directly visible
    const logoutButton = this.page.getByRole('menuitem', { name: /logout|sign out/i }).or(
      this.page.getByRole('button', { name: /logout|sign out/i })
    );

    // Try dropdown first
    if (await userMenu.count() > 0) {
      await userMenu.first().click();
      await this.page.waitForTimeout(300);
    }

    if (await logoutButton.count() > 0) {
      await logoutButton.first().click();
    } else {
      // Fallback: clear localStorage directly
      await this.page.evaluate(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      });
      await this.page.goto('/Login');
    }

    await this.waitForPageLoad();
  }

  /**
   * Check if user is currently logged in
   */
  async isLoggedIn(): Promise<boolean> {
    const token = await this.page.evaluate(() => localStorage.getItem('auth_token'));
    return !!token;
  }

  /**
   * Get the current error message (if any)
   */
  async getErrorMessage(): Promise<string | null> {
    if (await this.errorAlert.isVisible()) {
      return await this.errorAlert.textContent();
    }
    return null;
  }
}

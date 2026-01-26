import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/LoginPage';

/**
 * Authentication smoke tests
 * Tests login/logout flow with test accounts
 *
 * Prerequisites:
 * - npm run db:seed:auth (creates test users)
 * - Services running (npm run start)
 */
test.describe('Authentication', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    // Navigate first to allow localStorage access
    await page.goto('/Login');
    // Clear any existing auth state
    await page.evaluate(() => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    });
  });

  test('should display login form', async ({ page }) => {
    await loginPage.goto();

    // Check for login page elements (CardTitle may not render as heading)
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('should login with valid GP credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login('gp@canonical.com', 'gp123');

    // Verify redirect to Home
    await expect(page).toHaveURL(/Home/);

    // Verify auth token stored
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();

    // Verify user stored
    const user = await page.evaluate(() => localStorage.getItem('auth_user'));
    expect(user).toBeTruthy();
    const userData = JSON.parse(user!);
    expect(userData.email).toBe('gp@canonical.com');
  });

  test('should login with valid Admin credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login('admin@canonical.com', 'admin123');

    // Verify redirect to Home
    await expect(page).toHaveURL(/Home/);

    // Verify admin user stored
    const user = await page.evaluate(() => localStorage.getItem('auth_user'));
    expect(user).toBeTruthy();
    const userData = JSON.parse(user!);
    expect(userData.email).toBe('admin@canonical.com');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login('invalid@test.com', 'wrongpassword');

    // Should stay on login page
    await expect(page).toHaveURL(/Login/);

    // Should show error message
    await expect(loginPage.errorAlert).toBeVisible();

    // Should not have token
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeFalsy();
  });

  test('should show error for empty credentials', async ({ page }) => {
    await loginPage.goto();

    // Try to submit without filling
    await loginPage.submitButton.click();

    // HTML5 validation should prevent submission
    // Check we're still on login page
    await expect(page).toHaveURL(/Login/);
  });

  test('should logout and clear session', async ({ page }) => {
    // First login
    await loginPage.goto();
    await loginPage.login('gp@canonical.com', 'gp123');
    await expect(page).toHaveURL(/Home/);

    // Verify logged in
    const tokenBefore = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(tokenBefore).toBeTruthy();

    // Logout
    await loginPage.logout();

    // Verify token cleared
    const tokenAfter = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(tokenAfter).toBeFalsy();

    // Verify redirected to login
    await expect(page).toHaveURL(/Login/);
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access protected page directly
    await page.goto('/Home');

    // Should redirect to login
    await expect(page).toHaveURL(/Login/);
  });

  test('should persist session across page reload', async ({ page }) => {
    // Login
    await loginPage.goto();
    await loginPage.login('gp@canonical.com', 'gp123');
    await expect(page).toHaveURL(/Home/);

    // Reload page
    await page.reload();

    // Should still be on Home (not redirected to login)
    await expect(page).toHaveURL(/Home/);

    // Token should still exist
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
  });
});

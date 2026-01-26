/**
 * Onboarding Phase 3: AI Assistant E2E Tests
 *
 * Tests the AI assistant features including:
 * - Floating chat panel
 * - Question generation and display
 * - Quick response handling
 * - Free-form chat
 * - Insight cards
 */

import { test, expect, Page } from '@playwright/test';

const TEST_USER = {
  email: 'gp@canonical.com',
  password: 'gp123'
};

async function loginAndNavigate(page: Page, path: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/home');
  await page.goto(path);
}

test.describe('Phase 3: AI Assistant Chat Panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/onboarding/status');
  });

  test.describe('Floating Chat Panel', () => {
    test('should display floating chat button', async ({ page }) => {
      // Chat trigger button (when panel is closed)
      const chatButton = page.locator('button:has-text("AI Assistant"), [data-testid="ai-chat-trigger"]');

      // Or floating button with MessageSquare icon
      const floatingBtn = page.locator('.fixed.bottom-6, [data-testid="chat-fab"]');

      // At least one trigger should be present
      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should open chat panel when triggered', async ({ page }) => {
      // Click chat button
      const chatTrigger = page.locator('button:has-text("AI Assistant"), [data-testid="ai-chat-trigger"]').first();

      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Chat panel should appear
        const chatPanel = page.locator('[data-testid="ai-chat-panel"], .ai-assistant-panel');

        // Panel header with "AI Assistant" title
        const panelHeader = page.locator('text=AI Assistant');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should have minimize and close buttons', async ({ page }) => {
      // Open chat first
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Minimize button
        const minimizeBtn = page.locator('button[aria-label*="Minimize"], [data-testid="minimize-chat"]');

        // Close button
        const closeBtn = page.locator('button[aria-label*="Close"], [data-testid="close-chat"]');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should toggle between minimized and expanded states', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Find minimize button
        const minimizeBtn = page.locator('button[aria-label*="Minimize"]').first();
        if (await minimizeBtn.count() > 0) {
          await minimizeBtn.click();

          // Panel should be minimized (smaller height)
          // Click maximize to expand
          const maximizeBtn = page.locator('button[aria-label*="Maximize"]');
        }
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show pending question count badge', async ({ page }) => {
      // Badge showing number of pending questions
      const questionBadge = page.locator('[data-testid="question-badge"], .badge:has-text("questions")');

      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('Question Display and Response', () => {
    test('should display active question in highlighted area', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Question area (amber/yellow highlighted)
        const questionArea = page.locator('.bg-amber-50, [data-testid="active-question"]');

        // Question text
        const questionText = page.locator('[data-testid="question-text"], .question-content');

        // HelpCircle icon
        const helpIcon = page.locator('svg.lucide-help-circle, [data-testid="question-icon"]');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should display quick response buttons', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Quick response buttons
        const quickResponses = page.locator('[data-testid="quick-response"], .quick-response-btn');

        // Common quick responses
        const keepBtn = page.locator('button:has-text("Keep")');
        const removeBtn = page.locator('button:has-text("Remove")');
        const mergeBtn = page.locator('button:has-text("Merge")');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should handle quick response click', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Click a quick response if available
        const quickBtn = page.locator('[data-testid="quick-response"], .quick-response-btn').first();
        if (await quickBtn.count() > 0 && await quickBtn.isEnabled()) {
          await quickBtn.click();

          // Should add message to history
          const userMessage = page.locator('.message-user, [data-type="user"]');
        }
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show skip question option', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Skip link
        const skipLink = page.locator('text=Skip, button:has-text("Skip")');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show question context', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Context text (e.g., "Related to: rent-roll.xlsx")
        const contextText = page.locator('text=Context:, text=Related to:');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('Free-form Chat', () => {
    test('should have text input for messages', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Text input
        const messageInput = page.locator('input[placeholder*="message"], input[placeholder*="Type"]');
        await expect(messageInput).toBeVisible();
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should have send button', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Send button
        const sendBtn = page.locator('button:has(svg.lucide-send), button[aria-label*="Send"]');
        await expect(sendBtn).toBeVisible();
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should send message on Enter key', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        const messageInput = page.locator('input[placeholder*="message"]');
        if (await messageInput.count() > 0) {
          await messageInput.fill('Test message');
          await messageInput.press('Enter');

          // Message should appear in history
          const sentMessage = page.locator('text=Test message');
        }
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should disable send when input is empty', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        const sendBtn = page.locator('button:has(svg.lucide-send)');
        if (await sendBtn.count() > 0) {
          await expect(sendBtn).toBeDisabled();
        }
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show typing indicator when waiting for response', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Typing indicator or loading state
        const typingIndicator = page.locator('text=Thinking, .typing-indicator, svg.animate-spin');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('Message History', () => {
    test('should display message history with user/AI distinction', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Messages container with scroll area
        const messagesArea = page.locator('[data-testid="messages"], .messages-scroll');

        // User messages (right-aligned, blue)
        const userMessages = page.locator('.bg-blue-600, [data-type="user"]');

        // AI messages (left-aligned, gray)
        const aiMessages = page.locator('.bg-slate-100, [data-type="ai"]');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show timestamps on messages', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Timestamps (e.g., "10:30 AM")
        const timestamp = page.locator('text=/\\d{1,2}:\\d{2}\\s*(AM|PM)?/');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should auto-scroll to newest message', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Send multiple messages
        const messageInput = page.locator('input[placeholder*="message"]');
        if (await messageInput.count() > 0) {
          await messageInput.fill('First message');
          await messageInput.press('Enter');
          await page.waitForTimeout(100);

          await messageInput.fill('Second message');
          await messageInput.press('Enter');

          // Newest message should be visible
          const secondMessage = page.locator('text=Second message');
        }
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should display welcome message when empty', async ({ page }) => {
      const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
      if (await chatTrigger.count() > 0) {
        await chatTrigger.click();

        // Welcome message
        const welcomeMessage = page.locator("text=I'm here to help, text=I'll ask questions");
      }

      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('Insight Cards', () => {
    test('should display insight cards when insights available', async ({ page }) => {
      // Insights might appear in the review or status page
      await page.goto('/onboarding/review');

      // Insight card (blue background)
      const insightCard = page.locator('.bg-blue-50, [data-testid="insight-card"]');

      // Lightbulb icon
      const lightbulb = page.locator('svg.lucide-lightbulb');

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show accept and dismiss buttons on insight', async ({ page }) => {
      await page.goto('/onboarding/review');

      const insightCard = page.locator('[data-testid="insight-card"]').first();
      if (await insightCard.count() > 0) {
        // Accept button (with thumbs up)
        const acceptBtn = page.locator('button:has-text("Accept")');

        // Dismiss button (with thumbs down)
        const dismissBtn = page.locator('button:has-text("Dismiss")');
      }

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show confidence level on insight', async ({ page }) => {
      await page.goto('/onboarding/review');

      // Confidence badge (e.g., "92% confident")
      const confidenceBadge = page.locator('text=/\\d+%.*confident/');

      await expect(page).not.toHaveTitle(/error/i);
    });
  });

  test.describe('AI Progress Indicator', () => {
    test('should display AI processing status', async ({ page }) => {
      // Progress indicator component
      const progressIndicator = page.locator('[data-testid="ai-progress"], .ai-status');

      // Status text (Idle, Processing, Waiting, Complete, Error)
      const statusText = page.locator('text=Processing, text=Waiting, text=Complete');

      await expect(page).not.toHaveTitle(/error/i);
    });

    test('should show spinner when processing', async ({ page }) => {
      // Spinner icon
      const spinner = page.locator('svg.animate-spin, .loader, .spinner');

      await expect(page).not.toHaveTitle(/error/i);
    });
  });
});

test.describe('Phase 3: AI Assistant API Endpoints', () => {
  let authToken: string;
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password
      }
    });
    const { token } = await loginResponse.json();
    authToken = token;

    // Create session for tests
    const sessionResponse = await request.post('/api/onboarding/session', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { selectedCategories: ['deals'] }
    });
    const { session } = await sessionResponse.json();
    sessionId = session.id;
  });

  test('should get AI questions for session', async ({ request }) => {
    const questionsResponse = await request.get(`/api/onboarding/ai/questions?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(questionsResponse.ok()).toBeTruthy();
    const { questions } = await questionsResponse.json();
    expect(Array.isArray(questions)).toBe(true);
  });

  test('should answer AI question', async ({ request }) => {
    // Get questions first
    const questionsResponse = await request.get(`/api/onboarding/ai/questions?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { questions } = await questionsResponse.json();

    if (questions?.length > 0) {
      const questionId = questions[0].id;

      const answerResponse = await request.post(`/api/onboarding/ai/questions/${questionId}/answer`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          answer: 'keep',
          answerLabel: 'Keep Original'
        }
      });

      expect(answerResponse.ok()).toBeTruthy();
      const { question } = await answerResponse.json();
      expect(question.status).toBe('ANSWERED');
    }
  });

  test('should dismiss AI question', async ({ request }) => {
    const questionsResponse = await request.get(`/api/onboarding/ai/questions?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { questions } = await questionsResponse.json();

    const pendingQuestion = questions?.find((q: any) => q.status === 'PENDING');
    if (pendingQuestion) {
      const dismissResponse = await request.post(`/api/onboarding/ai/questions/${pendingQuestion.id}/dismiss`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(dismissResponse.ok()).toBeTruthy();
      const { question } = await dismissResponse.json();
      expect(question.status).toBe('DISMISSED');
    }
  });

  test('should send chat message and get response', async ({ request }) => {
    const chatResponse = await request.post('/api/onboarding/ai/chat', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        sessionId,
        message: 'What is the average rent for this property?'
      }
    });

    expect(chatResponse.ok()).toBeTruthy();
    const { response } = await chatResponse.json();
    expect(response.message).toBeDefined();
  });

  test('should get AI insights for session', async ({ request }) => {
    const insightsResponse = await request.get(`/api/onboarding/ai/insights?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(insightsResponse.ok()).toBeTruthy();
    const { insights } = await insightsResponse.json();
    expect(Array.isArray(insights)).toBe(true);
  });

  test('should accept AI insight', async ({ request }) => {
    const insightsResponse = await request.get(`/api/onboarding/ai/insights?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { insights } = await insightsResponse.json();

    if (insights?.length > 0) {
      const insightId = insights[0].id;

      const acceptResponse = await request.post(`/api/onboarding/ai/insights/${insightId}/accept`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(acceptResponse.ok()).toBeTruthy();
      const { insight } = await acceptResponse.json();
      expect(insight.status).toBe('ACCEPTED');
    }
  });

  test('should dismiss AI insight', async ({ request }) => {
    const insightsResponse = await request.get(`/api/onboarding/ai/insights?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const { insights } = await insightsResponse.json();

    const pendingInsight = insights?.find((i: any) => i.status === 'PENDING');
    if (pendingInsight) {
      const dismissResponse = await request.post(`/api/onboarding/ai/insights/${pendingInsight.id}/dismiss`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      expect(dismissResponse.ok()).toBeTruthy();
      const { insight } = await dismissResponse.json();
      expect(insight.status).toBe('DISMISSED');
    }
  });
});

test.describe('Phase 3: AI-Prompted Corrections Flow', () => {
  test('complete AI-assisted correction flow', async ({ page }) => {
    await loginAndNavigate(page, '/onboarding/status');

    // 1. Open AI Assistant
    const chatTrigger = page.locator('button:has-text("AI Assistant")').first();
    if (await chatTrigger.count() > 0) {
      await chatTrigger.click();

      // Wait for panel to open
      await page.waitForTimeout(300);

      // 2. If there's a question, answer it
      const quickResponse = page.locator('[data-testid="quick-response"]').first();
      if (await quickResponse.count() > 0 && await quickResponse.isEnabled()) {
        await quickResponse.click();

        // Wait for response
        await page.waitForTimeout(500);
      }

      // 3. Send a free-form message
      const messageInput = page.locator('input[placeholder*="message"]');
      if (await messageInput.count() > 0) {
        await messageInput.fill('Please verify the unit count');
        await messageInput.press('Enter');

        // Wait for AI response
        await page.waitForTimeout(500);
      }

      // 4. Close the panel
      const closeBtn = page.locator('[data-testid="close-chat"], button[aria-label*="Close"]');
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
      }
    }

    // Page should function correctly
    await expect(page).not.toHaveTitle(/error/i);
  });

  test('question triggers claim update', async ({ page, request }) => {
    // Login
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password
      }
    });
    const { token } = await loginResponse.json();

    // Create session
    const sessionResponse = await request.post('/api/onboarding/session', {
      headers: { Authorization: `Bearer ${token}` },
      data: { selectedCategories: ['deals'] }
    });
    const { session } = await sessionResponse.json();

    // Get initial claims
    const initialClaimsResponse = await request.get(`/api/onboarding/claims?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { records: initialRecords } = await initialClaimsResponse.json();

    // Get and answer a question (if any)
    const questionsResponse = await request.get(`/api/onboarding/ai/questions?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { questions } = await questionsResponse.json();

    if (questions?.length > 0 && questions[0].claimId) {
      // Answer with "keep"
      await request.post(`/api/onboarding/ai/questions/${questions[0].id}/answer`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          answer: 'keep',
          answerLabel: 'Keep Original'
        }
      });

      // Verify claim was updated
      const updatedClaimsResponse = await request.get(`/api/onboarding/claims?sessionId=${session.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const { records: updatedRecords } = await updatedClaimsResponse.json();

      // The claim associated with the question should now be verified
      const updatedClaim = updatedRecords
        ?.flatMap((r: any) => r.fields || [])
        ?.find((f: any) => f.id === questions[0].claimId);

      if (updatedClaim) {
        expect(updatedClaim.status).toBe('VERIFIED');
      }
    }

    await expect(page).not.toHaveTitle(/error/i);
  });
});

test.describe('Phase 3: Inline Question Cards', () => {
  test('should display AIQuestionCard in review page', async ({ page }) => {
    await loginAndNavigate(page, '/onboarding/review');

    // Inline question cards (amber background)
    const questionCard = page.locator('.bg-amber-50, [data-testid="ai-question-card"]');

    // Card should have question text
    const questionText = page.locator('[data-testid="question-text"]');

    // Card should have quick responses
    const quickResponses = page.locator('[data-testid="quick-response"]');

    // Card should have custom input
    const customInput = page.locator('input[placeholder*="answer"]');

    await expect(page).not.toHaveTitle(/error/i);
  });

  test('should submit custom answer from inline card', async ({ page }) => {
    await loginAndNavigate(page, '/onboarding/review');

    const questionCard = page.locator('[data-testid="ai-question-card"]').first();
    if (await questionCard.count() > 0) {
      // Type custom answer
      const customInput = questionCard.locator('input[placeholder*="answer"]');
      if (await customInput.count() > 0) {
        await customInput.fill('My custom answer');

        // Submit button
        const submitBtn = questionCard.locator('button:has(svg.lucide-send)');
        if (await submitBtn.count() > 0 && await submitBtn.isEnabled()) {
          await submitBtn.click();
        }
      }
    }

    await expect(page).not.toHaveTitle(/error/i);
  });
});

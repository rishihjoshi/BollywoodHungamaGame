// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Home Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows both game cards', async ({ page }) => {
    await expect(page.locator('.game-card-name').first()).toContainText('Kaun hai Gabbar');
    await expect(page.locator('.game-card-name').nth(1)).toContainText('Picture Abhi Baaki Hai');
  });

  test('PABH Play button is visible and clickable', async ({ page }) => {
    const btn = page.locator('#btn-pabh-start');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test('KHG game card is unaffected', async ({ page }) => {
    await expect(page.locator('#btn-home-start')).toBeVisible();
    await expect(page.locator('#btn-home-rules')).toBeVisible();
  });
});

test.describe('PABH Setup Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-pabh-start');
  });

  test('navigates to setup screen', async ({ page }) => {
    await expect(page.locator('[data-screen="pabh-setup"]')).toHaveClass(/screen-active/);
  });

  test('shows 3 player inputs by default', async ({ page }) => {
    const inputs = page.locator('#pabh-player-list input');
    await expect(inputs).toHaveCount(3);
  });

  test('Start button is disabled with empty player names', async ({ page }) => {
    await expect(page.locator('#pabh-btn-start')).toBeDisabled();
  });

  test('Start button enables after 3 names entered', async ({ page }) => {
    const inputs = page.locator('#pabh-player-list input');
    await inputs.nth(0).fill('Alice');
    await inputs.nth(1).fill('Bob');
    await inputs.nth(2).fill('Charlie');
    await expect(page.locator('#pabh-btn-start')).toBeEnabled();
  });

  test('can add a player', async ({ page }) => {
    await page.click('#pabh-btn-add-player');
    await expect(page.locator('#pabh-player-list input')).toHaveCount(4);
  });

  test('can remove a player (not below 3)', async ({ page }) => {
    await page.click('#pabh-btn-add-player');
    await expect(page.locator('#pabh-player-list input')).toHaveCount(4);
    await page.locator('.btn-remove').first().click();
    await expect(page.locator('#pabh-player-list input')).toHaveCount(3);
  });

  test('remove button disabled at minimum 3 players', async ({ page }) => {
    const countBefore = await page.locator('#pabh-player-list input').count();
    await page.locator('.btn-remove').first().click();
    // Should still have 3 — remove blocked
    await expect(page.locator('#pabh-player-list input')).toHaveCount(countBefore);
  });

  test('round selector toggles selected state', async ({ page }) => {
    const btn3 = page.locator('#pabh-round-selector .pabh-option-btn[data-value="3"]');
    await btn3.click();
    await expect(btn3).toHaveClass(/selected/);
    const btn5 = page.locator('#pabh-round-selector .pabh-option-btn[data-value="5"]');
    await expect(btn5).not.toHaveClass(/selected/);
  });

  test('timer selector toggles and shows preview text', async ({ page }) => {
    const btn60 = page.locator('#pabh-timer-selector .pabh-option-btn[data-value="60"]');
    await btn60.click();
    await expect(btn60).toHaveClass(/selected/);
    await expect(page.locator('#pabh-timer-preview')).toContainText('Fast & chaotic');
  });

  test('timer 90s shows Recommended badge', async ({ page }) => {
    await expect(page.locator('#pabh-timer-preview')).toContainText('Sweet spot');
    await expect(page.locator('#pabh-timer-preview .badge-recommended')).toBeVisible();
  });

  test('back button returns to home', async ({ page }) => {
    await page.click('#pabh-btn-back-home');
    await expect(page.locator('[data-screen="screen-home"]')).toHaveClass(/screen-active/);
  });
});

test.describe('PABH Game Flow', () => {
  async function fillPlayersAndStart(page, names = ['Alice', 'Bob', 'Charlie']) {
    await page.goto('/');
    await page.click('#btn-pabh-start');
    const inputs = page.locator('#pabh-player-list input');
    for (let i = 0; i < names.length; i++) {
      await inputs.nth(i).fill(names[i]);
    }
    await page.click('#pabh-btn-start');
  }

  test('start game navigates to combo screen', async ({ page }) => {
    await fillPlayersAndStart(page);
    await expect(page.locator('[data-screen="pabh-combo"]')).toHaveClass(/screen-active/);
  });

  test('combo screen shows pitcher name', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await expect(page.locator('#pabh-pitcher-name')).not.toBeEmpty();
  });

  test('combo screen shows 4 cards after reveal', async ({ page }) => {
    await fillPlayersAndStart(page);
    // Wait for stagger animation (0+300+600+900ms + 50ms each = ~1000ms total)
    await page.waitForTimeout(1200);
    const cards = page.locator('.pabh-combo-card.revealed');
    await expect(cards).toHaveCount(4);
  });

  test('wildcard card has wildcard class', async ({ page }) => {
    await fillPlayersAndStart(page);
    await page.waitForTimeout(1200);
    await expect(page.locator('.pabh-combo-card.wildcard')).toHaveCount(1);
  });

  test('Start Pitching navigates to timer screen', async ({ page }) => {
    await fillPlayersAndStart(page);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await expect(page.locator('[data-screen="pabh-timer"]')).toHaveClass(/screen-active/);
  });

  test('timer screen shows countdown number', async ({ page }) => {
    await fillPlayersAndStart(page);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    const num = page.locator('#pabh-timer-seconds');
    await expect(num).toBeVisible();
    const text = await num.textContent();
    expect(parseInt(text)).toBeGreaterThan(0);
  });

  test('timer screen shows 4 full-size combo cards (no compact chips)', async ({ page }) => {
    await fillPlayersAndStart(page);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await expect(page.locator('#pabh-timer-cards-grid .pabh-combo-card.revealed')).toHaveCount(4);
    await expect(page.locator('.pabh-compact-chip')).toHaveCount(0);
  });

  test("Time's Up navigates to vote screen", async ({ page }) => {
    await fillPlayersAndStart(page);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-btn-timesup');
    await expect(page.locator('[data-screen="pabh-vote"]')).toHaveClass(/screen-active/);
  });

  test('vote screen shows vote category', async ({ page }) => {
    await fillPlayersAndStart(page);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-btn-timesup');
    await expect(page.locator('#pabh-vote-category')).toContainText('Best Overall Pitch');
  });

  test('vote screen shows 2 vote cards for 3 players (pitcher excluded)', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-btn-timesup');
    await expect(page.locator('.pabh-vote-card')).toHaveCount(2);
  });

  test('voting advances to round result after all votes cast', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-btn-timesup');
    const cards = page.locator('.pabh-vote-card');
    // Lock In button starts disabled
    await expect(page.locator('#pabh-btn-lock-votes')).toBeDisabled();
    // Cast both votes
    await cards.nth(0).click();
    await cards.nth(1).click();
    // Lock In button now enabled
    await expect(page.locator('#pabh-btn-lock-votes')).toBeEnabled();
    // Host locks in votes
    await page.click('#pabh-btn-lock-votes');
    await expect(page.locator('[data-screen="pabh-round-result"]')).toHaveClass(/screen-active/);
  });

  test('round result shows winner banner and standings', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-btn-timesup');
    const cards = page.locator('.pabh-vote-card');
    await cards.nth(0).click();
    await cards.nth(1).click();
    await page.click('#pabh-btn-lock-votes');
    await expect(page.locator('#pabh-winner-banner')).toBeVisible();
    await expect(page.locator('#pabh-standings .pabh-score-row')).toHaveCount(3);
  });
});

test.describe('KHG game unaffected', () => {
  test('KHG Play button still navigates to setup', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-home-start');
    await expect(page.locator('[data-screen="screen-setup"]')).toHaveClass(/screen-active/);
  });

  test('KHG How to Play still works', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-home-rules');
    await expect(page.locator('[data-screen="screen-rules"]')).toHaveClass(/screen-active/);
  });
});

test.describe('PABH New Features', () => {
  async function fillPlayersAndStart(page, names = ['Alice', 'Bob', 'Charlie']) {
    await page.goto('/');
    await page.click('#btn-pabh-start');
    const inputs = page.locator('#pabh-player-list input');
    for (let i = 0; i < names.length; i++) {
      await inputs.nth(i).fill(names[i]);
    }
    await page.click('#pabh-btn-start');
  }

  // --- Timer Screen Cards ---

  test('timer screen shows 4 full-size combo cards', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await expect(page.locator('#pabh-timer-cards-grid .pabh-combo-card.revealed')).toHaveCount(4);
    await expect(page.locator('#pabh-combo-compact')).toHaveCount(0);
  });

  test('timer screen has NO compact chip elements', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await expect(page.locator('.pabh-compact-chip')).toHaveCount(0);
  });

  // --- Vote Screen Lock-In Button ---

  test('Lock In Votes button is present and starts disabled', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-btn-timesup');
    await expect(page.locator('#pabh-btn-lock-votes')).toBeVisible();
    await expect(page.locator('#pabh-btn-lock-votes')).toBeDisabled();
  });

  test('Lock In Votes enables only after all N-1 votes cast', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-btn-timesup');
    const cards = page.locator('.pabh-vote-card');
    // After 1 of 2 votes — still disabled
    await cards.nth(0).click();
    await expect(page.locator('#pabh-btn-lock-votes')).toBeDisabled();
    // After 2 of 2 votes — enabled
    await cards.nth(1).click();
    await expect(page.locator('#pabh-btn-lock-votes')).toBeEnabled();
  });

  test('game does NOT auto-advance after all votes without lock-in', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-btn-timesup');
    const cards = page.locator('.pabh-vote-card');
    await cards.nth(0).click();
    await cards.nth(1).click();
    // Wait longer than the old 600ms auto-advance delay
    await page.waitForTimeout(1000);
    // Must still be on vote screen
    await expect(page.locator('[data-screen="pabh-vote"]')).toHaveClass(/screen-active/);
  });

  // --- Abandon / Cancel Buttons ---

  test('cancel button visible on pabh-setup screen', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-pabh-start');
    await expect(page.locator('#pabh-cancel-setup')).toBeVisible();
  });

  test('cancel button visible on pabh-combo screen', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await expect(page.locator('#pabh-cancel-combo')).toBeVisible();
  });

  test('cancel button visible on pabh-timer screen', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await expect(page.locator('#pabh-cancel-timer')).toBeVisible();
  });

  test('cancel on timer screen opens abandon modal', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-cancel-timer');
    await expect(page.locator('#abandon-modal')).not.toHaveClass(/hidden/);
  });

  test('abandon confirm from timer returns to home and clears session', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await page.click('#pabh-cancel-timer');
    await page.click('#btn-abandon-confirm');
    await expect(page.locator('[data-screen="screen-home"]')).toHaveClass(/screen-active/);
    const session = await page.evaluate(() => sessionStorage.getItem('pabh-session'));
    expect(session).toBeNull();
  });

  test('abandon cancel on timer resumes countdown', async ({ page }) => {
    await fillPlayersAndStart(page, ['Alice', 'Bob', 'Charlie']);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    // Let the timer tick down at least once before pausing
    await page.waitForTimeout(1500);
    // Capture time before pause
    const before = await page.locator('#pabh-timer-seconds').textContent();
    await page.click('#pabh-cancel-timer');
    await page.waitForTimeout(2000); // 2 seconds pass while modal is open
    await page.click('#btn-abandon-cancel');
    await page.waitForTimeout(1200); // wait for at least one timer tick (1s interval)
    const after = await page.locator('#pabh-timer-seconds').textContent();
    // Timer should have resumed — after value must be less than before value
    expect(parseInt(after)).toBeLessThan(parseInt(before));
    // Timer must still be visible and active
    await expect(page.locator('[data-screen="pabh-timer"]')).toHaveClass(/screen-active/);
  });

  // --- How to Play ---

  test('PABH hub card has How to Play button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#btn-pabh-rules')).toBeVisible();
  });

  test('How to Play button navigates to pabh-rules screen', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-pabh-rules');
    await expect(page.locator('[data-screen="pabh-rules"]')).toHaveClass(/screen-active/);
  });

  test('pabh-rules screen contains key sections', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-pabh-rules');
    await expect(page.locator('[data-screen="pabh-rules"] .rules-content')).toContainText('Pitcher');
    await expect(page.locator('[data-screen="pabh-rules"] .rules-content')).toContainText('Wildcard');
    await expect(page.locator('[data-screen="pabh-rules"] .rules-content')).toContainText('Lock In Votes');
  });

  test('back button on pabh-rules returns to home hub', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-pabh-rules');
    await page.click('#btn-pabh-rules-back');
    await expect(page.locator('[data-screen="screen-home"]')).toHaveClass(/screen-active/);
  });
});

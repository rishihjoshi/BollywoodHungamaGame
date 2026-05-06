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

  test('compact combo chips visible on timer screen', async ({ page }) => {
    await fillPlayersAndStart(page);
    await page.waitForTimeout(1200);
    await page.click('#pabh-btn-start-pitch');
    await expect(page.locator('.pabh-compact-chip')).toHaveCount(4);
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
    // 2 voters for 3 players — click both vote cards
    const cards = page.locator('.pabh-vote-card');
    await cards.nth(0).click();
    await cards.nth(1).click();
    await page.waitForTimeout(800); // auto-advance delay
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
    await page.waitForTimeout(800);
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

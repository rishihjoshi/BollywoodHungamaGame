// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Task 1 — Rebranding', () => {

  test('KHG game card shows hero image', async ({ page }) => {
    await page.goto('/');
    const img = page.locator('.game-card-hero-img').first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toContain('KaunHaiGabbar_HeroImage');
  });

  test('PABH game card shows hero image', async ({ page }) => {
    await page.goto('/');
    const img = page.locator('.game-card-hero-img').nth(1);
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toContain('PictureAbhiBakiHai_HeroImage');
  });

  test('hero images load without 404', async ({ page }) => {
    const failed = [];
    page.on('response', res => {
      if (res.url().includes('/images/') && res.status() >= 400)
        failed.push(res.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(failed).toHaveLength(0);
  });

  test('manifest.json references AppIcon.png', async ({ page }) => {
    const res  = await page.goto('/manifest.json');
    const json = await res.json();
    const srcs = json.icons.map(i => i.src);
    expect(srcs.some(s => s.includes('AppIcon'))).toBe(true);
  });

  test('OG image meta tag points to AppHeroImage', async ({ page }) => {
    await page.goto('/');
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toContain('AppHeroImage');
  });

  test('hero images render at expected height on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const img = page.locator('.game-card-hero-img').first();
    const box = await img.boundingBox();
    // Should be 160px tall ± 20px (CSS rounding / box model)
    expect(box.height).toBeGreaterThan(140);
    expect(box.height).toBeLessThan(180);
  });

});

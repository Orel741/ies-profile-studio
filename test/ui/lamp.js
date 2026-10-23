// the fixture glow in the 3D view follows the Kelvin setting
module.exports = async (page, name) => {
  if (name !== 'desk-dark') return;
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(400);
  await page.click('#lookCard > summary'); await page.click('#lookSeg >> text="Grey surface"'); await page.waitForTimeout(200);
  const cv = await page.$('#d3Cv'); await cv.scrollIntoViewIfNeeded();
  for (const k of [1800, 6500, 12000]) {
    await page.$eval('#kelvin', (el, k) => { el.value = String(k); el.dispatchEvent(new Event('input', { bubbles: true })); }, k);
    await page.waitForTimeout(900);
    await cv.screenshot({ path: require('path').join(__dirname, '../shots/lamp-' + k + '.png') });
  }
};

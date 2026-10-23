module.exports = async (page, name) => {
  if (name !== 'desk-light') return;
  const fx = () => page.$$eval('#layerList .fxname', e => e.map(x => x.textContent).join(' | '));
  const shot = async n => { const f = await (await page.$('#floorCv')).boundingBox(), w = await (await page.$('#wallCv')).boundingBox(); await page.screenshot({ path: 'test/shots/NM-' + n + '.png', clip: { x: f.x, y: f.y, width: w.x + w.width - f.x, height: f.height } }); };
  const clearMods = async () => { while (await page.$('#modList .mhead button[title=Remove]')) { await page.click('#modList .mhead button[title=Remove]'); await page.waitForTimeout(60); } };
  await page.$eval('#floorH', el => { el.value = '2.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  for (const t of ['transform', 'doors', 'gobo', 'shapes']) {
    await clearMods(); await page.selectOption('#modAdd', t); await page.waitForTimeout(400);
    console.log(t, '→', await fx(), '| fields', await page.$$eval('#modList .mod .field > span:first-child', e => e.map(x => x.textContent).join(',')));
    await page.$eval('#floorCv', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(500); await shot(t);
  }
  // shapes: squares in rings
  await page.click('#modList .seg >> text="Squares"'); await page.click('#modList .seg >> text="Rings"'); await page.waitForTimeout(500);
  console.log('squares rings →', await fx()); await shot('shapes-rings');
  // gobo with a loaded image
  await clearMods(); await page.selectOption('#modAdd', 'gobo'); await page.waitForTimeout(200);
  await page.setInputFiles('#modList .gobo input[type=file]', require('path').join(__dirname, 'gobo-test.png')); await page.waitForTimeout(800);
  console.log('gobo image →', await fx(), '|', await page.$eval('#status', e => e.textContent));
  await page.$eval('#floorCv', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(500); await shot('gobo-img');
  const m = await (await page.$('#modList')).boundingBox(); await page.screenshot({ path: 'test/shots/NM-panel.png', clip: { x: m.x - 8, y: m.y - 8, width: m.width + 16, height: Math.min(m.height + 16, 420) } });
  // persists through reload
  await page.waitForTimeout(800); await page.reload(); await page.waitForTimeout(700);
  console.log('after reload →', await fx());
  console.log('export header:', await page.$eval('#fileMeta', e => e.textContent));
};

module.exports = async (page, name) => {
  const st = () => page.$eval('#tip', t => (t.hidden ? 'hidden' : 'shown') + ' ' + t.textContent.slice(0, 60).replace(/\s+/g, ' '));
  const hover = async (sel, wait, fx = 0.5, fy = 0.5) => { const b = await (await page.$(sel)).boundingBox(); await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 3 }); await page.waitForTimeout(wait); return b; };
  console.log(name, 'tips:', await page.$$eval('[data-tip]', e => e.length), 'info btns:', await page.$$eval('.info', e => e.length));
  await page.$eval('#floorCv', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  if (name === 'phone') { const b = await (await page.$('#lookCard h2')).boundingBox(); await page.touchscreen.tap(b.x + 20, b.y + 8).catch(()=>{}); await page.waitForTimeout(200); console.log('phone tap title:', await st()); return; }
  await hover('#floorCv h2, .views article:first-child h2', 200); console.log('floor title 200ms:', await st());
  await page.waitForTimeout(400); console.log('floor title 600ms:', await st());
  if (name === 'desk-light') await page.screenshot({ path: 'test/shots/TIP-title.png' });
  await hover('#floorCv', 1100, 0.3, 0.3); console.log('rest on floor map:', await st());
  if (name === 'desk-light') await page.screenshot({ path: 'test/shots/TIP-map.png' });
  await page.mouse.move(10, 10, { steps: 4 }); await page.waitForTimeout(100); console.log('away:', await st());
  await page.$eval('#lyBlend', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await page.selectOption('#layerAdd', 'curve'); await page.selectOption('#layerCurve', 'p:ell'); await page.waitForTimeout(100);
  await hover('#lyBlend', 700); console.log('blend select:', await st());
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(100); console.log('after click:', await st());
  await page.keyboard.press('Escape');
  await page.selectOption('#modAdd', 'rays'); await page.waitForTimeout(150);
  await page.$eval('#modList', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await hover('#modList .mhead strong', 700); console.log('mod name:', await st());
};

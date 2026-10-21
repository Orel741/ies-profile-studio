// + Add layer → New curve… opens a second list; Adjustment layer changes everything below it
module.exports = async (page, name) => {
  const P = require('path');
  const layers = () => page.$$eval('#layerList li.lyr', ls => ls.map(l => l.querySelector('.lname .n').textContent + ' [' + l.querySelector('.lname .t').textContent + ']' + [...l.querySelectorAll('.fxname')].map(f => ' ƒ ' + f.textContent).join('')).join(' / '));
  const rd = () => page.$eval('#rdBeam', e => e.textContent) .then(async b => b + ' | flux ' + await page.$eval('#rdFlux', e => e.textContent));
  await page.evaluate(() => { HTMLSelectElement.prototype.showPicker = function () {}; });   // native popups block headless screenshots
  console.log(name, 'menu:', await page.$$eval('#layerAdd option', o => o.map(x => x.textContent).join(' · ')), '| curve list hidden', await page.$eval('#layerCurve', e => e.hidden));
  await page.selectOption('#layerAdd', 'curve'); await page.waitForTimeout(100);
  console.log(name, 'after New curve…: list shown', !(await page.$eval('#layerCurve', e => e.hidden)), '|', (await page.$$eval('#layerCurve option', o => o.map(x => x.textContent))).join(', '));
  if (name === 'desk-light') { const c = await (await page.$('#layersCard')).boundingBox(); await page.screenshot({ path: P.join(__dirname, '../shots/adj-menu.png'), clip: { x: c.x, y: c.y, width: c.width, height: 120 } }); }
  await page.selectOption('#layerCurve', 'p:flood'); await page.waitForTimeout(150);
  console.log(name, 'added:', await layers(), '| list hidden again', await page.$eval('#layerCurve', e => e.hidden));
  if (name !== 'desk-light') return;
  const before = await rd();
  await page.selectOption('#layerAdd', 'adjust'); await page.waitForTimeout(150);
  console.log('adjust added:', await layers(), '| blend shown', !(await page.$eval('#lyBlend', e => e.closest('.field').hidden)), '| turn shown', !(await page.$eval('#lyTurn', e => e.closest('.field').hidden)), '| amt label', await page.$eval('#lyAmt', e => e.closest('.field').firstElementChild.textContent));
  await page.selectOption('#modAdd', 'cut'); await page.waitForTimeout(100);
  await page.$eval('#modList input[id$="-angle"]', el => { el.value = '25'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(400);
  console.log('beam/flux before', before, '→ with adjustment cut 25°', await rd());
  await page.$eval('#lyAmt', el => { el.value = '0.5'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(400);
  console.log('mix 50% →', await rd(), '|', await layers());
  await page.$eval('#floorCv', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  await page.screenshot({ path: P.join(__dirname, '../shots/adj-page.png') });
  // persists in projects/localStorage
  await page.waitForTimeout(700); await page.reload(); await page.waitForTimeout(700);
  console.log('after reload:', await layers());
};

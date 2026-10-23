// Transform modifier: tilt (both ways), rotation and widths, then a separate Mirror modifier, on the floor map
module.exports = async (page, name) => {
  if (name !== 'desk-light') return;
  const P = require('path'), setR = async (k, v) => { await page.$eval('#modList input[id$="-' + k + '"]', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.waitForTimeout(250); };
  const fx = () => page.$eval('#layerList .fxname', e => e.textContent);
  const shot = async n => { await page.$eval('#floorCv', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(400); await (await page.$('#floorCv')).screenshot({ path: P.join(__dirname, '../shots/tr-' + n + '.png') }); };
  await page.selectOption('#modAdd', 'transform'); await page.waitForTimeout(300);
  console.log('fields:', await page.$$eval('#modList .mod .field > span:first-child', e => e.map(x => x.textContent).join(', ')));
  await setR('tilt', 25); console.log(await fx()); await shot('a-tilt');
  await setR('rotate', 90); console.log(await fx()); await shot('b-rot90');
  await setR('rotate', 0); await setR('tilt', 0); await page.click('#modList .check input'); await page.waitForTimeout(200); await setR('wideS', 2.2); console.log(await fx()); await shot('c-wide');
  await setR('tilt', 25); await setR('rotate', 45); console.log(await fx()); await shot('d-all');
  await setR('tilt', -25); console.log(await fx()); await shot('e-negtilt');
  await page.selectOption('#modAdd', 'mirror'); await page.waitForTimeout(150);
  await page.selectOption('#modList .mod:last-child select', '0'); await page.waitForTimeout(300);
  console.log(await page.$$eval('#layerList .fxname', e => e.map(x => x.textContent).join(' | '))); await shot('f-mirror');
};

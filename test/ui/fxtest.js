module.exports = async (page, name) => {
  if (name !== 'desk-dark') return;
  const fx = () => page.$$eval('#layerList li.lyr', ls => ls.map(l => l.querySelector('.lname .n').textContent + ' [' + [...l.querySelectorAll('.fx')].map(f => (f.classList.contains('off') ? '~' : '') + f.querySelector('.fxname').textContent).join(', ') + ']').join(' / '));
  const setR = async (sel, v) => { await page.$eval(sel, (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.waitForTimeout(80); };
  await page.selectOption('#modAdd', 'noise'); await page.selectOption('#modAdd', 'rays'); await page.waitForTimeout(150);
  await page.selectOption('#layerAdd', 'p:ell'); await page.waitForTimeout(100); await page.selectOption('#modAdd', 'cut'); await page.waitForTimeout(150);
  console.log('list:', await fx());
  await page.click('#layerList li.lyr:last-child .fx:nth-child(2) input'); await page.waitForTimeout(150);
  console.log('rays off on base:', await fx(), '| selected still', await page.$eval('#lyName', e => e.value));
  await page.click('#layerList li.lyr:last-child .fx:nth-child(1) .fxname'); await page.waitForTimeout(300);
  console.log('clicked Noise → selected', await page.$eval('#lyName', e => e.value), '| flashed', await page.$eval('#modList .mod.flash', e => e.dataset.mod).catch(() => 'none'));
  await setR('#modList .mod:nth-child(1) input[type=range]', 0.8);
  console.log('noise slider → list:', await fx());
  await page.click('#btnUndo'); await page.waitForTimeout(150);
  console.log('undo:', await fx());
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  const c = await (await page.$('#layersCard')).boundingBox();
  await page.screenshot({ path: 'test/shots/FX.png', clip: { x: c.x, y: c.y, width: c.width, height: 260 } });
};

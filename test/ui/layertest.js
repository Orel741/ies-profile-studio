module.exports = async (page, name) => {
  const log = (...a) => console.log('[' + name + ']', ...a);
  const txt = id => page.$eval('#' + id, el => el.textContent.trim());
  const setR = async (sel, v) => { await page.$eval(sel, (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.waitForTimeout(80); };
  const layers = () => page.$$eval('#layerList .lname', bs => bs.map(b => b.querySelector('.n').textContent + ' [' + b.querySelector('.t').textContent + ']' + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' / '));
  const fileHead = async () => { await page.$eval('#fileDet', d => { d.open = true; d.dispatchEvent(new Event('toggle')); }); await page.waitForTimeout(350); return page.$eval('#iesText', t => t.value.split('\r\n').slice(8, 9).join('')); };
  log('start:', await layers(), '| beam', await txt('rdBeam'), '| header', await fileHead());
  // add an oval layer on top, turned 45 degrees
  await page.selectOption('#layerAdd', 'curve'); await page.selectOption('#layerCurve', 'p:ell'); await page.waitForTimeout(120);
  log('after add:', await layers(), '| beam', await txt('rdBeam'), '| legend shown', !(await page.$eval('#edLegend', e => e.hidden)));
  await setR('#lyTurn', 45);
  log('turn 45:', await layers(), '| header', await fileHead(), '|', await txt('fileMeta'));
  // noise + rays on the oval
  await page.selectOption('#modAdd', 'noise'); await page.waitForTimeout(120);
  await page.selectOption('#modAdd', 'rays'); await page.waitForTimeout(120);
  log('mods:', await page.$$eval('#modList .mhead strong', e => e.map(x => x.textContent).join(', ')), '| layers', await layers());
  await setR('#modList .mod:nth-child(1) input[type=range]', 0.8);
  log('noise 80%: up', await txt('rdUp'), '| flux', await txt('rdFlux'));
  // blend modes
  for (const b of ['lighten', 'replace', 'mask', 'subtract', 'add']) { await page.selectOption('#lyBlend', b); await page.waitForTimeout(80); log('blend', b, '-> flux', await txt('rdFlux'), 'beam', await txt('rdBeam')); }
  // hide the top layer: back to the spot
  await page.click('#layerList li:first-child input[type=checkbox]'); await page.waitForTimeout(100);
  log('hidden top:', await layers(), '| beam', await txt('rdBeam'), '| header', await fileHead());
  await page.click('#layerList li:first-child input[type=checkbox]'); await page.waitForTimeout(100);
  // select the base layer and drag a floor handle: should only reshape the base
  await page.click('#layerList li:last-child .lname'); await page.waitForTimeout(100);
  log('selected base:', await layers(), '| editing', await txt('edLayerName'));
  // reorder, undo chain
  await page.focus('#layerList > li:last-child .lrow .grip'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(80);
  log('moved up:', await layers());
  for (let i = 0; i < 3; i++) await page.click('#btnUndo');
  await page.waitForTimeout(100);
  log('undo x3:', await layers());
  // delete + undo
  await page.click('#layerList li:first-child button[title="Delete layer"]'); await page.waitForTimeout(80);
  log('deleted:', await layers(), '|', await txt('status'));
  await page.click('#btnUndo'); await page.waitForTimeout(80);
  log('undo delete:', await layers());
  // import the exported composite as a layer and check full detail survives
  const t = await page.$eval('#iesText', t => t.value);
  await page.$eval('#fileIn', (inp, t) => { const dt = new DataTransfer(); dt.items.add(new File([t], 'mix.ies')); inp.files = dt.files; inp.dispatchEvent(new Event('change')); }, t);
  await page.waitForTimeout(250);
  log('imported:', await layers(), '|', (await txt('status')).slice(0, 90), '| editor locked note:', await page.$eval('#lyToCurve', e => !e.hidden));
  await page.click('#lyToCurve'); await page.waitForTimeout(100);
  log('as curve:', await layers());
  // reload: layers persist
  await page.waitForTimeout(700);
  await page.reload(); await page.waitForTimeout(600);
  log('after reload:', await layers(), '| beam', await txt('rdBeam'));
  // leave a nice state for screenshots
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500);
  await page.selectOption('#layerAdd', 'curve'); await page.selectOption('#layerCurve', 'p:ell'); await page.waitForTimeout(80);
  await setR('#lyAmt', 0.6); await setR('#lyTurn', 45);
  await page.selectOption('#modAdd', 'rays'); await page.waitForTimeout(80);
  await page.selectOption('#modAdd', 'noise'); await page.waitForTimeout(80);
  await page.evaluate(() => window.scrollTo(0, 0));
};

// menus, EV exposure, Transform uniform/±tilt, Mirror, custom shape image, New IES
module.exports = async (page, name) => {
  const P = require('path'), sh = n => P.join(__dirname, '../shots/m-' + name + '-' + n + '.png');
  const layers = () => page.$$eval('#layerList li.lyr', ls => ls.map(l => l.querySelector('.lname .n').textContent + ' [' + l.querySelector('.lname .t').textContent + ']' + [...l.querySelectorAll('.fxname')].map(f => ' ƒ ' + f.textContent).join('')).join(' / '));
  const setR = async (sel, v) => { await page.$eval(sel, (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.waitForTimeout(150); };
  // Add layer menu with the New curve submenu, using the mouse
  await page.click('#layerAddBtn'); await page.waitForTimeout(150);
  console.log(name, 'layer menu:', await page.$$eval('.menu:not(.submenu) .mitem', b => b.map(x => x.textContent).join(' · ')));
  await page.hover('.menu .mitem.hassub'); await page.waitForTimeout(150);
  console.log(name, 'submenu:', await page.$$eval('.submenu .mitem', b => b.map(x => x.textContent).join(', ')));
  if (name !== 'phone') await page.screenshot({ path: sh('layermenu') });
  await page.click('.submenu .mitem >> text="Batwing"'); await page.waitForTimeout(200);
  console.log(name, 'menus closed', (await page.$$('.menu')).length === 0, '|', await layers());
  if (name !== 'desk-light') return;
  // keyboard: open, down, right into submenu, Enter
  await page.focus('#layerAddBtn'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  console.log('keyboard pick:', await layers());
  // modifier menu grouped
  await page.click('#modAddBtn'); await page.waitForTimeout(150);
  console.log('mod menu:', await page.$$eval('.menu > *', b => b.map(x => (x.classList.contains('mgroup') ? '[' + x.textContent + ']' : x.textContent)).join(' ')));
  await page.screenshot({ path: sh('modmenu') });
  await page.click('.menu .mitem >> text="Transform"'); await page.waitForTimeout(200);
  console.log('transform fields:', await page.$$eval('#modList .mod:last-child label', e => e.map(x => x.textContent.trim().split('\n')[0]).join(', ')));
  await setR('#modList .mod:last-child input[id$="-tilt"]', -30);
  await setR('#modList .mod:last-child input[id$="-wideF"]', 1.5);
  console.log('uniform:', await layers());
  await page.click('#modList .mod:last-child .check input'); await page.waitForTimeout(150);
  await setR('#modList .mod:last-child input[id$="-wideS"]', 0.8);
  console.log('separate:', await layers());
  // mirror
  await page.selectOption('#modAdd', 'mirror'); await page.waitForTimeout(150);
  await page.selectOption('#modList .mod:last-child select', '4'); await page.waitForTimeout(200);
  console.log('mirror:', await layers());
  // shape array custom image
  await page.selectOption('#modAdd', 'shapes'); await page.waitForTimeout(150);
  await page.click('#modList .mod:last-child .seg >> text="Custom"'); await page.waitForTimeout(200);
  console.log('custom shape row', !!(await page.$('#modList .mod:last-child .gobo')), '|', await layers());
  await page.setInputFiles('#modList .mod:last-child .gobo input[type=file]', P.join(__dirname, 'gobo-test.png')); await page.waitForTimeout(500);
  console.log('custom loaded:', await layers());
  const mb = await (await page.$('#modList .mod:last-child')).boundingBox(); await page.screenshot({ path: sh('shapes'), clip: { x: mb.x - 4, y: mb.y - 4, width: mb.width + 8, height: Math.min(mb.height + 8, 700) } });
  // EV exposure
  await page.click('#layerList > li:nth-child(2) .lname'); await page.waitForTimeout(150);
  await setR('#lyAmt', -1); console.log('EV -1:', await page.$eval('#lyAmtVal', e => e.textContent), '|', await layers());
  const fe = await (await page.$('#layersCard')).boundingBox(); await page.screenshot({ path: sh('layers'), clip: { x: fe.x, y: fe.y, width: fe.width, height: 420 } });
  // New IES + undo
  const before = await layers();
  await page.click('#btnNew'); await page.waitForTimeout(300); console.log('New IES:', await layers(), '|', await page.$eval('#status', e => e.textContent));
  await page.click('#btnUndo'); await page.waitForTimeout(300); console.log('undo restores', (await layers()) === before);
  await page.screenshot({ path: sh('header'), clip: { x: 0, y: 0, width: 1360, height: 120 } });
};

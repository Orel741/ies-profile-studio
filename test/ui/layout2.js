// generator inside Light curve, collapsible preview look, wall half-width, 3D full screen
module.exports = async (page, name) => {
  const P = require('path'), sh = n => P.join(__dirname, '../shots/l2-' + name + '-' + n + '.png');
  console.log(name, 'gen inside editor card', await page.$eval('#genDet', e => !!e.closest('[aria-label="Distribution editor"]')), '| gen open', await page.$eval('#genDet', e => e.open), '| look open', await page.$eval('#lookCard', e => e.open), '| look sum', await page.$eval('#lookSum', e => e.textContent));
  if (name !== 'desk-light') return;
  await page.screenshot({ path: sh('top'), fullPage: false });
  await page.click('#genDet > summary'); await page.waitForTimeout(300);
  const ed = await (await page.$('[aria-label="Distribution editor"]')).boundingBox(); await page.screenshot({ path: sh('gen'), clip: { x: ed.x, y: ed.y + ed.height - 420, width: ed.width, height: 420 } });
  await page.click('#lookCard > summary'); await page.waitForTimeout(200); await page.click('#lookSeg >> text="Temperature"'); await page.waitForTimeout(200);
  console.log('look sum lit', await page.$eval('#lookSum', e => e.textContent));
  await page.click('#lookCard > summary'); await page.waitForTimeout(200);
  const wall = async () => page.$eval('#wallRVal', e => e.textContent);
  console.log('wall auto', await wall(), '| slider disabled', await page.$eval('#wallR', e => e.disabled));
  await page.click('#wallFitChk'); await page.$eval('#wallR', el => { el.value = '8'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(400);
  console.log('wall manual', await wall());
  const wv = await (await page.$('#wallCv')).boundingBox(); await page.$eval('#wallCv', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  await (await page.$('#wallCv')).screenshot({ path: sh('wall8') });
  await page.click('#d3Full'); await page.waitForTimeout(900);
  const b = await (await page.$('#d3Cv')).boundingBox();
  console.log('full screen: button', await page.$eval('#d3Full', e => e.textContent), '| canvas', Math.round(b.width) + '×' + Math.round(b.height), '| fs element', await page.evaluate(() => !!document.fullscreenElement), '| overlay', await page.$eval('#d3Card', e => e.classList.contains('full')));
  await page.screenshot({ path: sh('full') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  console.log('after Esc:', await page.$eval('#d3Full', e => e.textContent), Math.round((await (await page.$('#d3Cv')).boundingBox()).width));
};

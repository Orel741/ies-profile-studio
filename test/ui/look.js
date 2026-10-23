// Preview look: Temperature is the default, no temperature presets; Heat map still one click away
module.exports = async (page, name) => {
  const P = require('path');
  const st = async () => (await page.$$eval('#lookSeg button', b => b.map(x => x.textContent + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' / '))) + ' | sum: ' + (await page.$eval('#lookSum', e => e.textContent));
  console.log(name, 'fresh:', await st(), '| presets:', (await page.$$('#kPre')).length);
  if (name !== 'desk-light') return;
  await page.click('#lookCard > summary'); await page.waitForTimeout(200);
  await (await page.$('#lookCard')).screenshot({ path: P.join(__dirname, '../shots/look-open.png') });
  await page.click('#lookSeg >> text="Heat map"'); await page.waitForTimeout(300);
  console.log('heat:', await st());
  await page.waitForTimeout(700); await page.reload(); await page.waitForTimeout(700);
  console.log('reload keeps choice:', await st());
};

// usage: node test/ui/run.js [interaction-module.js]   (screenshots go to test/shots/)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [, , extra] = process.argv;
  const htmlFile = path.join(__dirname, '../../dist/ies-profile-studio.html'), out = path.join(__dirname, '../shots', extra ? path.basename(extra, '.js') : 'page');
  require('fs').mkdirSync(path.dirname(out), { recursive: true });
  const raw = require('fs').readFileSync(htmlFile, 'utf8');
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + raw + '</body></html>';
  const tmp = path.join(require('os').tmpdir(), 'ies-render.html');
  require('fs').writeFileSync(tmp, html);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const errs = [];
  for (const [name, vp, scheme] of [['desk-light', { width: 1360, height: 1000 }, 'light'], ['desk-dark', { width: 1360, height: 1000 }, 'dark'], ['phone', { width: 400, height: 860 }, 'light']]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(name + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
    await page.goto('file://' + tmp);
    await page.waitForTimeout(600);
    if (extra) await require(path.resolve(extra))(page, name);
    await page.waitForTimeout(250);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (sw > 0) errs.push(name + ': horizontal overflow ' + sw + 'px');
    await page.screenshot({ path: out + '-' + name + '.png', fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log(errs.length ? errs.join('\n') : 'no errors');
})();

// outside Claude: Save .ies downloads a valid .ies file
module.exports = async (page, name) => {
  if (name !== 'desk-light') return;
  console.log('buttons:', await page.$$eval('#expDet .btn', b => b.filter(x => !x.hidden).map(x => x.textContent).join(', ')));
  const [d] = await Promise.all([page.waitForEvent('download'), page.click('#btnZip')]);
  const f = require('path').join(require('os').tmpdir(), d.suggestedFilename()); await d.saveAs(f);
  const t = require('fs').readFileSync(f, 'utf8');
  console.log('file', d.suggestedFilename(), t.length, 'bytes, starts', JSON.stringify(t.slice(0, 18)), '|', await page.$eval('#status', e => e.textContent));
  const e = await page.$('#expDet'); await e.scrollIntoViewIfNeeded(); await e.screenshot({ path: require('path').join(__dirname, '../shots/export.png') });
};

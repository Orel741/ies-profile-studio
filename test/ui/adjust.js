// Adjustment layer changes everything below it; Mix fades it
module.exports = async (page, name) => {
  if (name !== 'desk-light') return;
  const rd = async () => { await page.waitForTimeout(900); return (await page.$eval('#rdField', e => e.textContent)) + ' | ' + (await page.$eval('#rdFlux', e => e.textContent)); };
  await page.selectOption('#layerAdd', 'p:flood');
  console.log('spot + flood       :', await rd());
  await page.selectOption('#layerAdd', 'adjust'); await page.selectOption('#modAdd', 'cut');
  await page.$eval('#modList input[id$="-angle"]', el => { el.value = '25'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  console.log('+ adjust cut 25°   :', await rd(), '| level label', await page.$eval('#lyAmt', e => e.closest('.field').firstElementChild.textContent));
  await page.$eval('#lyAmt', el => { el.value = '0.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  console.log('  mix 50%          :', await rd());
  await page.click('#layerList > li:first-child .lrow input[type=checkbox]');
  console.log('  adjustment hidden:', await rd());
};

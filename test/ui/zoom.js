// floor and wall maps zoom with the wheel only when their view is not on Auto
module.exports = async (page, name) => {
  if (name !== 'desk-light') return;
  const v = id => page.$eval(id, e => e.textContent);
  for (const [cv, chk, out] of [['#floorCv', '#fitChk', '#floorRVal'], ['#wallCv', '#wallFitChk', '#wallRVal']]) {
    await page.$eval(cv, e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
    const b = await (await page.$(cv)).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    const y0 = await page.evaluate(() => scrollY), a0 = await v(out);
    await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
    console.log(cv, 'Auto: view', a0, '→', await v(out), '| page scrolled', (await page.evaluate(() => scrollY)) !== y0);
    await page.click(chk); await page.waitForTimeout(300);
    await page.$eval(cv, e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
    const b2 = await (await page.$(cv)).boundingBox(); await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
    const m0 = await v(out), y1 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -400); await page.waitForTimeout(300); const zin = await v(out);
    await page.mouse.wheel(0, 900); await page.waitForTimeout(300);
    console.log(cv, 'manual: start', m0, '| wheel up (zoom in)', zin, '| wheel down', await v(out), '| page stayed', (await page.evaluate(() => scrollY)) === y1);
    await (await page.$(cv)).screenshot({ path: require('path').join(__dirname, '../shots/zoom' + cv.slice(1, 6) + '.png') });
  }
};

// Save project → fresh page → Open project gives back the same layers, modifiers, settings and identical IES output
module.exports = async (page, name) => {
  if (name !== 'desk-light') return;
  const P = require('path'), fs = require('fs');
  const layers = () => page.$$eval('#layerList li.lyr', ls => ls.map(l => l.querySelector('.lname .n').textContent + ' [' + [...l.querySelectorAll('.fxname')].map(f => f.textContent).join(', ') + ']').join(' / '));
  const ies = async () => { await page.$eval('#fileDet', d => { d.open = true; d.dispatchEvent(new Event('toggle')); }); await page.waitForTimeout(400); return page.$eval('#iesText', t => t.value.split('\r\n').slice(1).join('\n')); };
  await page.selectOption('#modAdd', 'transform'); await page.waitForTimeout(100);
  await page.$eval('#modList input[id$="-tilt"]', el => { el.value = '30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.selectOption('#layerAdd', 'p:ell'); await page.waitForTimeout(100);
  await page.selectOption('#modAdd', 'gobo'); await page.waitForTimeout(100);
  await page.setInputFiles('#modList .gobo input[type=file]', P.join(__dirname, 'gobo-test.png')); await page.waitForTimeout(600);
  await page.click('#lookCard > summary'); await page.click('#lookSeg >> text="Grey surface"');
  await page.$eval('#kelvin', el => { el.value = '2700'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#fName', el => { el.value = 'My test light'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  const L0 = await layers(), T0 = await ies(), K0 = await page.$eval('#kelvinNum', e => e.value);
  const [dlEv] = await Promise.all([page.waitForEvent('download'), page.click('#btnSaveProj')]);
  const file = P.join(require('os').tmpdir(), dlEv.suggestedFilename()); await dlEv.saveAs(file);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('saved', dlEv.suggestedFilename(), (fs.statSync(file).size / 1024).toFixed(0) + ' KB', 'format', j.format, 'layers', j.state.layers.length, '|', await page.$eval('#status', e => e.textContent));
  // fresh start
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(700);
  console.log('fresh:', await layers());
  await page.setInputFiles('#projIn', file); await page.waitForTimeout(900);
  const L1 = await layers(), T1 = await ies(), K1 = await page.$eval('#kelvinNum', e => e.value);
  console.log('opened:', L1, '|', await page.$eval('#status', e => e.textContent));
  console.log('layers match', L0 === L1, '| IES identical', T0 === T1, '| kelvin', K0, K1, '| name', await page.$eval('#fName', e => e.value), '| look', await page.$eval('#lookSeg [aria-pressed=true]', e => e.textContent));
  await page.click('#btnUndo'); await page.waitForTimeout(300);
  console.log('undo →', await layers());
  // a wrong file is refused
  const bad = P.join(require('os').tmpdir(), 'not-a-project.json'); fs.writeFileSync(bad, '{"hello":1}');
  await page.setInputFiles('#projIn', bad); await page.waitForTimeout(300);
  console.log('bad file:', await page.$eval('#status', e => e.textContent), '| layers still', await layers());
  const h = await (await page.$('header.bar')).boundingBox(); await page.screenshot({ path: P.join(__dirname, '../shots/project-header.png'), clip: { x: 0, y: 0, width: 1360, height: h.height + 20 } });
};

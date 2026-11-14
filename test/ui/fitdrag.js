// floor view on Fit keeps its zoom while a curve is being dragged, and refits after release
module.exports = async (page, name) => {
  if (name !== 'desk-light') return;
  const v = () => page.$eval('#floorRVal', e => e.textContent);
  await page.keyboard.press('d');   // Draw tool: any press on the editor reshapes the curve
  await page.$eval('#edCv', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const b = await (await page.$('#edCv')).boundingBox();
  const a0 = await v(), seen = new Set();
  await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.2); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(b.x + b.width * (0.15 + i * 0.035), b.y + b.height * 0.2); await page.waitForTimeout(40); seen.add(await v()); }
  await page.mouse.up(); await page.waitForTimeout(400);
  console.log('Fit before', a0, '| during drag', [...seen].join(', '), '| after release', await v());
};

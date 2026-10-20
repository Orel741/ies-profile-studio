// Inlines src/core.js and src/ui.js into src/template.html → dist/ies-profile-studio.html (one self-contained page)
const fs = require('fs'), path = require('path');
const d = path.join(__dirname, 'src');
const core = fs.readFileSync(path.join(d, 'core.js'), 'utf8').replace(/if \(typeof module !== 'undefined'[\s\S]*$/, '');
const ui = fs.readFileSync(path.join(d, 'ui.js'), 'utf8');
let t = fs.readFileSync(path.join(d, 'template.html'), 'utf8');
t = t.replace('/*__CORE__*/', () => core).replace('/*__UI__*/', () => ui);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'ies-profile-studio.html'), t);
// syntax check of the inlined script
new Function(/<script>([\s\S]*)<\/script>/.exec(t)[1]);
console.log('built dist/ies-profile-studio.html,', t.length, 'bytes');

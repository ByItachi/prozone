const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'apps', 'api', 'src');

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) {
      let c = fs.readFileSync(p, 'utf8');
      c = c.replace(/(from\s*'|import\s*\(')(\.{1,2}\/[^']*?)(')/g, (m, a, rel, q) => {
        if (rel.endsWith('.ts')) return m;
        return a + rel + '.ts' + q;
      });
      fs.writeFileSync(p, c);
    }
  }
}
walk(root);
console.log('done');
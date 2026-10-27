const fs = require('node:fs');

const files = [
  'src/renderer/styles/tokens.css',
  'src/renderer/styles/components.css',
  'src/renderer/styles/views.css',
  'src/renderer/styles/lyrics.css',
  'src/renderer/styles/global.css'
];

let bad = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  // 去掉注释后统计括号
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const open = (stripped.match(/\{/g) || []).length;
  const close = (stripped.match(/\}/g) || []).length;
  // 检测重复相邻选择器（同一行紧邻重复）
  const lines = src.split(/\r?\n/);
  const dupes = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1].trim();
    const b = lines[i].trim();
    if (a === b && a.endsWith('{')) dupes.push(i - 1);
  }
  const ok = open === close && dupes.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${f}  braces ${open}/${close}${dupes.length ? '  dup-lines: ' + dupes.join(',') : ''}`);
}
process.exit(bad ? 1 : 0);

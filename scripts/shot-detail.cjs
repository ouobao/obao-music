const fs = require('node:fs');

const run = async () => {
  const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync('screenshots/' + name, Buffer.from(s.result.data, 'base64'));
    console.log('saved', name);
  };
  const nav = async (i, wait = 2000) => {
    await send('Runtime.evaluate', { expression: `document.querySelectorAll('.nav-item')[${i}]?.click()` });
    await new Promise(r => setTimeout(r, wait));
  };
  const click = async (sel, wait = 2400) => {
    const ok = await send('Runtime.evaluate', { expression: `(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true;})()`, returnByValue: true });
    await new Promise(r => setTimeout(r, wait));
    return ok.result.result.value;
  };

  await send('Runtime.evaluate', { expression: `location.reload()` });
  await new Promise(r => setTimeout(r, 4200));

  // 歌单详情（从歌单广场进）
  await nav(2);
  const ok1 = await click('.media-card');
  console.log('playlist detail opened:', ok1);
  await shot('2026-10-23-studio-30-playlist-detail.png');

  // 专辑详情：从歌手页进
  await nav(0, 1800);
  await send('Runtime.evaluate', { expression: `document.querySelector('.main-content')?.scrollTo(0, 3000)` });
  await new Promise(r => setTimeout(r, 1200));
  await shot('2026-10-23-studio-31-home-scrolled.png');

  ws.close();
};
run().catch(e => { console.error('ERR', e.message); process.exit(1); });

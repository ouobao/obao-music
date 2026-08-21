// 临时诊断:通过 CDP 在 Electron 渲染进程执行只读检查
const port = process.argv[2] || '9223';
const expr = process.argv[3];

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:5173'));
  if (!page) throw new Error('page target not found: ' + JSON.stringify(list.map((t) => t.url)));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result?.result ?? r, null, 2).slice(0, 8000));
  ws.close();
}
main().catch((e) => { console.error('EVAL_FAIL', e.message); process.exit(1); });

const run = async () => {
  const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  const expr = [
    '(function(){',
    '  var res = { saturated: [], blurs: [], bigRadius: [], hugeShadow: [] };',
    '  var els = document.querySelectorAll("body *");',
    '  for (var i = 0; i < els.length; i++) {',
    '    var el = els[i];',
    '    var r = el.getBoundingClientRect();',
    '    if (r.width <= 0 || r.height <= 0) continue;',
    '    var s = getComputedStyle(el);',
    '    var cls = (typeof el.className === "string" ? el.className : el.tagName).split(" ").slice(0,2).join(".");',
    // 彩度检测
    '    var props = ["color", "backgroundColor", "borderTopColor"];',
    '    for (var j = 0; j < props.length; j++) {',
    '      var v = s[props[j]];',
    '      var m = v.match(/rgba?\\((\\d+), (\\d+), (\\d+)/);',
    '      if (!m) continue;',
    '      var rr = +m[1], gg = +m[2], bb = +m[3];',
    '      var mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);',
    '      var sat = mx === 0 ? 0 : (mx - mn) / mx;',
    '      if (sat > 0.2 && mx > 40) { res.saturated.push({ cls: cls, prop: props[j], color: v }); break; }',
    '    }',
    // 模糊
    '    var bf = s.backdropFilter || s.webkitBackdropFilter;',
    '    if (bf && bf !== "none" && bf.indexOf("blur") >= 0) res.blurs.push({ cls: cls, bf: bf });',
    // 超大圆角
    '    var rad = parseFloat(s.borderTopLeftRadius) || 0;',
    '    if (rad >= 20 && r.width > 80 && r.height > 80) res.bigRadius.push({ cls: cls, rad: rad, size: [Math.round(r.width), Math.round(r.height)] });',
    '  }',
    '  function dedupe(a, key) { var seen = {}, out = []; for (var i=0;i<a.length;i++){ var k = a[i][key]; if (seen[k]) continue; seen[k]=1; out.push(a[i]); } return out.slice(0,8); }',
    '  return JSON.stringify({',
    '    saturated: dedupe(res.saturated, "color"),',
    '    blurs: dedupe(res.blurs, "bf"),',
    '    bigRadius: dedupe(res.bigRadius, "cls"),',
    '  }, null, 1);',
    '})()'
  ].join('\n');

  const pages = ['0', '1', '2', '3'];
  for (const idx of pages) {
    await send('Runtime.evaluate', { expression: `document.querySelectorAll('.nav-item')[${idx}]?.click()` });
    await new Promise(r => setTimeout(r, 1800));
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log('=== nav-item ' + idx + ' ===');
    console.log(res.result.result.value);
  }
  ws.close();
};
run().catch(e => { console.error('ERR', e.message); process.exit(1); });

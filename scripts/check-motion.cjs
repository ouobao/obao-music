/**
 * 动效与视觉令牌静态检查
 * ---------------------------------------------------------------
 * 目的：把"必须用令牌"这条规范变成可执行的检查，而不是靠 review。
 * 只检查本仓库的样式目录，不引入依赖，可直接在 CI / pre-commit 里跑。
 *
 *   node scripts/check-motion.cjs
 *
 * 检查项：
 *   1. transition / animation 里出现裸时长（120ms / 0.3s）
 *   2. 还在引用已删除的曲线别名（--ease-desktop-out / --ease-overshoot …）
 *   3. 硬编码 #fff / #000 作为文字色（应使用 --on-media / --on-accent）
 *   4. 硬编码 border-radius 像素值（应使用 --radius-*）
 *
 * 允许的例外写在 ALLOW 里，并注明原因。
 */

const fs = require('node:fs');
const path = require('node:path');

const STYLE_DIR = path.join(__dirname, '..', 'src', 'renderer', 'styles');
const FILES = fs
  .readdirSync(STYLE_DIR)
  .filter((f) => f.endsWith('.css') && f !== 'tokens.css');

/** 文件名 :: 片段 的精确豁免，必须写明原因 */
const ALLOW = [
  // 骨架屏的流光循环是装饰性常驻动画，节奏靠人工调，不参与交互手感
  'global.css :: animation: skeletonShimmer 1.7s',
  'global.css :: animation: skeletonPulse 1.5s',
  // 二维码扫描线 / 旋转 / 登录状态脉冲：常驻循环，节奏独立
  'components.css :: animation: loginQrScan 2.6s',
  'components.css :: animation: loginStatusPulse 1.6s',
  'components.css :: animation: loginQrSpin 900ms',
  'components.css :: animation: miniSpinner 720ms',
  'components.css :: animation-duration: 0.8s',
  // 播放波形与顶部进度条：循环节奏，非交互反馈
  'views.css :: animation: waveBar 0.9s',
  'views.css :: animation: inlineProgressSlide 1.2s',
  // DNA 轨道极慢自转（外层反向），属于"视觉状态"而非过渡
  'views.css :: animation: dnaOrbitSpin 56s',
  'views.css :: animation-duration: 84s',
  // 定位闪烁是一次性反馈，1.4s 是整段高亮时长（含淡出）
  'components.css :: animation: locateFlash 1.4s',
  // 减弱动效兜底必须是固定 1ms：不能走令牌，否则令牌改了兜底就失效
  'global.css :: animation-duration: 1ms',
  'global.css :: transition-duration: 1ms',
  'global.css :: transition-delay: 0ms',
  // 一次性构图尺寸：按固定容器内径反算，不属于字阶体系
  'views.css :: font-size: 40px',
  'views.css :: font-size: 25px',
  'views.css :: font-size: 216px',
  'views.css :: font-size: 34px'
];

const problems = [];

function push(file, line, kind, text) {
  const key = `${file} :: ${text.trim().slice(0, 60)}`;
  if (ALLOW.some((a) => key.startsWith(a))) return;
  problems.push({ file, line, kind, text: text.trim() });
}

for (const file of FILES) {
  const full = path.join(STYLE_DIR, file);
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const lineNo = index + 1;
    if (!line || line.startsWith('/*') || line.startsWith('*')) return;

    // 1) transition / animation 中的裸时长
    if (/^(transition|animation)(-duration|-delay)?\s*:/.test(line)) {
      const bare = line.match(/(?:^|[\s,(])(\d*\.?\d+)(ms|s)\b/g);
      if (bare) {
        // calc() 里的错峰步进不算时长，跳过
        const withoutCalc = line.replace(/calc\([^)]*\)/g, '');
        const hit = withoutCalc.match(/(?:^|[\s,(])(\d*\.?\d+)(ms|s)\b/);
        if (hit) push(file, lineNo, '裸时长', line);
      }
    }

    // 2) 已删除的曲线别名
    const deadEase = /var\(--ease-(desktop-out|desktop-in-out|overshoot|spring-gentle|lyrics-spring)\)/.exec(line);
    if (deadEase) push(file, lineNo, '失效曲线别名', line);

    // 3) 硬编码黑白文字色
    if (/^\s*color:\s*(#fff|#ffffff|#000|#000000)\s*;/i.test(line)) {
      push(file, lineNo, '硬编码文字色', line);
    }

    // 4) 硬编码圆角
    const radius = /border-radius:\s*([0-9]+(?:\.[0-9]+)?)px/.exec(line);
    if (radius && Number(radius[1]) > 2) {
      // 1/2px 用于进度条与指示条这类"视觉线"，不套圆角体系
      push(file, lineNo, '硬编码圆角', line);
    }

    // 5) 硬编码字号（展示级的一次性构图尺寸不受此限，见 ALLOW）
    const fontSize = /font-size:\s*([0-9]+(?:\.[0-9]+)?)px/.exec(line);
    if (fontSize) {
      push(file, lineNo, '硬编码字号', line);
    }
  });
}

if (problems.length === 0) {
  console.log(`✓ 动效与视觉令牌检查通过（${FILES.length} 个样式文件）`);
  process.exit(0);
}

console.error(`✗ 发现 ${problems.length} 处需要改用令牌的写法：\n`);
const byKind = problems.reduce((acc, p) => {
  (acc[p.kind] ||= []).push(p);
  return acc;
}, {});
for (const [kind, list] of Object.entries(byKind)) {
  console.error(`【${kind}】`);
  for (const p of list) {
    console.error(`  ${p.file}:${p.line}  ${p.text}`);
  }
  console.error('');
}
console.error('规范：时长用 --duration-*（micro/fast/base/page），曲线用');
console.error('--ease-out / --ease-in-out / --ease-emphasized / --ease-spring，');
console.error('文字色用 --text-* 或 --on-media / --on-accent，圆角用 --radius-*。');
process.exit(1);

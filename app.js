/* ============================================================
 * 中国传统色彩 · 应用逻辑层
 * 依赖 data.js（window.COLOR_DATA）
 * ============================================================ */
'use strict';

/* ============ 1. 数据与常量 ============ */
const { colors: COLORS, patterns: PATTERNS, paintings: PAINTINGS } = window.COLOR_DATA;
const FAMILY_ORDER = ['红', '黄', '青', '紫', '白', '黑', '褐'];
const SELF_PROJECT = 'chinese-colors';
const PROJECTS_URL = 'https://yun-ai-base.github.io/psychscope/projects.json';
const TWIN_CATS = {
  ai:      { label: 'AI 对话',  emoji: '🤖' },
  tool:    { label: '工具',     emoji: '🛠️' },
  content: { label: '内容精选', emoji: '📖' }
};
const TWIN_ORDER = ['ai', 'tool', 'content'];
const FAMILY_HUE = { 红: '#c0392b', 黄: '#d4a017', 青: '#2e8b8b', 紫: '#7d5ba6', 白: '#d8d0c0', 黑: '#4a4a4a', 褐: '#8b6048' };
const $ = id => document.getElementById(id);

/* ============ 2. 色彩数学 ============ */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) * 60;
    else if (max === G) h = ((B - R) / d + 2) * 60;
    else h = ((R - G) / d + 4) * 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function hexToLab(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = v => { v /= 255; v = v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; return v * 100; };
  const X = f(r) * 0.95047, Y = f(g) * 1.0, Z = f(b) * 1.08883;
  const g2 = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = g2(X / 95.047), fy = g2(Y / 100), fz = g2(Z / 108.883);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
function deltaE76(labA, labB) {
  return Math.sqrt(Math.pow(labA.L - labB.L, 2) + Math.pow(labA.a - labB.a, 2) + Math.pow(labA.b - labB.b, 2));
}
const labCache = new Map();
function labOf(c) {
  if (!labCache.has(c.id)) labCache.set(c.id, hexToLab(c.hex));
  return labCache.get(c.id);
}

/* ============ 3. 状态 ============ */
const state = { id: 'zhuhong', family: 'all', mode: 'paintings', q: '', stats: false };
let favs = new Set(JSON.parse(localStorage.getItem('cc_fav') || '[]'));
let rotationY = 0, isDragging = false, prevX = 0, velocity = 0, rafId = null, mouseOffsetRotate = 0;
let suppressClick = false, dragStartX = 0, dragDist = 0;
let twinBuilt = false;
const mqMobile = matchMedia('(max-width: 768px)');
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const isMobile = () => mqMobile.matches;

/* ============ 4. 埋点（轻量自托管兼容层） ============ */
function trackEvent(name, data) {
  try {
    const ev = { name, data: data || {}, t: Date.now() };
    const q = JSON.parse(localStorage.getItem('cc_events') || '[]');
    q.push(ev);
    localStorage.setItem('cc_events', JSON.stringify(q.slice(-200)));
    if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data);
    if (window.__CC_DEBUG) console.debug('[cc]', name, data);
  } catch (e) { /* 存储不可用时静默 */ }
}

/* ============ 5. URL 状态化（深链 / 前进后退） ============ */
function parseURL() {
  const p = new URLSearchParams(location.search);
  if (p.has('c') && COLORS.some(x => x.id === p.get('c'))) state.id = p.get('c');
  if (p.has('f') && (p.get('f') === 'all' || FAMILY_ORDER.includes(p.get('f')))) state.family = p.get('f');
  if (p.has('m') && ['paintings', 'patterns'].includes(p.get('m'))) state.mode = p.get('m');
  if (p.has('q')) state.q = p.get('q');
  if (p.get('s') === '1') state.stats = true;
  return p.get('t') === '1';
}

/* ============ 6. 工具 ============ */
function renderColorName(c) {
  return c.pinyin ? '<ruby>' + c.name + '<rt>' + c.pinyin + '</rt></ruby>' : c.name;
}
function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function copyText(text, okMsg) {
  const done = () => toast(okMsg || '已复制到剪贴板');
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动复制'); }
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

/* ============ 7. 配色算法（规则化，可复现） ============ */
function getPalette(color) {
  const { h } = hexToHsl(color.hex);
  const targets = [h, (h + 180) % 360, (h + 120) % 360, (h + 240) % 360, (h + 40) % 360];
  const used = new Set([color.id]);
  const pool = [];
  for (const hue of targets) {
    let best = null, bestD = Infinity;
    for (const c of COLORS) {
      if (used.has(c.id)) continue;
      const ch = hexToHsl(c.hex).h;
      let d = Math.abs(ch - hue);
      d = Math.min(d, 360 - d);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best && bestD <= 45) { used.add(best.id); pool.push(best); }
  }
  if (pool.length < 5) {
    const lab = labOf(color);
    const rest = COLORS.filter(c => !used.has(c.id))
      .sort((a, b) => deltaE76(lab, labOf(a)) - deltaE76(lab, labOf(b)));
    for (const r of rest) { if (pool.length >= 5) break; pool.push(r); used.add(r.id); }
  }
  return pool.slice(0, 5);
}
function getNearColors(color, n) {
  const lab = labOf(color);
  return COLORS.filter(c => c.id !== color.id)
    .map(c => ({ c, d: deltaE76(lab, labOf(c)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.c);
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function todayColor() { return COLORS[hashStr(new Date().toISOString().slice(0, 10)) % COLORS.length]; }

/* ============ 8. 筛选与网格 ============ */
function buildFilters() {
  const g = $('filterGroup');
  g.innerHTML = '';
  const mk = (family, label) => {
    const b = document.createElement('button');
    b.className = 'btn filter-btn' + (family === state.family ? ' active' : '');
    b.dataset.family = family;
    b.setAttribute('aria-pressed', String(family === state.family));
    b.textContent = label;
    b.addEventListener('click', () => setFilter(family));
    return b;
  };
  g.appendChild(mk('all', '全部'));
  FAMILY_ORDER.forEach(f => g.appendChild(mk(f, f)));
}
function setFilter(family) {
  state.family = family;
  document.querySelectorAll('.filter-btn').forEach(b => {
    const on = b.dataset.family === family;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  renderGrid();
  trackEvent('filter', { family });
}
function applyFilters() {
  let list = [...COLORS];
  if (state.family !== 'all') list = list.filter(c => c.family === state.family);
  if (state.q) list = list.filter(c => c.name.includes(state.q));
  return list;
}
function renderGrid() {
  const filtered = applyFilters();
  const grid = $('colorGrid');
  grid.innerHTML = '';
  filtered.forEach(c => {
    const card = document.createElement('button');
    card.className = 'color-card' + (c.id === state.id ? ' active' : '');
    card.dataset.id = c.id;
    card.setAttribute('aria-pressed', String(c.id === state.id));
    card.innerHTML = `
      <div class="color-swatch" style="background:${c.hex}"></div>
      <div class="info"><div class="cname">${renderColorName(c)}</div><div class="cfamily">${c.family}</div></div>`;
    grid.appendChild(card);
  });
  $('emptyState').hidden = filtered.length > 0;
  const total = COLORS.length;
  $('totalCount').textContent = filtered.length === total ? String(total) : `${filtered.length} / ${total}`;
}

/* ============ 9. 轮播（桌面 3D / 移动端横滑降级） ============ */
function getCurrentData() { return state.mode === 'paintings' ? PAINTINGS : PATTERNS; }

function buildCarousel() {
  const data = getCurrentData();
  const el = $('carousel');
  el.innerHTML = '';
  el.className = isMobile() ? 'carousel carousel-swipe' : 'carousel';

  data.forEach(p => {
    const card = document.createElement('div');
    card.className = 'carousel-card';
    if (p.svg) {
      card.innerHTML = p.svg + '<div class="lady-name">' + p.name + '</div>'
        + (p.desc ? '<div class="pattern-desc">' + p.desc + '</div>' : '');
    } else {
      const mask = `linear-gradient(to bottom, transparent ${p.maskT}%, black ${p.maskS}%, black ${p.maskE}%, transparent ${p.maskB}%)`;
      const base = p.file.slice(0, -4);
      const dots = p.palette.length
        ? '<div class="paint-dots">' + p.palette.map(pd =>
            `<button class="paint-dot${pd.colorId === state.id ? ' active' : ''}" data-color="${pd.colorId}" style="background:${pd.hex}" aria-label="${pd.name}（${pd.label}）"><span class="dot-tip">${pd.name} · ${pd.label}</span></button>`).join('') + '</div>'
        : '';
      card.innerHTML = `
        <div class="img-wrap">
          <img src="${p.file}" alt="${p.name}" draggable="false" loading="lazy" decoding="async"
            srcset="${base}-720.webp 720w, ${base}-1440.webp 1440w"
            sizes="(max-width:768px) 82vw, 280px">
          <div class="color-overlay" style="-webkit-mask-image:${mask};mask-image:${mask}"></div>
          <div class="painting-name">${p.name}</div>
          ${dots}
        </div>`;
    }
    el.appendChild(card);
  });

  if (isMobile()) return;
  const step = 360 / data.length;
  [...el.children].forEach((card, i) => { card.dataset.angle = i * step; });
  updateCarouselRotation();
}
function updateCardDepth() {
  const r = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--carousel-radius')) || 240;
  document.querySelectorAll('#carousel .carousel-card').forEach(card => {
    const angle = parseFloat(card.dataset.angle);
    if (isNaN(angle)) return;
    const rad = (angle + rotationY + mouseOffsetRotate) * Math.PI / 180;
    const depth = Math.cos(rad) * 0.5 + 0.5;
    const scale = 0.88 + 0.17 * depth;
    card.style.transform = `rotateY(${angle}deg) translateZ(${r}px) scale(${scale})`;
    card.style.opacity = 0.7 + 0.3 * depth;
    card.style.zIndex = Math.round(depth * 100);
  });
}
function updateCarouselRotation() {
  $('carousel').style.transform = `rotateY(${rotationY + mouseOffsetRotate}deg)`;
  updateCardDepth();
}
function startAutoRotate() {
  if (isMobile() || mqReduce.matches) return;
  if (rafId) cancelAnimationFrame(rafId);
  const step = () => {
    velocity += (0.12 - velocity) * 0.015;
    rotationY += velocity;
    updateCarouselRotation();
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

/* ============ 10. 信息面板（选择颜色） ============ */
function selectColor(id, opts) {
  opts = opts || {};
  const c = COLORS.find(x => x.id === id);
  if (!c) return;
  state.id = id;
  document.documentElement.style.setProperty('--robe-color', c.hex);
  $('currentName').innerHTML = renderColorName(c);
  $('currentHex').textContent = c.hex;
  $('currentDesc').textContent = c.desc;
  const meta = [];
  if (c.dye) meta.push('<span class="k">工艺</span>' + c.dye);
  if (c.usage && c.usage.length) meta.push('<span class="k">用途</span>' + c.usage.join(' · '));
  $('currentMeta').innerHTML = meta.length ? meta.map(m => '<span class="meta-chip">' + m + '</span>').join('') : '';

  const bp = $('backPoem'), bo = $('backObject');
  if (c.poem) { bp.textContent = c.poem; bp.className = 'back-poem'; }
  else { bp.textContent = '此色暂未收录确切诗句考据，欢迎知者补充'; bp.className = 'back-poem none'; }
  bo.textContent = c.object || '暂无考据';
  $('infoPanel').classList.remove('flipped');
  $('infoPanel').setAttribute('aria-expanded', 'false');

  const same = COLORS.filter(x => x.family === c.family && x.id !== id);
  $('relatedChips').innerHTML = same.map(x =>
    `<button class="related-chip" data-id="${x.id}"><span class="dot" style="background:${x.hex}"></span>${x.name}</button>`).join('');

  const near = getNearColors(c, 8);
  $('nearChips').innerHTML = near.map(x =>
    `<button class="related-chip" data-id="${x.id}"><span class="dot" style="background:${x.hex}"></span>${x.name}<span class="f-tag">${x.family}</span></button>`).join('');

  const palette = getPalette(c);
  palette.forEach((p, i) => document.documentElement.style.setProperty('--dot-color-' + i, p.hex));
  $('paletteRow').innerHTML = palette.map(p =>
    `<div class="palette-item-wrap"><button class="palette-item" data-id="${p.id}" style="background:${p.hex}" title="${p.name}"></button><span class="palette-item-name">${p.name}</span></div>`).join('');

  document.querySelectorAll('.color-card').forEach(card => {
    const on = card.dataset.id === id;
    card.classList.toggle('active', on);
    card.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll('.paint-dot').forEach(d => d.classList.toggle('active', d.dataset.color === id));
  updateFavBtn();
  addRecent(id);
  if (!opts.silent) { trackEvent('select_color', { id, name: c.name }); }
}

/* ============ 11. 收藏 / 最近浏览 ============ */
function updateFavBtn() {
  const on = favs.has(state.id);
  $('favBtn').classList.toggle('faved', on);
  $('favBtn').setAttribute('aria-pressed', String(on));
  $('favLabel').textContent = on ? '已收藏' : '收藏';
}
function addRecent(id) {
  try {
    let rec = JSON.parse(localStorage.getItem('cc_recent') || '[]');
    rec = [id, ...rec.filter(x => x !== id)].slice(0, 20);
    localStorage.setItem('cc_recent', JSON.stringify(rec));
  } catch (e) { /* ignore */ }
}

/* ============ 12. 今日一色 ============ */
function renderToday() {
  const c = todayColor();
  $('todayName').textContent = '今日一色 · ' + c.name;
  $('todaySwatch').style.background = c.hex;
}

/* ============ 13. 统计面板 ============ */
function renderDonut() {
  const counts = FAMILY_ORDER.map(f => COLORS.filter(c => c.family === f).length);
  const total = COLORS.length;
  let acc = 0;
  const stops = FAMILY_ORDER.map((f, i) => {
    const from = acc / total * 100, to = (acc + counts[i]) / total * 100;
    acc += counts[i];
    return `${FAMILY_HUE[f]} ${from}% ${to}%`;
  });
  $('donut').style.background = `conic-gradient(${stops.join(', ')})`;
  $('donutTotal').textContent = total;
  $('donutLegend').innerHTML = FAMILY_ORDER.map((f, i) =>
    `<span><i style="background:${FAMILY_HUE[f]}"></i>${f} ${counts[i]}</span>`).join('');
}
function renderHueScatter() {
  const cv = $('hueCanvas');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = 100;
  ctx.clearRect(0, 0, W, H);
  const pts = COLORS.map(c => {
    const { h, s } = hexToHsl(c.hex);
    const ang = h * Math.PI / 180;
    const r = s / 100 * R;
    return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), c };
  });
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = p.c.hex;
    ctx.fill();
    ctx.strokeStyle = luminance(p.c.hex) > 0.6 ? 'rgba(60,40,20,.5)' : 'rgba(255,255,255,.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  const tip = document.createElement('div');
  tip.style.cssText = 'position:absolute;pointer-events:none;background:rgba(30,25,18,.88);color:#fff;font-size:11px;padding:3px 9px;border-radius:6px;font-family:var(--sans);letter-spacing:1px;white-space:nowrap;opacity:0;transition:opacity .12s;z-index:10;';
  const wrap = cv.parentElement;
  if (!wrap.querySelector('.hue-tip')) wrap.appendChild(tip);
  tip.classList.add('hue-tip');
  const showTip = (c, x, y, rect) => {
    tip.textContent = `${c.name} · ${c.family} ${c.hex}`;
    tip.style.left = Math.min(Math.max(x - 20, 0), rect.width - 150) + 'px';
    tip.style.top = Math.max(y - 30, 0) + 'px';
    tip.style.opacity = '1';
  };
  cv.onmousemove = e => {
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * W;
    const my = (e.clientY - rect.top) / rect.height * H;
    let best = null, bd = 18;
    pts.forEach(p => { const d = Math.hypot(p.x - mx, p.y - my); if (d < bd) { bd = d; best = p; } });
    if (best) showTip(best.c, best.x, best.y, rect);
    else tip.style.opacity = '0';
  };
  cv.onmouseleave = () => { tip.style.opacity = '0'; };
}
function toggleStats() {
  state.stats = !state.stats;
  const p = $('vizPanel');
  p.hidden = !state.stats;
  $('statsBtn').setAttribute('aria-expanded', String(state.stats));
  if (state.stats) { renderDonut(); renderHueScatter(); }
  trackEvent('stats', { open: state.stats });
}

/* ============ 14. 导出 ============ */
function cssVarsFor(c) {
  const pal = [c, ...getPalette(c)];
  const vars = pal.map((x, i) => `  --cc-${i === 0 ? 'base' : 'c' + i}: ${x.hex};  /* ${x.name} */`).join('\n');
  return `/* ${c.name} · ${c.hex} · 中国传统色彩 */\n:root {\n${vars}\n}`;
}
function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function downloadPNG(c) {
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 140;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fdfaf5';
  ctx.fillRect(0, 0, 640, 140);
  const pal = [c, ...getPalette(c)];
  pal.forEach((x, i) => {
    ctx.beginPath();
    ctx.arc(70 + i * 125, 70, 48, 0, Math.PI * 2);
    ctx.fillStyle = x.hex;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#3d2b1f';
    ctx.font = '13px serif';
    ctx.textAlign = 'center';
    ctx.fillText(x.name, 70 + i * 125, 128);
  });
  try { cv.toBlob(b => downloadBlob(b, `palette-${c.id}.png`, 'image/png')); }
  catch (e) { toast('PNG 生成失败'); }
}
function doExport(kind) {
  const c = COLORS.find(x => x.id === state.id);
  if (kind === 'css') { copyText(cssVarsFor(c), 'CSS 变量已复制'); trackEvent('export_css', { id: c.id }); }
  else if (kind === 'json') {
    const pal = [c, ...getPalette(c)];
    downloadBlob(JSON.stringify({ color: c, palette: pal.map(x => ({ id: x.id, name: x.name, hex: x.hex, family: x.family })) }, null, 2),
      `color-${c.id}.json`, 'application/json');
    toast('JSON 已下载');
    trackEvent('export_json', { id: c.id });
  }
  else if (kind === 'png') { downloadPNG(c); toast('配色 PNG 已下载'); trackEvent('export_png', { id: c.id }); }
  const m = $('exportMenu');
  if (m) m.style.display = 'none';
}
function buildExportMenu() {
  if ($('exportMenu')) return $('exportMenu');
  const menu = document.createElement('div');
  menu.id = 'exportMenu';
  menu.style.cssText = 'position:absolute;right:8px;top:calc(100% + 2px);background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-2);z-index:60;min-width:158px;overflow:hidden;display:none';
  [['复制 CSS 变量', 'css'], ['下载颜色 JSON', 'json'], ['下载配色 PNG', 'png']].forEach(([label, key]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'display:block;width:100%;text-align:left;padding:9px 14px;font-size:13px;font-family:var(--sans);color:var(--text);transition:background .15s';
    b.addEventListener('mouseenter', () => { b.style.background = 'var(--surface-2)'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
    b.addEventListener('click', () => { doExport(key); });
    menu.appendChild(b);
  });
  $('infoPanel').appendChild(menu);
  return menu;
}

/* ============ 15. 孪生宇宙 ============ */
async function buildTwin() {
  $('twinLoading').hidden = false;
  $('twinError').hidden = true;
  try {
    const res = await fetch(PROJECTS_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const all = await res.json();
    const projects = all.filter(p => p.name !== SELF_PROJECT);
    const byCat = {};
    projects.forEach(s => { (byCat[s.cat] = byCat[s.cat] || []).push(s); });
    let html = '';
    TWIN_ORDER.forEach(cat => {
      const list = byCat[cat];
      if (!list) return;
      const info = TWIN_CATS[cat];
      html += '<div class="twin-section"><div class="twin-section-title">' + info.emoji + ' ' + info.label + '</div><div class="twin-grid">';
      list.forEach(s => {
        html += '<a class="twin-card" href="https://yun-ai-base.github.io/' + encodeURIComponent(s.name) + '/" target="_blank" rel="noopener">'
          + '<span class="twin-card-icon">' + (s.icon || '🔗') + '</span>'
          + '<span class="twin-card-info"><span class="twin-card-name">' + escHtml(s.name) + '</span>'
          + '<span class="twin-card-desc">' + escHtml(s.desc) + '</span></span>'
          + '<span class="twin-card-arrow">→</span></a>';
      });
      html += '</div></div>';
    });
    $('twinLoading').hidden = true;
    $('twinContainer').innerHTML = html || '<div class="twin-msg">暂无其他项目</div>';
  } catch (err) {
    $('twinLoading').hidden = true;
    $('twinError').hidden = false;
    trackEvent('twin_error', { msg: String((err && err.message) || err) });
  }
}
function openTwin() {
  const v = $('twinView');
  v.classList.add('open');
  document.body.style.overflow = 'hidden';
  $('twinClose').focus();
  if (!twinBuilt) { twinBuilt = true; buildTwin(); }
  trackEvent('twin_open');
}
function closeTwin() {
  $('twinView').classList.remove('open');
  document.body.style.overflow = '';
  trackEvent('twin_close');
}

/* ============ 16. 主题 ============ */
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_PAINTING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5-9 9"/></svg>';
const ICON_PATTERN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>';
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('themeIcon').innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#1E1A16' : '#F7F3EC';
}

/* ============ 17. 事件绑定 ============ */
function bindEvents() {
  /* 全局点击委托：颜色卡 / chips / 调色板 / 画作色点 */
  document.addEventListener('click', e => {
    const dot = e.target.closest('.paint-dot');
    if (dot) {
      e.stopPropagation();
      selectColor(dot.dataset.color);
      trackEvent('painting_dot', { id: dot.dataset.color });
      return;
    }
    const chip = e.target.closest('.related-chip');
    if (chip) { e.stopPropagation(); selectColor(chip.dataset.id); return; }
    const pit = e.target.closest('.palette-item');
    if (pit) { e.stopPropagation(); selectColor(pit.dataset.id); return; }
    const card = e.target.closest('.color-card');
    if (card) { selectColor(card.dataset.id); return; }
    const menu = $('exportMenu');
    if (menu && menu.style.display !== 'none' && !e.target.closest('#exportMenu') && !e.target.closest('#exportBtn')) {
      menu.style.display = 'none';
    }
  });

  /* 信息卡翻转 */
  const ip = $('infoPanel');
  ip.addEventListener('click', e => {
    if (e.target.closest('.related-chip') || e.target.closest('.palette-item') || e.target.closest('#exportMenu') || e.target.closest('.mini-btn')) return;
    ip.classList.toggle('flipped');
    ip.setAttribute('aria-expanded', String(ip.classList.contains('flipped')));
    trackEvent('flip');
  });
  ip.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      ip.classList.toggle('flipped');
      ip.setAttribute('aria-expanded', String(ip.classList.contains('flipped')));
      trackEvent('flip_keyboard');
    }
  });

  /* 搜索 */
  let searchTimer = null;
  $('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      renderGrid();
      trackEvent('search', { q: state.q });
    }, 250);
  });

  /* 模式切换 */
  $('modeBtn').addEventListener('click', () => {
    state.mode = state.mode === 'paintings' ? 'patterns' : 'paintings';
    const onPaint = state.mode === 'paintings';
    $('modeLabel').textContent = onPaint ? '画作' : '纹样';
    $('modeIcon').innerHTML = onPaint ? ICON_PAINTING : ICON_PATTERN;
    $('modeBtn').setAttribute('aria-pressed', String(onPaint));
    buildCarousel();
    if (!isMobile()) startAutoRotate();
    trackEvent('mode', { mode: state.mode });
  });

  /* 统计 */
  $('statsBtn').addEventListener('click', toggleStats);

  /* 收藏 */
  $('favBtn').addEventListener('click', e => {
    e.stopPropagation();
    if (favs.has(state.id)) favs.delete(state.id);
    else favs.add(state.id);
    localStorage.setItem('cc_fav', JSON.stringify([...favs]));
    updateFavBtn();
    trackEvent('fav', { id: state.id, on: favs.has(state.id) });
    toast(favs.has(state.id) ? '已加入收藏' : '已取消收藏');
  });

  /* 导出菜单 */
  $('exportBtn').addEventListener('click', e => {
    e.stopPropagation();
    const m = buildExportMenu();
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
  });

  /* 分享深链（显式触发，不污染地址栏；file:// 下不可用） */
  $('shareBtn').addEventListener('click', e => {
    e.stopPropagation();
    if (location.protocol === 'file:') {
      toast('本地预览无法生成分享链接，部署后可分享');
      return;
    }
    const url = location.origin + location.pathname + '?c=' + state.id;
    copyText(url, '当前颜色链接已复制');
    trackEvent('share', { id: state.id });
  });

  /* 今日一色 */
  $('todayBtn').addEventListener('click', () => {
    const c = todayColor();
    setFilter('all');
    $('searchInput').value = '';
    state.q = '';
    selectColor(c.id);
    trackEvent('today_click', { id: c.id });
  });

  /* 主题 */
  $('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('cc_theme', next);
    applyTheme(next);
    trackEvent('theme', { theme: next });
  });

  /* 孪生宇宙 */
  $('twinOpenBtn').addEventListener('click', openTwin);
  $('twinClose').addEventListener('click', closeTwin);
  $('twinView').addEventListener('click', e => { if (e.target === $('twinView')) closeTwin(); });

  /* 轮播拖拽（桌面） */
  const car = $('carousel');
  car.addEventListener('mousedown', e => {
    if (isMobile()) return;
    isDragging = true; prevX = e.clientX; dragStartX = e.clientX; dragDist = 0;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    car.setPointerCapture && car.setPointerCapture(e.pointerId);
  });
  car.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - prevX;
    dragDist += Math.abs(dx);
    rotationY += dx * 0.5; prevX = e.clientX; velocity = dx * 0.3;
    updateCarouselRotation();
  });
  car.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    if (dragDist > 6) { suppressClick = true; }
    startAutoRotate();
  });
  car.addEventListener('mouseleave', () => { if (isDragging) { isDragging = false; startAutoRotate(); } });
  /* 拖拽后抑制点击（修复误触） */
  car.addEventListener('click', e => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
  }, true);

  /* 触摸：移动端横滑由原生滚动处理，桌面 3D 用鼠标，无需 touch 监听 */

  /* 键盘全局 */
  document.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      const m = $('exportMenu');
      if (m && m.style.display !== 'none') { m.style.display = 'none'; return; }
      if ($('twinView').classList.contains('open')) { closeTwin(); return; }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      if (isMobile()) {
        $('carousel').scrollBy({ left: dir * 260, behavior: mqReduce.matches ? 'auto' : 'smooth' });
      } else {
        rotationY += dir * 24;
        updateCarouselRotation();
      }
      e.preventDefault();
      trackEvent('keyboard_rotate', { dir });
    }
  });

  /* 窗口缩放 */
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const wasMobile = isMobile();
      buildCarousel();
      if (!wasMobile) updateCardDepth();
    }, 250);
  });

  /* 前进 / 后退 */
  window.addEventListener('popstate', () => {
    const openT = parseURL();
    $('searchInput').value = state.q;
    document.querySelectorAll('.filter-btn').forEach(b => {
      const on = b.dataset.family === state.family;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('modeLabel').textContent = state.mode === 'paintings' ? '画作' : '纹样';
    $('modeIcon').innerHTML = state.mode === 'paintings' ? ICON_PAINTING : ICON_PATTERN;
    $('modeBtn').setAttribute('aria-pressed', String(state.mode === 'paintings'));
    $('vizPanel').hidden = !state.stats;
    $('statsBtn').setAttribute('aria-expanded', String(state.stats));
    if (state.stats) { renderDonut(); renderHueScatter(); }
    buildCarousel();
    if (!isMobile()) startAutoRotate();
    renderGrid();
    selectColor(state.id, { silent: true });
    if (openT && !$('twinView').classList.contains('open')) openTwin();
    if (!openT && $('twinView').classList.contains('open')) closeTwin();
  });
}

/* ============ 18. 初始化 ============ */
function init() {
  const savedTheme = localStorage.getItem('cc_theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);

  const openT = parseURL();
  $('searchInput').value = state.q;

  buildFilters();
  document.querySelectorAll('.filter-btn').forEach(b => {
    const on = b.dataset.family === state.family;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('modeLabel').textContent = state.mode === 'paintings' ? '画作' : '纹样';
  $('modeIcon').innerHTML = state.mode === 'paintings' ? ICON_PAINTING : ICON_PATTERN;
  $('modeBtn').setAttribute('aria-pressed', String(state.mode === 'paintings'));
  $('vizPanel').hidden = !state.stats;
  if (state.stats) { renderDonut(); renderHueScatter(); }

  renderToday();
  buildCarousel();
  if (!isMobile()) startAutoRotate();
  renderGrid();
  selectColor(state.id, { silent: true });
  updateFavBtn();
  bindEvents();
  if (openT) openTwin();
  trackEvent('page_view', { colors: COLORS.length });

  /* Service Worker（仅 http(s) 环境；file:// 注册失败时静默降级） */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

document.addEventListener('DOMContentLoaded', init);

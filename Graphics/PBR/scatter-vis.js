/*
 * 스캐터링(미세면 단면) 시각화 위젯 공용 모듈.
 * Single_Scattering_Visualizer / Multi_Scattering_Visualizer 가 함께 사용한다 —
 * 여기를 수정하면 두 위젯에 모두 반영된다.
 *
 * 미세면 단면에 왼쪽 위에서 directional 라이트가 입사하고:
 *   - 싱글(multi: false): 한 번 반사된 빛이 다른 미세면에 막히면(셰도잉/마스킹) 거기서 소멸 (빨강 + ✕)
 *   - 멀티(multi: true):  막힌 빛도 재귀적으로 반사를 거듭해 결국 표면을 빠져나간다 (파랑)
 */

const PI = Math.PI;

// ---- 미세면 형상 파라미터 (여기만 바꾸면 두 위젯 모두 반영) ----
const SEED = 1;            // 난수 시드 — 바꾸면 다른 형상
const OCTAVES = [          // [진폭, 굴곡 개수] — 저주파(큰 굴곡) → 고주파(잔굴곡)
  [5, 37],
  [3, 20],
  [7, 30],
];
const SURF_HEIGHT = 1.3;   // 단면 전체 높이 (월드 단위, 가로 폭은 10)
const SURF_POINTS = 81;    // 단면 정점 개수

// ---- 광선 파라미터 ----
const TARGETS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0];  // 입사 광선이 닿는 목표 x
const Y_TOP = 3.0;         // 입사 광선 추적 시작 높이
const MAX_BOUNCES = 12;    // 멀티 스캐터링 반사 한도 (안전장치)

// ---- 색 ----
const RAY = '#e08214';     // 입사 광선
const ESCAPE = '#3b8fd1';  // 빠져나가는 반사 광선 (파랑)
const BLOCK = '#d8334a';   // 막힌 반사 광선 / 차단 표시 ✕ (빨강)
const SURF_FILL = '#e8e8e8';
const SURF_LINE = '#555';

// ---- 미세면 단면 생성 (시드 고정 → 항상 같은 형상) ----
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SURF = (function() {
  const rnd = mulberry32(SEED);
  // 다중 옥타브 value noise — 크고 작은 굴곡이 섞인 불규칙한 단면
  function makeOctave(cells) {
    const v = [];
    for (let i = 0; i <= cells; i++) v.push(rnd());
    return function(t) {
      const f = t * cells, i = Math.min(Math.floor(f), cells - 1), u = f - i;
      const s = (1 - Math.cos(u * PI)) / 2;
      return v[i] * (1 - s) + v[i + 1] * s;
    };
  }
  const octs = OCTAVES.map(([amp, cells]) => [amp, makeOctave(cells)]);
  const pts = [];
  for (let i = 0; i < SURF_POINTS; i++) {
    let x = (i / (SURF_POINTS - 1)) * 10;
    if (i > 0 && i < SURF_POINTS - 1) x += (rnd() - 0.5) * 0.06;
    const t = x / 10;
    let y = 0;
    for (const [amp, o] of octs) y += amp * o(t);
    pts.push({ x, y });
  }
  // 높이를 [0, SURF_HEIGHT] 범위로 정규화
  let mn = Infinity, mx = -Infinity;
  for (const p of pts) { mn = Math.min(mn, p.y); mx = Math.max(mx, p.y); }
  for (const p of pts) p.y = (p.y - mn) / (mx - mn) * SURF_HEIGHT;
  return pts;
})();

// ---- 광선 추적 (월드 좌표: x 오른쪽, y 위) ----
function intersectSeg(px, py, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((ax - px) * ey - (ay - py) * ex) / den;
  const u = ((ax - px) * dy - (ay - py) * dx) / den;
  if (t > 1e-6 && u >= 0 && u <= 1) return t;
  return null;
}
function traceSurface(px, py, dx, dy, skip) {
  let bestT = Infinity, bestI = -1;
  for (let i = 0; i < SURF.length - 1; i++) {
    if (i === skip) continue;
    const t = intersectSeg(px, py, dx, dy, SURF[i].x, SURF[i].y, SURF[i + 1].x, SURF[i + 1].y);
    if (t !== null && t < bestT) { bestT = t; bestI = i; }
  }
  if (bestI < 0) return null;
  return { i: bestI, x: px + dx * bestT, y: py + dy * bestT };
}
function reflectOff(dx, dy, i) {
  const ax = SURF[i].x, ay = SURF[i].y, bx = SURF[i + 1].x, by = SURF[i + 1].y;
  const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey);
  let nx = -ey / len, ny = ex / len;
  if (ny < 0) { nx = -nx; ny = -ny; }   // 위쪽을 향하는 법선
  const d = dx * nx + dy * ny;
  return [dx - 2 * d * nx, dy - 2 * d * ny];
}

/**
 * 위젯 초기화.
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {HTMLInputElement}  opts.slider   Light θ 슬라이더 (도 단위)
 * @param {HTMLElement}       opts.valueEl  슬라이더 값 표시 요소
 * @param {boolean}           opts.multi    true면 멀티 스캐터링 (재귀 반사)
 */
export function initScatterWidget({ canvas, slider, valueEl, multi }) {
  const ctx = canvas.getContext('2d');
  let lightTheta = +slider.value * PI / 180;   // 수직(법선) 기준, 왼쪽에서 입사

  // 각 광선의 경로 계산: [{path: [...], escaped, exitDir}]
  function computeRays() {
    const dx = Math.sin(lightTheta), dy = -Math.cos(lightTheta);
    const rays = [];
    const limit = multi ? MAX_BOUNCES : 1;
    for (const tx of TARGETS) {
      const sx = tx - dx / (-dy) * (Y_TOP - 0.5);
      let hit = traceSurface(sx, Y_TOP, dx, dy, -1);
      if (!hit) continue;
      const path = [{ x: sx, y: Y_TOP }, { x: hit.x, y: hit.y }];
      let cdx = dx, cdy = dy, escaped = false, exitDir = null;
      for (let b = 0; b < limit; b++) {
        [cdx, cdy] = reflectOff(cdx, cdy, hit.i);
        const next = traceSurface(hit.x, hit.y, cdx, cdy, hit.i);
        if (!next) { escaped = true; exitDir = [cdx, cdy]; break; }
        path.push({ x: next.x, y: next.y });
        hit = next;
      }
      rays.push({ path, escaped, exitDir });
    }
    return rays;
  }

  // ---- 그리기 ----
  let scale = 1, originX = 0, baselineY = 0, cw = 0, ch = 0;
  function setupView() {
    cw = canvas.clientWidth;
    ch = canvas.clientHeight;
    const margin = 12;
    scale = (cw - margin * 2) / 10;
    originX = margin;
    baselineY = ch * 0.8;
  }
  function toScreen(p) {
    return { x: originX + p.x * scale, y: baselineY - p.y * scale };
  }
  // 화면 사각형 밖으로 나갈 때까지의 거리
  function distToEdge(px, py, dx, dy) {
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (cw - px) / dx);
    if (dx < 0) t = Math.min(t, -px / dx);
    if (dy > 0) t = Math.min(t, (ch - py) / dy);
    if (dy < 0) t = Math.min(t, -py / dy);
    return Math.max(t, 0);
  }
  function arrowHead(x, y, dx, dy, size) {
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - ux * size - uy * size * 0.5, y - uy * size + ux * size * 0.5);
    ctx.lineTo(x - ux * size + uy * size * 0.5, y - uy * size - ux * size * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  // 선분 + 중간 화살촉
  function drawSeg(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    arrowHead(mx, my, b.x - a.x, b.y - a.y, 8);
  }

  function drawSurface() {
    ctx.beginPath();
    const p0 = toScreen(SURF[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < SURF.length; i++) {
      const p = toScreen(SURF[i]);
      ctx.lineTo(p.x, p.y);
    }
    const pl = toScreen(SURF[SURF.length - 1]);
    ctx.lineTo(pl.x, ch);
    ctx.lineTo(p0.x, ch);
    ctx.closePath();
    ctx.fillStyle = SURF_FILL;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < SURF.length; i++) {
      const p = toScreen(SURF[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = SURF_LINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawRays() {
    const rays = computeRays();
    ctx.lineWidth = 2;
    for (const ray of rays) {
      const sp = ray.path.map(toScreen);
      // 입사 구간은 화면 가장자리에서 시작하도록 뒤로 연장
      ctx.strokeStyle = RAY;
      ctx.fillStyle = RAY;
      const inDx = sp[1].x - sp[0].x, inDy = sp[1].y - sp[0].y;
      const inLen = Math.hypot(inDx, inDy);
      const back = distToEdge(sp[1].x, sp[1].y, -inDx / inLen, -inDy / inLen);
      const start = { x: sp[1].x - inDx / inLen * back, y: sp[1].y - inDy / inLen * back };
      drawSeg(start, sp[1]);
      // 반사 구간 — 막히면 빨강, 빠져나가면 파랑 (멀티는 전부 빠져나가므로 파랑)
      const col = ray.escaped ? ESCAPE : BLOCK;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      for (let i = 1; i < sp.length - 1; i++) drawSeg(sp[i], sp[i + 1]);
      // 탈출 광선은 화면 끝까지 연장
      if (ray.escaped) {
        const last = sp[sp.length - 1];
        const ex = ray.exitDir[0], ey = -ray.exitDir[1];   // 월드→화면 (y 뒤집힘)
        const eLen = Math.hypot(ex, ey);
        const out = distToEdge(last.x, last.y, ex / eLen, ey / eLen);
        drawSeg(last, { x: last.x + ex / eLen * out, y: last.y + ey / eLen * out });
      }
      // 반사 지점 표시
      for (let i = 1; i < sp.length - (ray.escaped ? 0 : 1); i++) {
        ctx.beginPath();
        ctx.arc(sp[i].x, sp[i].y, 2.5, 0, PI * 2);
        ctx.fill();
      }
      // 차단 지점 ✕ (멀티에선 반사 한도 초과 시에만 — 정상 형상에선 도달하지 않음)
      if (!ray.escaped) {
        const p = sp[sp.length - 1];
        ctx.strokeStyle = BLOCK;
        ctx.lineWidth = 2.5;
        const s = 6;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s);
        ctx.moveTo(p.x - s, p.y + s); ctx.lineTo(p.x + s, p.y - s);
        ctx.stroke();
        ctx.lineWidth = 2;
      }
    }
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    setupView();
    drawSurface();
    drawRays();
  }

  slider.addEventListener('input', () => {
    valueEl.textContent = (+slider.value).toFixed(1) + '°';
    lightTheta = +slider.value * PI / 180;
    draw();
  });

  window.addEventListener('resize', draw);
  if (window.ResizeObserver) {
    new ResizeObserver(draw).observe(canvas);
  }
  draw();
}

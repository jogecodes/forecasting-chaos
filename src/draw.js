import { boundsOf, project } from './math.js';

export const C = { lime: '#d3ef93', coral: '#ff967d', cyan: '#8ecad2', white: '#e9ede5', muted: '#8c999f', grid: '#273039', violet: '#b6a5e0' };

export function surface(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function path(ctx, points, color, lineWidth = 1.4, alpha = 1, dash = []) {
  ctx.save();ctx.strokeStyle = color;ctx.lineWidth = lineWidth;ctx.globalAlpha = alpha;
  ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();ctx.restore();
}

export function scene(canvas, series, options = {}) {
  const { ctx, width, height } = surface(canvas);
  const bounds = options.bounds || boundsOf(series);
  const yaw = options.yaw ?? -.5, pitch = options.pitch ?? .38;
  const P = p => project(p, bounds, yaw, pitch, width, height);
  const point = (s, i) => Array.from({ length: 3 }, (_, j) => j < (s.dimensions ?? 3) ? s.data[i * s.width + (s.offset || 0) + j] : 0);
  if (options.grid !== false) {
    const { center, extent } = bounds;
    for (let k = -2; k <= 2; k++) {
      const v = k * extent / 5;
      path(ctx, [P([center[0] - extent * .5, center[1] + v, center[2] - extent * .45]), P([center[0] + extent * .5, center[1] + v, center[2] - extent * .45])], C.grid, .6, .7);
      path(ctx, [P([center[0] + v, center[1] - extent * .5, center[2] - extent * .45]), P([center[0] + v, center[1] + extent * .5, center[2] - extent * .45])], C.grid, .6, .7);
    }
  }
  for (const s of series) {
    const n = s.data.length / s.width;
    const end = Math.min(n - 1, Math.max(0, Math.floor(options.index ?? n - 1)));
    const start = Math.max(0, end - (options.trail ?? Infinity));
    if (options.ghost) {
      const ghost = [];
      for (let i = 0; i < n; i += Math.max(1, Math.ceil(n / 3500))) ghost.push(P(point(s, i)));
      path(ctx, ghost, s.color || C.lime, .7, .1);
    }
    const points = [];
    for (let i = start; i <= end; i += Math.max(1, Math.ceil((end - start) / 4000))) points.push(P(point(s, i)));
    points.push(P(point(s, end)));
    path(ctx, points, s.color || C.lime, s.lineWidth || 1.3, s.alpha ?? 1, s.dash);
    const [x, y] = P(point(s, end));
    if (options.headGlow) {
      ctx.save();ctx.fillStyle = s.color || C.lime;ctx.shadowColor = s.color || C.lime;ctx.shadowBlur = 14;
      ctx.beginPath();ctx.arc(x, y, 3.5, 0, Math.PI * 2);ctx.fill();ctx.restore();
    }
    ctx.fillStyle = s.color || C.lime;ctx.globalAlpha = s.alpha ?? 1;
    ctx.beginPath();
    if (s.marker === 'ring') {
      ctx.strokeStyle = s.color || C.lime;ctx.lineWidth = 1.8;
      ctx.arc(x, y, 7, 0, Math.PI * 2);ctx.stroke();
    } else if (s.marker === 'diamond') {
      ctx.moveTo(x, y - 3.8);ctx.lineTo(x + 3.8, y);ctx.lineTo(x, y + 3.8);ctx.lineTo(x - 3.8, y);ctx.closePath();ctx.fill();
    } else {
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (options.labels) {
    ctx.font = '10px monospace';ctx.fillStyle = C.muted;
    ctx.fillText(options.labels.join(' / '), 22, height - 38);
  }
}

export function chart(canvas, lines, options = {}) {
  const { ctx, width, height } = surface(canvas);
  const left = 39, right = width - 12, top = 12, bottom = height - 25;
  const xMax = options.xMax ?? Math.max(...lines.map(s => s.values.length - 1));
  const n = Math.min(options.samples ?? Infinity, Math.max(...lines.map(s => s.values.length)));
  let low = Infinity, high = -Infinity;
  const transform = v => options.log ? Math.log10(Math.max(v, 1e-12)) : v;
  for (const s of options.scaleLines || lines) for (let i = 0; i < Math.min(n, s.values.length); i++) {
    const v = transform(s.values[i]);if (Number.isFinite(v)) { low = Math.min(low, v);high = Math.max(high, v); }
  }
  if (options.yMin !== undefined) low = transform(options.yMin);
  if (options.yMax !== undefined) high = transform(options.yMax);
  if (!Number.isFinite(low)) { low = 0;high = 1; }
  const pad = (high - low || 1) * .1;
  if (options.yMin === undefined) low -= pad;
  if (options.yMax === undefined) high += pad;
  const X = t => left + (t / Math.max(xMax, 1e-9)) * (right - left);
  const Y = v => bottom - ((transform(v) - low) / (high - low)) * (bottom - top);
  ctx.font = '9px monospace';ctx.lineWidth = .6;
  for (let k = 0; k < 3; k++) {
    const y = top + (bottom - top) * k / 2;
    ctx.strokeStyle = C.grid;ctx.beginPath();ctx.moveTo(left, y);ctx.lineTo(right, y);ctx.stroke();
    const value = high - (high - low) * k / 2;
    ctx.fillStyle = C.muted;ctx.textAlign = 'right';
    ctx.fillText(options.log ? `10^${Math.round(value)}` : formatNumber(value), left - 6, y + 3);
  }
  ctx.textAlign = 'center';
  for (let k = 0; k < 3; k++) ctx.fillText(formatNumber(xMax * k / 2), X(xMax * k / 2), height - 6);
  ctx.save();ctx.beginPath();ctx.rect(left, top, right - left, bottom - top);ctx.clip();
  for (const marker of options.markers || []) {
    if (marker.time === null || marker.time > xMax) continue;
    ctx.setLineDash(marker.dash || [4, 4]);ctx.strokeStyle = marker.color || C.coral;
    ctx.beginPath();ctx.moveTo(X(marker.time), top);ctx.lineTo(X(marker.time), bottom);ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const s of lines) {
    const end = Math.min(n - 1, s.values.length - 1, options.index ?? Infinity);
    const points = [];
    for (let i = 0; i <= end; i += Math.max(1, Math.floor(n / Math.max(width * 2, 1)))) points.push([X(i * (options.dt || 1)), Y(s.values[i])]);
    if (end >= 0) points.push([X(end * (options.dt || 1)), Y(s.values[end])]);
    path(ctx, points, s.color || C.lime, s.lineWidth || 1.2, s.alpha ?? 1, s.dash);
  }
  if (options.index !== undefined) {
    const x = X(options.index * (options.dt || 1));
    ctx.strokeStyle = '#e9ede540';ctx.beginPath();ctx.moveTo(x, top);ctx.lineTo(x, bottom);ctx.stroke();
  }
  ctx.restore();ctx.textAlign = 'start';
}

export function formatNumber(value) {
  if (Math.abs(value) >= 10000) return value.toExponential(0);
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function orbit(canvas, changed) {
  const state = { yaw: -.55, pitch: .35 };
  let previous = null;
  canvas.tabIndex = 0;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    previous = [e.clientX, e.clientY];canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!previous) return;
    state.yaw += (e.clientX - previous[0]) * .007;
    state.pitch = Math.max(-1.3, Math.min(1.3, state.pitch + (e.clientY - previous[1]) * .005));
    previous = [e.clientX, e.clientY];changed();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { previous = null; });
  canvas.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    state.yaw += ({ ArrowLeft: -.08, ArrowRight: .08 }[e.key] || 0);
    state.pitch = Math.max(-1.3, Math.min(1.3, state.pitch + ({ ArrowUp: -.08, ArrowDown: .08 }[e.key] || 0)));
    changed();
  });
  return state;
}

export function pendulum(canvas, data, index, trail = 150, options = {}) {
  const { ctx, width, height } = surface(canvas);
  const length = Math.min(width * .19, height * .19), cx = width / 2, cy = height * .4;
  const position = i => {
    const a = data[i * 4], b = data[i * 4 + 1];
    const x1 = cx + length * Math.sin(a), y1 = cy + length * Math.cos(a);
    return [[cx, cy], [x1, y1], [x1 + length * Math.sin(b), y1 + length * Math.cos(b)]];
  };
  const points = [];
  for (let i = Math.max(0, index - trail); i <= index; i++) points.push(position(i)[2]);
  path(ctx, points, options.color || C.coral, 1.2, .55);
  const rods = position(index);path(ctx, rods, options.color || C.white, 2);
  rods.forEach(([x, y], i) => { ctx.fillStyle = options.color || (i === 2 ? C.coral : C.lime);ctx.beginPath();ctx.arc(x, y, i ? 7 : 3, 0, Math.PI * 2);ctx.fill(); });
}

export function waterwheel(canvas, data, index, buckets, options = {}) {
  const { ctx, width, height } = surface(canvas);
  const radius = Math.min(width * .3, height * .31), cx = width / 2, cy = height * .47;
  const row = index * (buckets + 2), theta = data[row];
  const maximumMass = options.massScale || Math.max(...Array.from({ length: buckets }, (_, j) => data[row + j + 2]), .1);
  ctx.strokeStyle = '#8ecad245';ctx.lineWidth = 1;
  ctx.beginPath();ctx.arc(cx, cy, radius, 0, Math.PI * 2);ctx.stroke();
  for (let j = 0; j < buckets; j++) {
    const angle = theta + j * 2 * Math.PI / buckets;
    const x = cx + radius * Math.sin(angle), y = cy - radius * Math.cos(angle);
    path(ctx, [[cx, cy], [x, y]], C.muted, .5, .35);
    ctx.strokeStyle = options.color || C.cyan;ctx.strokeRect(x - 5, y - 7, 10, 14);
    const fill = data[row + j + 2] / maximumMass * 12;
    ctx.fillStyle = options.color || C.cyan;ctx.fillRect(x - 4, y + 6 - fill, 8, fill);
  }
  ctx.fillStyle = options.color || C.lime;ctx.beginPath();ctx.arc(cx, cy, 5, 0, Math.PI * 2);ctx.fill();
  ctx.font = '11px monospace';ctx.textAlign = 'center';ctx.fillStyle = C.muted;
  ctx.fillText(`ω = ${data[row + 1].toFixed(2)} · relative bucket fill`, cx, height - 18);ctx.textAlign = 'start';
  path(ctx, [[cx, cy - radius - 35], [cx, cy - radius - 12]], C.cyan, 2, .7);
}

export function logisticPlot(canvas, values, r, index) {
  const { ctx, width, height } = surface(canvas);
  const size = Math.min(width * .6, height * .67), x0 = (width - size) / 2, y0 = (height + size) / 2;
  const P = (x, y) => [x0 + x * size, y0 - y * size];
  const curve = [];
  for (let i = 0; i <= 200; i++) { const x = i / 200;curve.push(P(x, r * x * (1 - x))); }
  path(ctx, [P(0, 0), P(1, 0), P(1, 1)], C.grid, 1);
  path(ctx, [P(0, 0), P(1, 1)], C.muted, .7, .4);path(ctx, curve, C.lime, 1.6, .75);
  const steps = Math.min(index, values.length - 2), trail = [];
  for (let i = Math.max(0, steps - 100); i <= steps; i++) trail.push(P(values[i], values[i + 1]), P(values[i + 1], values[i + 1]));
  path(ctx, trail, C.coral, .8, .5);
  const [x, y] = P(values[steps], values[steps + 1]);
  ctx.fillStyle = C.coral;ctx.beginPath();ctx.arc(x, y, 4, 0, Math.PI * 2);ctx.fill();
  ctx.fillStyle = C.muted;ctx.font = '11px monospace';ctx.fillText('xₙ', x0 + size + 12, y0);ctx.fillText('xₙ₊₁', x0 - 20, y0 - size - 12);
}

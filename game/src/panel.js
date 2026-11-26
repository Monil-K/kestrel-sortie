// The instrument panel: a canvas-drawn six-pack that is painted onto the cockpit's panel in 3D.
// Static faces (ticks, arcs, placards, bezels) are drawn once into an offscreen layer; only the
// needles, the attitude ball and the heading card are repainted, which keeps it sharp and cheap.

import * as THREE from 'three';
import { clamp } from './random.js';

export const PANEL_W = 2048;
export const PANEL_H = 948;

const C = {
  panel: '#20262a',
  panelDark: '#171c1f',
  bezel: '#2f3639',
  face: '#0c0f11',
  ink: '#e9efe9',
  dim: '#8d9a95',
  green: '#57d68a',
  yellow: '#e8c95a',
  red: '#e2563f',
  white: '#f2f5f0',
  amber: '#f0a63c',
  cyan: '#79e6ff',
};

const GAUGES = {
  asi: { x: 300, y: 300, r: 150 },
  adi: { x: 780, y: 300, r: 150 },
  alt: { x: 1260, y: 300, r: 150 },
  vsi: { x: 1740, y: 300, r: 150 },
  turn: { x: 300, y: 680, r: 150 },
  hsi: { x: 780, y: 680, r: 150 },
  rpm: { x: 1260, y: 680, r: 150 },
  fuel: { x: 1740, y: 680, r: 150 },
};

function polar(cx, cy, r, angle) {
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

// Angle on a 270-degree dial: value v in [min,max] maps from lower-left round to lower-right.
function dialAngle(v, min, max) {
  const t = clamp((v - min) / (max - min), 0, 1);
  return Math.PI * 0.75 + t * Math.PI * 1.5;
}

function bezel(ctx, cx, cy, r) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, '#3a4245');
  g.addColorStop(0.5, '#242a2d');
  g.addColorStop(1, '#141a1c');
  ctx.beginPath();
  ctx.arc(cx, cy, r + 22, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // four screws
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const [sx, sy] = polar(cx, cy, r + 15, a);
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0f1416';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy - 1);
    ctx.lineTo(sx + 4, sy + 1);
    ctx.stroke();
  }
}

function gaugeFace(ctx, cx, cy, r) {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#171d1f');
  g.addColorStop(1, '#050708');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // glass reflection
  const gl = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.5);
  gl.addColorStop(0, 'rgba(255,255,255,0.10)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  gl.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = gl;
  ctx.fill();
}

function label(ctx, text, x, y, size = 20, color = C.dim, weight = 700, spacing = 3) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (spacing) {
    // letter-spaced text, drawn glyph by glyph
    const chars = text.split('');
    const widths = chars.map((ch) => ctx.measureText(ch).width + spacing);
    const total = widths.reduce((a, b) => a + b, 0) - spacing;
    let cx = x - total / 2;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx + widths[i] / 2 - spacing / 2, y);
      cx += widths[i];
    }
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function staticDial(ctx, cx, cy, r, { min, max, major, minor, labelEvery, fmt, arcs = [], nums = true, labelRadius = 0.78 }) {
  ctx.save();
  ctx.translate(cx, cy);
  const a0 = dialAngle(min, min, max);
  const a1 = dialAngle(max, min, max);

  for (let v = min; v <= max + 0.001; v += minor) {
    const a = dialAngle(v, min, max);
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const r1 = r * 0.90;
    const r2 = r * (isMajor ? 0.78 : 0.84);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.strokeStyle = isMajor ? C.white : 'rgba(233,239,233,0.6)';
    ctx.lineWidth = isMajor ? 3.4 : 1.6;
    ctx.stroke();
    if (isMajor && nums && labelEvery && Math.abs(v % labelEvery) < 1e-6) {
      const [lx, ly] = polar(0, 0, r * labelRadius, a);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.fillStyle = C.ink;
      ctx.font = '700 26px "Helvetica Neue", Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmt(v), 0, 0);
      ctx.restore();
    }
  }

  for (const arc of arcs) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, dialAngle(arc.from, min, max), dialAngle(arc.to, min, max));
    ctx.strokeStyle = arc.color;
    ctx.lineWidth = arc.width ?? 7;
    ctx.stroke();
  }
  ctx.restore();
}

function drawAsiStatic(ctx) {
  const { x, y, r } = GAUGES.asi;
  bezel(ctx, x, y, r);
  gaugeFace(ctx, x, y, r);
  staticDial(ctx, x, y, r, {
    min: 40, max: 340, major: 20, minor: 10, labelEvery: 40, labelRadius: 0.76,
    fmt: (v) => String(v),
    arcs: [
      { from: 62, to: 108, color: 'rgba(242,245,240,0.85)', width: 8 },
      { from: 90, to: 258, color: C.green, width: 7 },
      { from: 258, to: 326, color: C.yellow, width: 7 },
    ],
  });
  ctx.save();
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 5;
  const a = dialAngle(326, 40, 340);
  ctx.beginPath();
  ctx.moveTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
  ctx.lineTo(Math.cos(a) * r * 0.80, Math.sin(a) * r * 0.80);
  ctx.stroke();
  ctx.restore();
  label(ctx, 'AIRSPEED', x, y + r + 54, 22, C.dim);
  label(ctx, 'KNOTS', x, y + r + 80, 15, 'rgba(141,154,149,0.7)', 600, 4);
}

function drawAltStatic(ctx) {
  const { x, y, r } = GAUGES.alt;
  bezel(ctx, x, y, r);
  gaugeFace(ctx, x, y, r);
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 50; i++) {
    const a = Math.PI * 0.75 + (i / 50) * Math.PI * 1.5;
    const major = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    ctx.lineTo(Math.cos(a) * r * (major ? 0.78 : 0.84), Math.sin(a) * r * (major ? 0.78 : 0.84));
    ctx.strokeStyle = major ? C.white : 'rgba(233,239,233,0.55)';
    ctx.lineWidth = major ? 3.4 : 1.6;
    ctx.stroke();
    if (major) {
      const [lx, ly] = polar(0, 0, r * 0.68, a);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.fillStyle = C.ink;
      ctx.font = '700 24px "Helvetica Neue", Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i / 5), 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
  label(ctx, 'ALTITUDE', x, y + r + 54, 22, C.dim);
  label(ctx, 'FEET', x, y + r + 80, 15, 'rgba(141,154,149,0.7)', 600, 4);
}

function drawVsiStatic(ctx) {
  const { x, y, r } = GAUGES.vsi;
  bezel(ctx, x, y, r);
  gaugeFace(ctx, x, y, r);
  staticDial(ctx, x, y, r, {
    min: -2000, max: 2000, major: 500, minor: 250, labelEvery: 1000, labelRadius: 0.74,
    fmt: (v) => String(v / 1000),
    arcs: [{ from: -2000, to: 2000, color: 'rgba(233,239,233,0.35)', width: 3 }],
  });
  label(ctx, 'VERTICAL SPEED', x, y + r + 54, 20, C.dim);
  label(ctx, '100 FT / MIN', x, y + r + 80, 15, 'rgba(141,154,149,0.7)', 600, 4);
}

function drawRpmStatic(ctx) {
  const { x, y, r } = GAUGES.rpm;
  bezel(ctx, x, y, r);
  gaugeFace(ctx, x, y, r);
  staticDial(ctx, x, y, r, {
    min: 0, max: 110, major: 10, minor: 5, labelEvery: 20, labelRadius: 0.74,
    fmt: (v) => String(v),
    arcs: [
      { from: 55, to: 100, color: C.green, width: 7 },
      { from: 100, to: 108, color: C.red, width: 7 },
    ],
  });
  label(ctx, 'ENGINE % RPM', x, y + r + 54, 20, C.dim);
}

function drawFuelStatic(ctx) {
  const { x, y, r } = GAUGES.fuel;
  bezel(ctx, x, y, r);
  gaugeFace(ctx, x, y, r);
  staticDial(ctx, x, y, r, {
    min: 0, max: 100, major: 10, minor: 5, labelEvery: 25, labelRadius: 0.72, nums: true,
    fmt: (v) => String(v),
    arcs: [{ from: 18, to: 100, color: C.green, width: 7 }],
  });
  ctx.save();
  ctx.fillStyle = C.red;
  ctx.font = '700 22px "Helvetica Neue", Arial';
  ctx.textAlign = 'center';
  ctx.fillText('E', x - r * 0.62, y + r * 0.62);
  ctx.fillText('F', x + r * 0.62, y + r * 0.62);
  ctx.restore();
  label(ctx, 'FUEL %', x, y + r + 54, 20, C.dim);
}

function drawTurnStatic(ctx) {
  const { x, y, r } = GAUGES.turn;
  bezel(ctx, x, y, r);
  gaugeFace(ctx, x, y, r);
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(233,239,233,0.5)';
  ctx.lineWidth = 2.5;
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    ctx.beginPath();
    ctx.moveTo(i * r * 0.42, -r * 0.34);
    ctx.lineTo(i * r * 0.30, -r * 0.22);
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, 'TURN COORDINATOR', x, y + r + 54, 18, C.dim);
}

function drawHsiStatic(ctx) {
  const { x, y, r } = GAUGES.hsi;
  bezel(ctx, x, y, r);
  gaugeFace(ctx, x, y, r);
  label(ctx, 'HEADING / BEARING', x, y + r + 54, 18, C.dim);
}

function drawPanelBase(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, PANEL_H);
  g.addColorStop(0, '#262d31');
  g.addColorStop(0.5, '#1c2225');
  g.addColorStop(1, '#14191b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PANEL_W, PANEL_H);

  // subtle crinkle finish
  for (let i = 0; i < 12000; i++) {
    const v = 20 + Math.random() * 30;
    ctx.fillStyle = `rgba(${v},${v + 3},${v + 3},0.4)`;
    ctx.fillRect(Math.random() * PANEL_W, Math.random() * PANEL_H, 1.6, 1.6);
  }

  // annunciator strip
  const stripX = 120;
  const stripW = PANEL_W - 240;
  const cells = ['MASTER CAUTION', 'STALL', 'GEAR', 'FUEL LOW', 'OVERSPEED', 'DAMAGE', 'BRAKES'];
  const cw = stripW / cells.length;
  ctx.save();
  for (let i = 0; i < cells.length; i++) {
    const cx = stripX + i * cw;
    ctx.fillStyle = '#101416';
    ctx.fillRect(cx + 6, 26, cw - 12, 74);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 6, 26, cw - 12, 74);
    ctx.fillStyle = 'rgba(233,239,233,0.35)';
    ctx.font = '700 22px "Helvetica Neue", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cells[i], cx + cw / 2, 63);
  }
  ctx.restore();

  drawAsiStatic(ctx);
  drawAltStatic(ctx);
  drawVsiStatic(ctx);
  drawRpmStatic(ctx);
  drawFuelStatic(ctx);
  drawTurnStatic(ctx);
  drawHsiStatic(ctx);

  // ADI bezel + fixed bank scale is redrawn every frame inside the circle, so only the bezel here
  bezel(ctx, GAUGES.adi.x, GAUGES.adi.y, GAUGES.adi.r);
  label(ctx, 'ATTITUDE', GAUGES.adi.x, GAUGES.adi.y + GAUGES.adi.r + 54, 20, C.dim);

  // bottom cluster: gear lamps, flap indicator, AoA indexer, G-meter
  ctx.save();
  const by = 858;
  // gear lamps
  const gearX = 210;
  label(ctx, 'GEAR', gearX, by + 78, 17, C.dim, 700, 3);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(gearX + (i - 1) * 44, by + 20, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0e0f';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // flap indicator
  label(ctx, 'FLAPS', 470, by + 78, 17, C.dim, 700, 3);
  ctx.beginPath();
  ctx.arc(470, by + 18, 34, Math.PI * 0.85, Math.PI * 2.15);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ['UP', '10', '20', 'FULL'].forEach((t, i) => {
    const a = Math.PI * 0.85 + (i / 3) * Math.PI * 1.3;
    ctx.fillStyle = C.dim;
    ctx.font = '700 14px "Helvetica Neue", Arial';
    ctx.textAlign = 'center';
    ctx.fillText(t, 470 + Math.cos(a) * 52, by + 18 + Math.sin(a) * 52);
  });

  // AoA indexer
  label(ctx, 'AOA', 700, by + 78, 17, C.dim, 700, 3);
  const aoaColors = [C.green, C.amber, C.red];
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(700 + (i - 1) * 46, by + 20, 17, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0e0f';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // G-meter
  label(ctx, 'G', 960, by + 78, 17, C.dim, 700, 3);
  ctx.beginPath();
  ctx.arc(960, by + 24, 40, Math.PI * 0.85, Math.PI * 2.15);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = C.dim;
  ctx.font = '700 14px "Helvetica Neue", Arial';
  ctx.textAlign = 'center';
  [-3, 0, 3, 6, 9].forEach((v, i) => {
    const a = Math.PI * 0.85 + ((v + 3) / 12) * Math.PI * 1.3;
    ctx.fillText(String(v), 960 + Math.cos(a) * 58, by + 24 + Math.sin(a) * 58);
  });

  // placards
  label(ctx, 'KESTREL KV-07  ·  TURBOPROP STRIKE', 1440, by + 22, 19, 'rgba(233,239,233,0.4)', 700, 3);
  label(ctx, 'NO SMOKING  ·  OXYGEN ON  ·  CHECK FUEL', 1440, by + 56, 15, 'rgba(233,239,233,0.25)', 600, 2);

  // panel edge screws
  for (const [sx, sy] of [[40, 40], [PANEL_W - 40, 40], [40, PANEL_H - 40], [PANEL_W - 40, PANEL_H - 40]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1112';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function needle(ctx, cx, cy, angle, len, { width = 6, color = C.white, tail = 0.16, shadow = true } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle + Math.PI / 2);
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(3, -len - tail * len + 4, width, len * (1 + tail));
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-width / 2, tail * len);
  ctx.lineTo(-width / 2.6, -len * 0.86);
  ctx.lineTo(0, -len);
  ctx.lineTo(width / 2.6, -len * 0.86);
  ctx.lineTo(width / 2, tail * len);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, width * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#d9dfda';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, width * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = '#20262a';
  ctx.fill();
  ctx.restore();
}

function drawAdi(ctx, d) {
  const { x, y, r } = GAUGES.adi;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const pxPerDeg = r / 26;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-d.bank * Math.PI) / 180);
  const shift = clamp(d.pitch, -40, 40) * pxPerDeg;
  // sky and ground
  const sky = ctx.createLinearGradient(0, -r * 2, 0, 0);
  sky.addColorStop(0, '#0b4e78');
  sky.addColorStop(1, '#4d9fc4');
  ctx.fillStyle = sky;
  ctx.fillRect(-r * 2, -r * 3 + shift, r * 4, r * 3);
  const ground = ctx.createLinearGradient(0, 0, 0, r * 2);
  ground.addColorStop(0, '#7d5734');
  ground.addColorStop(1, '#3c2917');
  ctx.fillStyle = ground;
  ctx.fillRect(-r * 2, shift, r * 4, r * 3);
  // horizon
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-r * 2, shift);
  ctx.lineTo(r * 2, shift);
  ctx.stroke();

  // pitch ladder
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2.4;
  ctx.font = '700 18px "Helvetica Neue", Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let p = -30; p <= 30; p += 5) {
    if (p === 0) continue;
    const yy = shift - p * pxPerDeg;
    const half = p % 10 === 0 ? r * 0.52 : r * 0.26;
    ctx.beginPath();
    ctx.moveTo(-half, yy);
    ctx.lineTo(-half * 0.35, yy);
    ctx.moveTo(half * 0.35, yy);
    ctx.lineTo(half, yy);
    ctx.stroke();
    if (p % 10 === 0) {
      ctx.fillText(String(Math.abs(p)), -half - 16, yy);
      ctx.fillText(String(Math.abs(p)), half + 16, yy);
    }
  }
  ctx.restore();

  // bank scale, fixed
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2.5;
  for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = -Math.PI / 2 + (b * Math.PI) / 180;
    const len = b === 0 ? 18 : Math.abs(b) % 30 === 0 ? 14 : 8;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6));
    ctx.lineTo(x + Math.cos(a) * (r - 6 - len), y + Math.sin(a) * (r - 6 - len));
    ctx.stroke();
  }
  // bank pointer
  const ba = -Math.PI / 2 + (clamp(d.bank, -70, 70) * Math.PI) / 180;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(ba) * (r - 26), y + Math.sin(ba) * (r - 26));
  ctx.lineTo(x + Math.cos(ba + 0.05) * (r - 46), y + Math.sin(ba + 0.05) * (r - 46));
  ctx.lineTo(x + Math.cos(ba - 0.05) * (r - 46), y + Math.sin(ba - 0.05) * (r - 46));
  ctx.closePath();
  ctx.fillStyle = C.amber;
  ctx.fill();

  // fixed aircraft symbol
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.42, y);
  ctx.lineTo(x - r * 0.14, y);
  ctx.lineTo(x - r * 0.07, y + 10);
  ctx.moveTo(x + r * 0.42, y);
  ctx.lineTo(x + r * 0.14, y);
  ctx.lineTo(x + r * 0.07, y + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = C.amber;
  ctx.fill();

  // slip ball
  ctx.beginPath();
  ctx.arc(x, y + r * 0.74, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  const ballX = x + clamp(d.beta * 3, -1, 1) * r * 0.16;
  ctx.beginPath();
  ctx.arc(ballX, y + r * 0.74, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#f2f5f0';
  ctx.fill();
  ctx.restore();

  // glass
  const gl = ctx.createLinearGradient(x - r, y - r, x + r * 0.3, y + r * 0.6);
  gl.addColorStop(0, 'rgba(255,255,255,0.12)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0.01)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = gl;
  ctx.fill();
  ctx.restore();
}

function drawHsi(ctx, d) {
  const { x, y, r } = GAUGES.hsi;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-d.heading * Math.PI) / 180);
  // rotating card
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180 - Math.PI / 2;
    const major = deg % 30 === 0;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
    ctx.lineTo(Math.cos(a) * r * (major ? 0.76 : 0.86), Math.sin(a) * r * (major ? 0.76 : 0.86));
    ctx.strokeStyle = major ? C.white : 'rgba(233,239,233,0.5)';
    ctx.lineWidth = major ? 4 : 2;
    ctx.stroke();
    if (major) {
      const lbl = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10);
      ctx.save();
      ctx.translate(Math.cos(a) * r * 0.61, Math.sin(a) * r * 0.61);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.fillStyle = deg === 0 ? C.green : C.ink;
      ctx.font = '700 28px "Helvetica Neue", Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    }
  }
  // course/bearing pointer to the active target
  if (d.bearing !== null && d.bearing !== undefined) {
    ctx.save();
    ctx.rotate((d.bearing * Math.PI) / 180);
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.2);
    ctx.lineTo(0, r * 0.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.86);
    ctx.lineTo(-12, -r * 0.68);
    ctx.lineTo(12, -r * 0.68);
    ctx.closePath();
    ctx.fillStyle = C.amber;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // fixed lubber line and aircraft symbol
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.98);
  ctx.lineTo(x, y - r * 0.82);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y);
  ctx.lineTo(x, y + r * 0.12);
  ctx.lineTo(x + r * 0.2, y);
  ctx.stroke();

  // digital heading
  ctx.fillStyle = C.ink;
  ctx.font = '700 30px "Helvetica Neue", Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(d.heading) % 360).padStart(3, '0') + '°', x, y + r * 0.52);
  if (d.targetDist !== null && d.targetDist !== undefined) {
    ctx.fillStyle = C.amber;
    ctx.font = '700 20px "Helvetica Neue", Arial';
    ctx.fillText(`${(d.targetDist / 1852).toFixed(1)} NM`, x, y + r * 0.74);
  }
  ctx.restore();

  ctx.save();
  const gl = ctx.createLinearGradient(x - r, y - r, x + r * 0.3, y + r * 0.6);
  gl.addColorStop(0, 'rgba(255,255,255,0.10)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0.01)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = gl;
  ctx.fill();
  ctx.restore();
}

function drawTurn(ctx, d) {
  const { x, y, r } = GAUGES.turn;
  ctx.save();
  ctx.translate(x, y);
  // little aircraft, banked by the turn rate
  ctx.rotate(clamp(d.turnRate * 1.6, -2.4, 2.4) * 0.25);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.38);
  ctx.lineTo(0, r * 0.3);
  ctx.moveTo(-r * 0.34, r * 0.06);
  ctx.lineTo(r * 0.34, r * 0.06);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.38);
  ctx.lineTo(-8, -r * 0.26);
  ctx.lineTo(8, -r * 0.26);
  ctx.closePath();
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();

  // inclinometer ball
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y + r * 0.62, r * 0.3, Math.PI * 0.08, Math.PI * 0.92);
  ctx.strokeStyle = 'rgba(233,239,233,0.35)';
  ctx.lineWidth = 16;
  ctx.stroke();
  const bx = x + clamp(-d.beta * 3, -1, 1) * r * 0.2;
  ctx.beginPath();
  ctx.arc(bx, y + r * 0.62, 9, 0, Math.PI * 2);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();
}

function drawGauges(ctx, d) {
  // airspeed
  needle(ctx, GAUGES.asi.x, GAUGES.asi.y, dialAngle(clamp(d.knots, 40, 340), 40, 340), GAUGES.asi.r * 0.84);
  needle(ctx, GAUGES.alt.x, GAUGES.alt.y, dialAngle(((d.altFt % 1000) / 1000) * 360, 0, 360), GAUGES.alt.r * 0.62, { width: 10, color: '#e9efe9' });
  needle(ctx, GAUGES.alt.x, GAUGES.alt.y, dialAngle(((d.altFt % 10000) / 10000) * 360, 0, 360), GAUGES.alt.r * 0.86, { width: 5 });
  needle(ctx, GAUGES.alt.x, GAUGES.alt.y, dialAngle(((d.altFt % 100000) / 100000) * 360, 0, 360), GAUGES.alt.r * 0.4, { width: 12, color: 'rgba(233,239,233,0.75)', tail: 0.05 });
  // altimeter digital window
  ctx.save();
  ctx.fillStyle = '#0a0d0e';
  ctx.fillRect(GAUGES.alt.x - 46, GAUGES.alt.y + GAUGES.alt.r * 0.44, 92, 34);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(GAUGES.alt.x - 46, GAUGES.alt.y + GAUGES.alt.r * 0.44, 92, 34);
  ctx.fillStyle = C.ink;
  ctx.font = '700 24px "Helvetica Neue", Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(d.altFt)).padStart(5, '0'), GAUGES.alt.x, GAUGES.alt.y + GAUGES.alt.r * 0.44 + 18);
  ctx.restore();

  needle(ctx, GAUGES.vsi.x, GAUGES.vsi.y, dialAngle(clamp(d.vsFpm, -2000, 2000), -2000, 2000), GAUGES.vsi.r * 0.84, { width: 7 });
  needle(ctx, GAUGES.rpm.x, GAUGES.rpm.y, dialAngle(clamp(d.rpm, 0, 110), 0, 110), GAUGES.rpm.r * 0.82, { width: 8, color: '#f2f5f0' });
  needle(ctx, GAUGES.fuel.x, GAUGES.fuel.y, dialAngle(clamp(d.fuel * 100, 0, 100), 0, 100), GAUGES.fuel.r * 0.82, { width: 8, color: '#f2f5f0' });
  // fuel digital
  ctx.save();
  ctx.fillStyle = C.ink;
  ctx.font = '700 22px "Helvetica Neue", Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(d.fuel * 100)}%`, GAUGES.fuel.x, GAUGES.fuel.y + GAUGES.fuel.r * 0.42);
  ctx.restore();

  drawAdi(ctx, d);
  drawHsi(ctx, d);
  drawTurn(ctx, d);

  // annunciator lamps
  const stripX = 120;
  const stripW = PANEL_W - 240;
  const cells = ['MASTER CAUTION', 'STALL', 'GEAR', 'FUEL LOW', 'OVERSPEED', 'DAMAGE', 'BRAKES'];
  const cw = stripW / cells.length;
  const lit = [
    d.stalled || d.fuelLow || d.overspeed || d.gearTransit,
    d.stalled,
    d.gearTransit ? 'amber' : d.gearT < 0.9 ? 'red' : null,
    d.fuelLow,
    d.overspeed,
    d.damage > 0.01,
    d.brakes,
  ];
  for (let i = 0; i < cells.length; i++) {
    const on = lit[i];
    if (!on) continue;
    const cx = stripX + i * cw + cw / 2;
    const color = on === 'red' ? C.red : on === 'amber' ? C.amber : i === 1 ? C.red : C.amber;
    ctx.save();
    ctx.globalAlpha = 0.32 + 0.18 * Math.sin(d.clock * 6 + i);
    ctx.fillStyle = color;
    ctx.fillRect(stripX + i * cw + 8, 28, cw - 16, 70);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#10100c';
    ctx.font = '700 22px "Helvetica Neue", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cells[i], cx, 63);
    ctx.restore();
  }

  // gear lamps
  const by = 858;
  for (let i = 0; i < 3; i++) {
    const gx = 210 + (i - 1) * 44;
    let color = 'rgba(255,255,255,0.06)';
    if (d.gearT > 0.95) color = C.green;
    else if (d.gearT > 0.04) color = C.red;
    ctx.beginPath();
    ctx.arc(gx, by + 20, 13, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  // flap needle
  const flapA = Math.PI * 0.85 + d.flapT * Math.PI * 1.3;
  ctx.save();
  ctx.translate(470, by + 18);
  ctx.rotate(flapA);
  ctx.fillStyle = C.ink;
  ctx.fillRect(-3, -30, 6, 30);
  ctx.restore();
  // AoA lamps
  const aoaColors = [C.green, C.amber, C.red];
  const aoaStage = d.aoa > 15 ? 2 : d.aoa > 11 ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(700 + (i - 1) * 46, by + 20, 15, 0, Math.PI * 2);
    ctx.fillStyle = i === aoaStage ? aoaColors[i] : 'rgba(255,255,255,0.05)';
    ctx.fill();
  }
  // G needle
  const gA = Math.PI * 0.85 + (clamp(d.gLoad, -3, 9) + 3) / 12 * Math.PI * 1.3;
  ctx.save();
  ctx.translate(960, by + 24);
  ctx.rotate(gA);
  ctx.fillStyle = C.ink;
  ctx.fillRect(-2.5, -34, 5, 34);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = C.ink;
  ctx.font = '700 20px "Helvetica Neue", Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${d.gLoad.toFixed(1)}`, 960, by + 92);
  ctx.restore();
}

export function createPanel() {
  const canvas = document.createElement('canvas');
  canvas.width = PANEL_W;
  canvas.height = PANEL_H;
  const ctx = canvas.getContext('2d');

  const base = document.createElement('canvas');
  base.width = PANEL_W;
  base.height = PANEL_H;
  drawPanelBase(base.getContext('2d'));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  // seed the panel with a neutral pose so the very first frame is not blank
  ctx.drawImage(base, 0, 0);
  drawGauges(ctx, {
    knots: 0, altFt: 0, vsFpm: 0, heading: 0, pitch: 0, bank: 0, rpm: 25, fuel: 0.86,
    gLoad: 1, aoa: 0, beta: 0, gearT: 1, gearTransit: false, flapT: 0, turnRate: 0,
    stalled: false, fuelLow: false, overspeed: false, damage: 0, brakes: false,
    bearing: 0, targetDist: 0, clock: 0,
  });
  texture.needsUpdate = true;

  return {
    canvas,
    texture,
    update(d) {
      ctx.drawImage(base, 0, 0);
      drawGauges(ctx, d);
      texture.needsUpdate = true;
    },
  };
}

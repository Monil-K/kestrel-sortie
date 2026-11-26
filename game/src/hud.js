// Head-up display: tapes, pitch ladder, flight-path marker, target caret and warnings, drawn on a
// 2D canvas over the 3D scene. Everything is green-on-dark, thin, and readable at a glance.

import * as THREE from 'three';
import { COLORS } from './config.js';

const KT = 1.94384;
const FT = 3.28084;
const FPM = 196.85;

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.resize();
    this._v = new THREE.Vector3();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
  }

  _glow(color, blur = 8) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }

  _screen(v, camera) {
    const p = this._v.copy(v).project(camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.w,
      y: (-p.y * 0.5 + 0.5) * this.h,
      behind: p.z > 1,
    };
  }

  draw(s) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!s.ac) return;

    const ac = s.ac;
    const kt = ac.airspeed * KT;
    const altFt = ac.altitude * FT;
    const vsFpm = ac.vspeed * FPM;
    const cx = this.w / 2;
    const cy = this.h * (s.view === 'cockpit' ? 0.44 : 0.5);

    ctx.lineCap = 'round';
    ctx.font = '600 13px "SF Mono", "JetBrains Mono", Consolas, monospace';

    this._drawLadder(ac, cx, cy, s.view);
    this._drawTapes(kt, altFt, vsFpm, ac, cx, cy);
    this._drawHeading(ac, cx, s.view);
    if (s.target) this._drawTarget(s.target, ac, s.camera, cx, cy);
    this._drawStatus(ac, kt, s);
    if (s.mission) this._drawMissionCard(s.mission);
    this._drawWarnings(ac, s, cx, cy);
    if (s.message) this._drawMessage(s.message, cx, cy);
  }

  _drawLadder(ac, cx, cy, view) {
    if (view === 'flyby') return;
    const ctx = this.ctx;
    const pxPerDeg = Math.min(10, this.h / 90);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-ac.bank * Math.PI) / 180);
    this._glow(COLORS.hud, 6);
    ctx.lineWidth = 1.6;
    // in the cockpit the panel starts just over half way down the screen: keep the ladder above it
    const bottomLimit = view === 'cockpit' ? this.h * 0.52 - cy : this.h * 0.42;
    for (let p = -40; p <= 40; p += 5) {
      const y = -(p - ac.pitch) * pxPerDeg * -1;
      const yy = -y;
      if (Math.abs(yy) > this.h * 0.42 || yy > bottomLimit) continue;
      const half = p === 0 ? 190 : p % 10 === 0 ? 92 : 46;
      ctx.globalAlpha = p === 0 ? 0.55 : 0.75;
      ctx.beginPath();
      ctx.moveTo(-half, yy);
      ctx.lineTo(-half * 0.42, yy);
      ctx.moveTo(half * 0.42, yy);
      ctx.lineTo(half, yy);
      if (p < 0) {
        // dashed for nose-down half of the ladder
        ctx.setLineDash([7, 6]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (p !== 0 && p % 10 === 0) {
        ctx.globalAlpha = 0.8;
        ctx.font = '600 12px "SF Mono", Consolas, monospace';
        ctx.fillText(String(Math.abs(p)), -half - 26, yy + 4);
        ctx.fillText(String(Math.abs(p)), half + 12, yy + 4);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // boresight cross and gun pipper
    ctx.save();
    ctx.translate(cx, cy);
    this._glow(COLORS.hud, 10);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 0); ctx.lineTo(-5, 0);
    ctx.moveTo(13, 0); ctx.lineTo(5, 0);
    ctx.moveTo(0, -13); ctx.lineTo(0, -5);
    ctx.moveTo(0, 13); ctx.lineTo(0, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawTapes(kt, altFt, vsFpm, ac, cx, cy) {
    const ctx = this.ctx;
    const h = this.h;
    const leftX = Math.max(64, this.w * 0.075);
    const rightX = this.w - leftX;
    const tapeH = Math.min(330, h * 0.42);

    // ---- airspeed tape
    ctx.save();
    this._glow(COLORS.hud, 5);
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(leftX + 22, cy - tapeH / 2);
    ctx.lineTo(leftX + 22, cy + tapeH / 2);
    ctx.stroke();
    const pxPerKt = 4.4;
    const startKt = Math.floor((kt - tapeH / 2 / pxPerKt) / 10) * 10;
    for (let v = startKt; v <= kt + tapeH / 2 / pxPerKt; v += 10) {
      if (v < 0) continue;
      const y = cy + (kt - v) * pxPerKt;
      if (y < cy - tapeH / 2 || y > cy + tapeH / 2) continue;
      const major = v % 50 === 0;
      ctx.globalAlpha = major ? 0.95 : 0.5;
      ctx.beginPath();
      ctx.moveTo(leftX + 22, y);
      ctx.lineTo(leftX + (major ? 2 : 12), y);
      ctx.stroke();
      if (major) {
        ctx.font = '600 13px "SF Mono", Consolas, monospace';
        ctx.globalAlpha = 0.85;
        ctx.fillText(String(v), leftX - 30, y + 4);
      }
    }
    // boxed current value
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(leftX + 22, cy - 16);
    ctx.lineTo(leftX + 60, cy - 22);
    ctx.lineTo(leftX + 74, cy - 14);
    ctx.lineTo(leftX + 74, cy + 14);
    ctx.lineTo(leftX + 60, cy + 22);
    ctx.lineTo(leftX + 22, cy + 16);
    ctx.closePath();
    ctx.fillStyle = 'rgba(4, 22, 20, 0.55)';
    ctx.fill();
    ctx.stroke();
    ctx.font = '700 20px "SF Mono", Consolas, monospace';
    ctx.fillText(String(Math.round(kt)).padStart(3, '0'), leftX + 30, cy + 7);
    // stall / flap arcs
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const stallY = cy + (kt - 92) * pxPerKt;
    const vneY = cy + (kt - 326) * pxPerKt;
    if (stallY < cy + tapeH / 2 && vneY > cy - tapeH / 2) {
      ctx.strokeStyle = '#ffbe5c';
      ctx.beginPath();
      ctx.moveTo(leftX + 68, Math.max(vneY, cy - tapeH / 2));
      ctx.lineTo(leftX + 68, Math.min(stallY, cy + tapeH / 2));
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.hud;
    ctx.font = '600 10px "SF Mono", monospace';
    ctx.globalAlpha = 0.6;
    ctx.fillText('KT', leftX + 26, cy + tapeH / 2 + 18);
    ctx.restore();

    // ---- altitude tape
    ctx.save();
    this._glow(COLORS.hud, 5);
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(rightX - 22, cy - tapeH / 2);
    ctx.lineTo(rightX - 22, cy + tapeH / 2);
    ctx.stroke();
    const pxPerFt = 0.42;
    const startFt = Math.floor((altFt - tapeH / 2 / pxPerFt) / 200) * 200;
    for (let v = startFt; v <= altFt + tapeH / 2 / pxPerFt; v += 200) {
      const y = cy + (altFt - v) * pxPerFt;
      if (y < cy - tapeH / 2 || y > cy + tapeH / 2) continue;
      const major = v % 1000 === 0;
      ctx.globalAlpha = major ? 0.95 : 0.5;
      ctx.beginPath();
      ctx.moveTo(rightX - 22, y);
      ctx.lineTo(rightX - (major ? 2 : 12), y);
      ctx.stroke();
      if (major) {
        ctx.font = '600 13px "SF Mono", Consolas, monospace';
        ctx.globalAlpha = 0.85;
        ctx.fillText(String(Math.max(0, v)), rightX + 4, y + 4);
      }
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(rightX - 22, cy - 16);
    ctx.lineTo(rightX - 60, cy - 22);
    ctx.lineTo(rightX - 74, cy - 14);
    ctx.lineTo(rightX - 74, cy + 14);
    ctx.lineTo(rightX - 60, cy + 22);
    ctx.lineTo(rightX - 22, cy + 16);
    ctx.closePath();
    ctx.fillStyle = 'rgba(4, 22, 20, 0.55)';
    ctx.fill();
    ctx.stroke();
    ctx.font = '700 20px "SF Mono", Consolas, monospace';
    ctx.fillText(String(Math.round(altFt)), rightX - 68, cy + 7);
    // vertical speed needle
    const vsClamped = Math.max(-2000, Math.min(2000, vsFpm));
    const vy = cy - (vsClamped / 2000) * (tapeH / 2);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(rightX - 78, vy);
    ctx.lineTo(rightX - 90, vy);
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    ctx.font = '600 11px "SF Mono", monospace';
    ctx.fillText(`${Math.round(vsFpm / 10) * 10}`, rightX - 132, vy + 4);
    ctx.fillStyle = COLORS.hud;
    ctx.globalAlpha = 0.6;
    ctx.font = '600 10px "SF Mono", monospace';
    ctx.fillText('FT', rightX - 34, cy + tapeH / 2 + 18);
    ctx.restore();

    // radar altitude
    ctx.save();
    this._glow(COLORS.hud, 4);
    ctx.globalAlpha = ac.agl < 120 ? 0.95 : 0.35;
    ctx.font = '600 12px "SF Mono", Consolas, monospace';
    ctx.fillText(`AGL ${Math.round(Math.max(0, ac.agl) * FT)}`, rightX - 86, cy + tapeH / 2 + 40);
    ctx.restore();
  }

  _drawHeading(ac, cx, view) {
    const ctx = this.ctx;
    if (view === 'flyby') return;
    const y = Math.max(46, this.h * 0.075);
    const halfW = Math.min(260, this.w * 0.22);
    ctx.save();
    this._glow(COLORS.hud, 5);
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, y);
    ctx.lineTo(cx + halfW, y);
    ctx.stroke();
    const pxPerDeg = halfW / 42;
    const start = Math.floor((ac.heading - 42) / 5) * 5;
    for (let d = start; d <= ac.heading + 42; d += 5) {
      const x = cx + (d - ac.heading) * pxPerDeg;
      if (Math.abs(x - cx) > halfW) continue;
      const major = ((d % 30) + 360) % 30 === 0;
      ctx.globalAlpha = major ? 0.95 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + (major ? 12 : 6));
      ctx.stroke();
      if (major) {
        const hdg = ((d % 360) + 360) % 360;
        const txt = hdg === 0 ? 'N' : hdg === 90 ? 'E' : hdg === 180 ? 'S' : hdg === 270 ? 'W' : String(hdg / 10).padStart(2, '0');
        ctx.globalAlpha = 0.85;
        ctx.font = '600 12px "SF Mono", Consolas, monospace';
        ctx.fillText(txt, x, y - 8);
      }
    }
    // caret
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(cx, y + 16);
    ctx.lineTo(cx - 6, y + 26);
    ctx.lineTo(cx + 6, y + 26);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 18px "SF Mono", Consolas, monospace';
    ctx.fillText(String(Math.round(ac.heading) % 360).padStart(3, '0'), cx, y + 50);
    ctx.restore();
  }

  _drawTarget(target, ac, camera, cx, cy) {
    const ctx = this.ctx;
    const p = this._screen(target.pos, camera);
    let x = p.x;
    let y = p.y;
    const off = p.behind || x < 40 || x > this.w - 40 || y < 40 || y > this.h - 40;
    if (off) {
      const dx = x - cx;
      const dy = y - cy;
      const ang = Math.atan2(dy, dx);
      const rad = Math.min(this.w, this.h) * 0.34;
      x = cx + Math.cos(ang) * rad;
      y = cy + Math.sin(ang) * rad;
    }
    ctx.save();
    this._glow(COLORS.amber, 10);
    ctx.strokeStyle = COLORS.amber;
    ctx.fillStyle = COLORS.amber;
    ctx.lineWidth = 2;
    if (target.kind === 'gate') {
      const r = 20;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
        ctx.lineTo(x + Math.cos(a) * (r + 13), y + Math.sin(a) * (r + 13));
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x + 16, y);
      ctx.lineTo(x, y + 16);
      ctx.lineTo(x - 16, y);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '600 12px "SF Mono", Consolas, monospace';
    ctx.fillText(target.label, x + 30, y - 6);
    ctx.fillText(`${(target.dist / 1852).toFixed(1)} NM`, x + 30, y + 12);
    if (off) {
      // an arrow back toward the target
      const ang = Math.atan2(y - cy, x - cx);
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * 26, y - Math.sin(ang) * 26);
      ctx.lineTo(x - Math.cos(ang + 0.4) * 42, y - Math.sin(ang + 0.4) * 42);
      ctx.lineTo(x - Math.cos(ang - 0.4) * 42, y - Math.sin(ang - 0.4) * 42);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawStatus(ac, kt, s) {
    const ctx = this.ctx;
    const x = Math.max(26, this.w * 0.035);
    const y = this.h - 112;
    ctx.save();
    this._glow(COLORS.hud, 4);
    ctx.font = '600 12px "SF Mono", Consolas, monospace';
    ctx.globalAlpha = 0.8;
    const lines = [
      `THR ${String(Math.round(s.throttle * 100)).padStart(3, ' ')}%`,
      `RPM ${String(Math.round(ac.rpm * 100)).padStart(3, ' ')}%`,
      `FUEL ${String(Math.round(ac.fuel * 100)).padStart(3, ' ')}%`,
      `G ${ac.gLoad.toFixed(1)}   AOA ${(ac.alpha * 57.3).toFixed(0)}°`,
      `GEAR ${ac.gearT > 0.95 ? 'DOWN' : ac.gearT < 0.05 ? 'UP' : 'MOVE'}  FLAP ${Math.round(ac.flapT * 3)}`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * 19));
    ctx.restore();

    // view badge and camera hint
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = '600 11px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(s.viewName ?? '', this.w - x, this.h - 32);
    ctx.restore();
  }

  _drawMissionCard(m) {
    const ctx = this.ctx;
    const x = Math.max(196, this.w * 0.16);
    const y = Math.max(26, this.h * 0.05);
    ctx.save();
    ctx.fillStyle = 'rgba(2, 18, 18, 0.38)';
    ctx.beginPath();
    ctx.roundRect(x - 12, y - 6, 250, 132, 8);
    ctx.fill();
    this._glow(COLORS.hud, 5);
    ctx.globalAlpha = 0.95;
    ctx.font = '700 13px "SF Mono", Consolas, monospace';
    ctx.fillText(m.name.toUpperCase(), x, y + 14);
    ctx.globalAlpha = 0.55;
    ctx.font = '600 11px "SF Mono", Consolas, monospace';
    ctx.fillText(m.objective || '', x, y + 32);
    ctx.globalAlpha = 0.9;
    ctx.font = '700 26px "SF Mono", Consolas, monospace';
    ctx.fillText(m.time, x, y + 68);
    ctx.globalAlpha = 0.7;
    ctx.font = '600 12px "SF Mono", Consolas, monospace';
    ctx.fillText(`SCORE ${m.score}`, x, y + 90);
    if (m.progress) {
      ctx.fillText(`${m.progress.label} ${m.progress.value}`, x, y + 108);
    }
    ctx.restore();
  }

  _drawWarnings(ac, s, cx, cy) {
    if (s.suppressWarnings) return;
    const ctx = this.ctx;
    const warn = [];
    if (ac.stalled) warn.push('STALL');
    if (ac.agl < 90 && ac.vspeed < -9 && !ac.grounded) warn.push('PULL UP');
    if (ac.gearT < 0.9 && ac.agl < 160 && ac.airspeed < 130 && !ac.grounded) warn.push('GEAR');
    if (ac.overspeed) warn.push('OVERSPEED');
    if (ac.fuel < 0.18) warn.push('FUEL LOW');
    if (!warn.length) return;
    ctx.save();
    this._glow('#ff6b4a', 14);
    ctx.strokeStyle = '#ff6b4a';
    ctx.fillStyle = '#ff6b4a';
    ctx.font = '700 22px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    const blink = Math.sin(performance.now() * 0.012) > -0.2;
    if (blink) {
      warn.forEach((w, i) => ctx.fillText(w, cx, cy + 120 + i * 30));
    }
    ctx.restore();
  }

  _drawMessage(text, cx, cy) {
    const ctx = this.ctx;
    const x = Math.max(196, this.w * 0.16);
    const y = Math.max(26, this.h * 0.05) + 146;
    ctx.save();
    this._glow(COLORS.hud, 8);
    ctx.font = '600 13px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

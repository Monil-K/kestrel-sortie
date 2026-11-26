// Missions: the ridge gates, the depot raid and the landing trial. Each builds its own meshes in
// the world and reports what happened as small events the game turns into score and radio calls.

import * as THREE from 'three';
import { RUNWAY, AC } from './config.js';
import { terrainHeight } from './terrain.js';
import { clamp, mulberry32 } from './random.js';

const GATE_RADIUS = 58;

function ringMesh(radius, color, opacity = 0.95) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 3.0, 8, 48),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 1.7, roughness: 0.3, metalness: 0.2,
      transparent: true, opacity: Math.min(1, opacity + 0.15),
    }),
  );
  g.add(ring);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.92, 0.5, 6, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 0.55 }),
  );
  g.add(inner);
  return g;
}

// Gate path: a valley run that starts low over the coast, climbs the volcano's shoulder and
// dives back down the ridge line to the airfield.
const RIDGE_ROUTE = [
  { x: -520, z: 2400, y: 130 },
  { x: 120, z: 2050, y: 168 },
  { x: 700, z: 1750, y: 210 },
  { x: 1180, z: 1400, y: 268 },
  { x: 1420, z: 950, y: 330 },
  { x: 1250, z: 380, y: 360 },
  { x: 900, z: -150, y: 300 },
  { x: 520, z: -700, y: 232 },
  { x: 260, z: -1250, y: 186 },
  { x: -180, z: -1750, y: 150 },
  { x: -780, z: -2050, y: 118 },
  { x: -1350, z: -1500, y: 96 },
];

export class Mission {
  constructor(id, scene) {
    this.id = id;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.score = 0;
    this.events = [];
    this.done = false;
    this.gates = [];
    this.targets = [];
    this.bullets = [];
    this.impacts = [];
    this.gateIndex = 0;
    this.hits = 0;
    this.misses = 0;
    this.landing = null;
    this.started = false;
    this.objective = '';
    this.timer = 0;
    this.callouts = [];
    if (id === 'ridge') this._buildRings();
    if (id === 'patrol') this._buildDepot();
    if (id === 'approach') this.timer = 0;
  }

  _clear() {
    this.group.clear();
  }

  _buildRings() {
    const curve = new THREE.CatmullRomCurve3(
      RIDGE_ROUTE.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    const count = 12;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const pos = curve.getPoint(t);
      // never let a gate sink into a ridge: keep it at least 70 m over the ground
      pos.y = Math.max(pos.y, terrainHeight(pos.x, pos.z) + 70);
      const ahead = curve.getPoint(Math.min(1, t + 0.02));
      const dir = ahead.clone().sub(pos).normalize();
      const gate = ringMesh(GATE_RADIUS, 0x3ff2d2, i === 0 ? 1.0 : 0.8);
      gate.position.copy(pos);
      gate.lookAt(pos.clone().add(dir));
      this.group.add(gate);
      this.gates.push({ mesh: gate, pos, dir, radius: GATE_RADIUS, passed: false, index: i });
    }
    this.objective = 'Thread 12 gates';
  }

  _buildDepot() {
    const rnd = mulberry32(5150);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b6d5c, roughness: 0.85, metalness: 0.15 });
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.6, metalness: 0.35 });
    const sites = [
      { x: 1500, z: -1150 }, { x: 1580, z: -1210 }, { x: 1440, z: -1265 },
      { x: 1655, z: -1105 }, { x: 1380, z: -1125 }, { x: 1700, z: -1250 },
    ];
    sites.forEach((s, i) => {
      const y = terrainHeight(s.x, s.z);
      const depot = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 9), crateMat);
        crate.position.set((rnd() - 0.5) * 34, 3.5 + (k === 3 ? 7 : 0), (rnd() - 0.5) * 34);
        crate.rotation.y = rnd();
        crate.castShadow = true;
        depot.add(crate);
      }
      for (let k = 0; k < 3; k++) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 8, 10), drumMat);
        drum.position.set((rnd() - 0.5) * 40, 4, (rnd() - 0.5) * 40);
        drum.castShadow = true;
        depot.add(drum);
      }
      depot.position.set(s.x, y, s.z);
      this.group.add(depot);
      this.targets.push({
        mesh: depot, pos: new THREE.Vector3(s.x, y + 8, s.z), radius: 30, alive: true, index: i,
        label: `DEPOT ${i + 1}`,
      });
    });
    this.objective = 'Destroy 6 depots, then land';
    this.ammo = 240;
  }

  gateAhead(ac) {
    if (this.id !== 'ridge') return null;
    const gate = this.gates.find((g) => !g.passed);
    if (!gate) return null;
    return gate;
  }

  nextTarget(ac) {
    if (this.id === 'patrol') {
      const alive = this.targets.filter((t) => t.alive);
      if (!alive.length) return { pos: new THREE.Vector3(RUNWAY.x, RUNWAY.elevation, RUNWAY.z), label: 'HOME', kind: 'home', dist: 0 };
      const nearest = alive
        .map((t) => ({ t, d: t.pos.distanceTo(ac.pos) }))
        .sort((a, b) => a.d - b.d)[0];
      return { pos: nearest.t.pos, label: nearest.t.label, kind: 'target', dist: nearest.d };
    }
    if (this.id === 'approach') {
      const thresh = new THREE.Vector3(RUNWAY.x, RUNWAY.elevation + 3, RUNWAY.z + RUNWAY.length / 2);
      return { pos: thresh, label: 'RWY 36', kind: 'home', dist: thresh.distanceTo(ac.pos) };
    }
    const g = this.gateAhead(ac);
    if (!g) return null;
    return { pos: g.pos, label: `GATE ${g.index + 1}`, kind: 'gate', dist: g.pos.distanceTo(ac.pos) };
  }

  fire(ac) {
    if (this.id !== 'patrol' || this.ammo <= 0) return null;
    this.ammo -= 2;
    const shots = [];
    for (let i = 0; i < 2; i++) {
      const muzzle = ac.pos.clone()
        .addScaledVector(ac.forward(), 3.4)
        .addScaledVector(ac.right(), -0.55)
        .addScaledVector(ac.up(), -0.7);
      const dir = ac.vel.clone().normalize().lerp(ac.forward(), 0.45).normalize();
      const vel = dir.multiplyScalar(760).add(ac.vel.clone().multiplyScalar(0.2));
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 12, 5),
        new THREE.MeshBasicMaterial({
        color: 0xffd28a, fog: false, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95,
      }),
      );
      mesh.position.copy(muzzle);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vel.clone().normalize());
      mesh.quaternion.copy(q);
      this.group.add(mesh);
      const b = { mesh, pos: muzzle.clone(), vel, life: 1.4 };
      this.bullets.push(b);
      shots.push(b);
    }
    return shots;
  }

  update(dt, ac, input) {
    this.time += dt;
    const events = [];

    // ---- gates
    if (this.id === 'ridge') {
      const gate = this.gateAhead(ac);
      if (gate) {
        const d = ac.pos.distanceTo(gate.pos);
        const ahead = ac.vel.clone().normalize().dot(gate.dir);
        if (d < gate.radius * 1.15 && ahead > 0) {
          gate.passed = true;
          this.score += 100;
          gate.mesh.children.forEach((c) => {
            c.material.color.set(0x62ff9a);
            c.material.emissive?.set(0x62ff9a);
            c.material.opacity = 0.35;
          });
          const left = this.gates.filter((g) => !g.passed).length;
          events.push({ type: 'gate', index: gate.index, left });
        }
      }
      this.gates.forEach((g, i) => {
        if (g.passed) return;
        const pulse = 0.55 + Math.sin(this.time * 3 + i) * 0.12;
        g.mesh.children[0].material.opacity = i === this.gateIndex ? 0.95 : pulse;
        g.mesh.children[0].material.emissiveIntensity = i === this.gateIndex ? 3.2 : 1.6;
        g.mesh.rotation.z += dt * 0.25;
      });
    }

    // ---- bullets and depots
    if (this.bullets.length) {
      for (const b of this.bullets) {
        b.pos.addScaledVector(b.vel, dt);
        b.mesh.position.copy(b.pos);
        b.life -= dt;
        b.vel.y -= 9.8 * dt * 0.35;
        for (const t of this.targets) {
          if (!t.alive) continue;
          if (b.pos.distanceTo(t.pos) < t.radius) {
            b.life = 0;
            t.alive = false;
            t.mesh.visible = false;
            this.hits++;
            this.score += 250;
            events.push({ type: 'hit', target: t });
            this._spawnImpact(t.pos);
            break;
          }
        }
        if (b.life <= 0) {
          b.mesh.removeFromParent();
        }
      }
      this.bullets = this.bullets.filter((b) => b.life > 0);
    }
    for (const imp of this.impacts) {
      imp.life -= dt;
      const k = 1 - imp.life / imp.max;
      imp.mesh.scale.setScalar(1 + k * 7);
      imp.mesh.traverse((o) => {
        if (o.material) o.material.opacity = Math.max(0, 1 - k) * 0.95;
      });
      if (imp.life <= 0) imp.mesh.removeFromParent();
    }
    this.impacts = this.impacts.filter((i) => i.life > 0);

    return events;
  }

  _spawnImpact(pos) {
    const mesh = new THREE.Group();
    const fireMat = new THREE.MeshBasicMaterial({
      color: 0xff8a24, transparent: true, opacity: 0.92, depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 8), fireMat);
    mesh.add(core);
    for (let i = 0; i < 5; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), fireMat.clone());
      puff.material.color.setHex(i % 2 ? 0xffc061 : 0xd94f14);
      const a = (i / 5) * Math.PI * 2;
      puff.position.set(Math.cos(a) * 5.5, 2 + (i % 3) * 2.5, Math.sin(a) * 5.5);
      mesh.add(puff);
    }
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.impacts.push({ mesh, life: 0.75, max: 0.75 });
  }

  progress(ac) {
    if (this.id === 'ridge') {
      return { label: 'GATES', value: `${this.gates.filter((g) => g.passed).length}/${this.gates.length}`, done: this.gates.every((g) => g.passed) };
    }
    if (this.id === 'patrol') {
      return { label: 'DEPOTS', value: `${this.hits}/${this.targets.length}`, done: this.hits >= this.targets.length };
    }
    if (this.id === 'approach') {
      return { label: 'RUNWAY', value: `${Math.max(0, Math.round(ac.agl * 3.28))} FT`, done: !!this.landing };
    }
    return null;
  }
}

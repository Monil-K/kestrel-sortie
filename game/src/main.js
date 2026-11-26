// Kestrel Sortie — game shell: world, cameras, mission state machine and the fixed-step loop.

import * as THREE from 'three';
import { MISSIONS, RUNWAY, AC, COLORS } from './config.js';
import { buildWorld, terrainHeight, onRunway } from './terrain.js';
import { buildSky } from './sky.js';
import { createPanel } from './panel.js';
import { buildAircraft } from './aircraft.js';
import { FlightModel } from './flight.js';
import { Hud } from './hud.js';
import { Mission } from './missions.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';

const KT = 1.94384;
const FT = 3.28084;
const STEP = 1 / 120;

// ---------------------------------------------------------------- renderer and world
const sceneCanvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.6, 22000);
scene.add(camera);

const world = buildWorld(scene);
const sky = buildSky(scene);
const panel = createPanel();
const plane = buildAircraft(panel.texture);
scene.add(plane.root);
const ac = new FlightModel();
const input = new Input();
const hud = new Hud(document.getElementById('hud'));
const audio = new AudioEngine();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  hud.resize();
});

// ---------------------------------------------------------------- game state
const G = {
  phase: 'title',          // title | flying | paused | debrief
  missionId: 'ridge',
  mission: null,
  view: 0,
  views: ['cockpit', 'chase', 'flyby'],
  viewNames: ['COCKPIT · C', 'CHASE · C', 'FLYBY · C'],
  camPos: new THREE.Vector3(),
  camUp: new THREE.Vector3(0, 1, 0),
  flyby: null,
  flybyTimer: 0,
  radio: null,
  radioUntil: 0,
  score: 0,
  elapsed: 0,
  timeLeft: 0,
  best: { maxKt: 0, maxG: 0 },
  lastCrash: '',
  landingGrade: null,
  finishedReason: '',
  manual: false,
  shots: null,
  stepAcc: 0,
  panelAcc: 0,
  shotHold: false,
};

const ui = {
  title: document.getElementById('title'),
  debrief: document.getElementById('debrief'),
  pause: document.getElementById('pause'),
  missionList: document.getElementById('missionList'),
  start: document.getElementById('startBtn'),
  again: document.getElementById('againBtn'),
  dbTitle: document.getElementById('dbtitle'),
  dbRows: document.getElementById('dbrows'),
  dbrk: document.getElementById('dbrk'),
};

// ---------------------------------------------------------------- title screen cards
for (const m of MISSIONS) {
  const card = document.createElement('div');
  card.className = 'card' + (m.id === G.missionId ? ' sel' : '');
  card.dataset.id = m.id;
  card.innerHTML = `<div class="num">${m.num}</div><h3>${m.name}</h3><p>${m.blurb}</p>`;
  card.addEventListener('click', () => {
    G.missionId = m.id;
    [...ui.missionList.children].forEach((c) => c.classList.toggle('sel', c.dataset.id === m.id));
    audio.start();
    audio.blip(520, 0.06, 'sine', 0.06);
  });
  ui.missionList.appendChild(card);
}

function showScreen(name) {
  ui.title.classList.toggle('hidden', name !== 'title');
  ui.debrief.classList.toggle('hidden', name !== 'debrief');
  ui.pause.classList.toggle('hidden', name !== 'pause');
}

// ---------------------------------------------------------------- mission lifecycle
function startMission(id) {
  audio.start();
  G.missionId = id;
  G.score = 0;
  G.elapsed = 0;
  G.radio = null;
  G.landingGrade = null;
  G.finishedReason = '';
  G.best = { maxKt: 0, maxG: 0 };
  input.reset();
  input.throttle = id === 'free' ? 0.68 : 0.78;

  if (G.mission) {
    G.mission.group.removeFromParent();
    G.mission = null;
  }
  G.mission = new Mission(id, scene);

  if (id === 'ridge' || id === 'patrol') {
    ac.reset('air');
    ac.setAirborne(new THREE.Vector3(-900, 620, 2100), 18, 98, 2, 0);
    ac.fuel = 0.86;
  } else if (id === 'approach') {
    ac.reset('air');
    ac.setAirborne(new THREE.Vector3(RUNWAY.x, 300, RUNWAY.z + 4200), 0, 86, 1.5, 0);
    ac.gearCmd = 1;
    ac.gearT = 1;
    ac.flapCmd = 0.66;
    ac.flapT = 0.66;
    ac.fuel = 0.55;
  } else {
    ac.reset('runway');
    input.throttle = 0.0;
  }

  const def = MISSIONS.find((m) => m.id === id);
  G.timeLeft = def.time;
  G.phase = 'flying';
  G.view = 0;
  showScreen(null);
  setRadio(`${def.name.toUpperCase()} · ${def.blurb.split('.')[0].toUpperCase()}`);
}

function setRadio(text, seconds = 4) {
  G.radio = text;
  G.radioUntil = G.elapsed + seconds;
}

function finish(reason, crashed = false) {
  if (G.phase === 'debrief') return;
  G.phase = 'debrief';
  G.finishedReason = reason;
  G.lastCrash = crashed ? ac.crashReason : '';
  if (crashed) audio.crash();
  fillDebrief(reason, crashed);
  showScreen('debrief');
}

function fillDebrief(reason, crashed) {
  const m = MISSIONS.find((x) => x.id === G.missionId);
  ui.dbTitle.textContent = m.name;
  ui.dbrk.textContent = crashed ? 'sortie lost' : 'sortie complete';
  const mm = Math.floor(G.elapsed / 60);
  const ss = String(Math.floor(G.elapsed % 60)).padStart(2, '0');
  const rows = [];
  if (crashed) rows.push(['Cause', ac.crashReason || 'airframe lost']);
  if (G.missionId === 'ridge') {
    rows.push(['Gates cleared', `${G.mission.gates.filter((g) => g.passed).length} / ${G.mission.gates.length}`]);
  }
  if (G.missionId === 'patrol') {
    rows.push(['Depots destroyed', `${G.mission.hits} / ${G.mission.targets.length}`]);
    rows.push(['Cannon rounds left', String(Math.max(0, G.mission.ammo))]);
  }
  if (G.landingGrade) {
    const g = G.landingGrade;
    rows.push(['Touchdown', `${Math.round(g.vs * 197)} ft/min · bank ${Math.abs(g.bank).toFixed(0)}°`]);
    rows.push(['Landing', g.grade.toUpperCase()]);
  }
  rows.push(['Flight time', `${mm}:${ss}`]);
  rows.push(['Score', String(G.score)]);
  rows.push(['Max speed', `${Math.round(G.best.maxKt)} kt`]);
  rows.push(['Max G', G.best.maxG.toFixed(1)]);
  rows.push(['Fuel remaining', `${Math.round(ac.fuel * 100)}%`]);
  ui.dbRows.innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
}

function backToTitle() {
  G.phase = 'title';
  G.shotHold = false;
  if (G.mission) { G.mission.group.removeFromParent(); G.mission = null; }
  ac.reset('runway');
  input.reset();
  input.throttle = 0.0;
  showScreen('title');
}

ui.start.addEventListener('click', () => startMission(G.missionId));
ui.again.addEventListener('click', () => startMission(G.missionId));

window.addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'Enter' && G.phase === 'title') startMission(G.missionId);
  if (k === 'r' && G.phase === 'debrief') startMission(G.missionId);
  if (k === 'p' && (G.phase === 'flying' || G.phase === 'paused')) {
    G.phase = G.phase === 'paused' ? 'flying' : 'paused';
    showScreen(G.phase === 'paused' ? 'pause' : null);
  }
  if (k === 'Escape' && G.phase !== 'title' && !G.shots) backToTitle();
});

// ---------------------------------------------------------------- commands while flying
function handleCommands() {
  const presses = input.consumePresses();
  for (const k of presses) {
    if (G.phase !== 'flying') continue;
    if (k === 'c') {
      G.view = (G.view + 1) % G.views.length;
      G.flyby = null;
    }
    if (k === 'g') {
      ac.gearCmd = ac.gearCmd > 0.5 ? 0 : 1;
      audio.clunk();
      setRadio(ac.gearCmd > 0.5 ? 'GEAR DOWN' : 'GEAR UP', 1.6);
    }
    if (k === 'f') {
      ac.flapCmd = ac.flapCmd < 0.3 ? 0.33 : ac.flapCmd < 0.6 ? 0.66 : ac.flapCmd < 0.9 ? 1 : 0;
      audio.clunk();
    }
  }
}

// ---------------------------------------------------------------- per-frame stepping
function simulate(dt) {
  const ctl = input.update(dt);
  G.stepAcc += dt;
  let steps = 0;
  while (G.stepAcc >= STEP && steps < 8) {
    ac.update(STEP, ctl);
    G.stepAcc -= STEP;
    steps++;
  }
  if (ac.crashed) {
    finish('Airframe destroyed', true);
    return;
  }
  G.elapsed += dt;
  G.best.maxKt = Math.max(G.best.maxKt, ac.airspeed * KT);
  G.best.maxG = Math.max(G.best.maxG, ac.gLoad);

  if (ctl.fire) {
    const shots = G.mission.fire(ac);
    if (shots && shots.length) audio.gun();
  }

  const events = G.mission.update(dt, ac, ctl);
  for (const e of events) {
    if (e.type === 'gate') {
      G.score += 100;
      audio.chime(true);
      setRadio(e.left > 0 ? `GATE CLEAR · ${e.left} TO GO` : 'ALL GATES CLEAR — RTB', 2.6);
    }
    if (e.type === 'hit') {
      G.score += 250;
      audio.chime(false);
      setRadio(`${e.target.label} DESTROYED`, 2.2);
    }
  }

  // touchdown grading
  if (ac.touchdown && !G.landingGrade) {
    G.landingGrade = ac.touchdown;
    if (ac.touchdown.runway) {
      audio.chime(true);
      setRadio(`TOUCHDOWN · ${ac.touchdown.grade.toUpperCase()}`, 3);
      G.score += ac.touchdown.grade === 'greaser' ? 500 : ac.touchdown.grade === 'smooth' ? 300 : 120;
    }
  }

  // mission completion
  if (G.missionId === 'ridge' && G.mission.gates.every((g) => g.passed)) {
    finish('All twelve gates cleared in ' + fmt(G.elapsed));
    return;
  }
  if (G.missionId === 'patrol' && G.mission.hits >= G.mission.targets.length) {
    if (ac.grounded && onRunway(ac.pos.x, ac.pos.z) && ac.airspeed < 25) {
      finish('Depot raked, aircraft recovered');
      return;
    }
    setRadio('DEPOT DESTROYED · RTB AND LAND', 3);
  }
  if (G.missionId === 'approach' && G.landingGrade && ac.grounded) {
    finish(`Landed · ${G.landingGrade.grade}`);
    return;
  }

  // clock
  const def = MISSIONS.find((m) => m.id === G.missionId);
  if (def.time > 0) {
    G.timeLeft = Math.max(0, G.timeLeft - dt);
    if (G.timeLeft === 0 && G.phase === 'flying') {
      finish('Time expired');
    }
  }

  if (ac.fuel <= 0 && !ac.grounded && G.phase === 'flying') {
    setRadio('FLAMEOUT · GLIDE TO THE FIELD', 4);
  }

  // warning horn
  if ((ac.stalled || (ac.agl < 90 && ac.vspeed < -9)) && G.phase === 'flying') audio.warn(G.elapsed);
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

// ---------------------------------------------------------------- cameras
function updateCamera(dt) {
  const view = G.views[G.view];
  if (G.phase === 'title') {
    const t = performance.now() * 0.00012;
    const r = 26;
    camera.fov = 46;
    camera.updateProjectionMatrix();
    camera.position.set(
      ac.pos.x + Math.cos(t * 6) * r,
      ac.pos.y + 5.2 + Math.sin(t * 9) * 1.6,
      ac.pos.z + Math.sin(t * 6) * r,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(ac.pos.x, ac.pos.y + 1.4, ac.pos.z);
    plane.setCockpitVisible(false);
    return;
  }

  if (view === 'cockpit') {
    camera.fov = 68;
    camera.updateProjectionMatrix();
    const eye = new THREE.Vector3(0, 1.08, -0.72).applyQuaternion(ac.quat);
    camera.position.copy(ac.pos).add(eye);
    const q = ac.quat.clone();
    const shake = ac.buffet * 0.0035 + (ac.grounded ? ac.airspeed * 0.00006 : 0);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      input.look.y + Math.sin(performance.now() * 0.09) * shake,
      input.look.x + Math.cos(performance.now() * 0.11) * shake,
      0, 'YXZ',
    )));
    camera.quaternion.copy(q);
    camera.up.set(0, 1, 0);
    plane.setCockpitVisible(true);
  } else if (view === 'chase') {
    camera.fov = 58;
    camera.updateProjectionMatrix();
    const fwd = ac.forward();
    const up = ac.up();
    const dist = 12 + Math.min(12, ac.airspeed * 0.055);
    const desired = ac.pos.clone().addScaledVector(fwd, -dist).addScaledVector(up, 3.6);
    const k = 1 - Math.exp(-dt * 5.2);
    G.camPos.lerp(desired, k);
    G.camUp.lerp(up, 1 - Math.exp(-dt * 3.4)).normalize();
    camera.position.copy(G.camPos);
    camera.up.copy(G.camUp);
    camera.lookAt(ac.pos.clone().addScaledVector(fwd, 34));
    plane.setCockpitVisible(false);
  } else {
    // flyby: a fixed camera the aircraft flies past
    camera.fov = 42;
    camera.updateProjectionMatrix();
    G.flybyTimer -= dt;
    if (!G.flyby || G.flybyTimer <= 0 || ac.pos.distanceTo(G.flyby) > 1400) {
      const side = ac.right().multiplyScalar(Math.random() > 0.5 ? 1 : -1);
      G.flyby = ac.pos.clone().addScaledVector(ac.forward(), 420).addScaledVector(side, 120).addScaledVector(new THREE.Vector3(0, 1, 0), 24);
      G.flybyTimer = 8;
    }
    camera.position.copy(G.flyby);
    camera.up.set(0, 1, 0);
    camera.lookAt(ac.pos);
    plane.setCockpitVisible(false);
  }
}

// ---------------------------------------------------------------- visual sync
function syncVisuals(dt) {
  plane.root.position.copy(ac.pos);
  plane.root.quaternion.copy(ac.quat);
  plane.setGear(ac.gearT);
  plane.spinProp(dt, ac.rpm, input.throttle);

  // keep the shadow box on the aircraft
  sky.update(performance.now() * 0.001, ac.pos, camera);
}

function panelFrame() {
  const bearing = G.mission ? (() => {
    const t = G.mission.nextTarget(ac);
    if (!t) return null;
    const dx = t.pos.x - ac.pos.x;
    const dz = t.pos.z - ac.pos.z;
    return { bearing: (THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)) + 360) % 360, dist: t.dist };
  })() : null;
  panel.update({
    knots: ac.airspeed * KT,
    altFt: Math.max(0, ac.altitude * FT),
    vsFpm: ac.vspeed * FT * 60,
    heading: ac.heading,
    pitch: ac.pitch,
    bank: ac.bank,
    rpm: ac.rpm * 100,
    fuel: ac.fuel,
    gLoad: ac.gLoad,
    aoa: ac.alpha * 57.3,
    beta: ac.beta,
    gearT: ac.gearT,
    gearTransit: ac.gearT > 0.02 && ac.gearT < 0.98,
    flapT: ac.flapT,
    turnRate: ac.turnRate,
    stalled: ac.stalled,
    fuelLow: ac.fuel < 0.18,
    overspeed: ac.overspeed,
    damage: ac.damage,
    brakes: input.brake,
    bearing: bearing ? bearing.bearing : null,
    targetDist: bearing ? bearing.dist : null,
    clock: performance.now() * 0.001,
  });
}

function hudFrame() {
  if (G.phase === 'title' || G.shots?.hideHud) return;
  const target = G.mission ? G.mission.nextTarget(ac) : null;
  const prog = G.mission ? G.mission.progress(ac) : null;
  hud.draw({
    ac,
    camera,
    view: G.views[G.view],
    viewName: G.viewNames[G.view],
    target,
    suppressWarnings: !!G.shots,
    throttle: input.throttle,
    message: G.radio && G.elapsed < G.radioUntil + 4 ? G.radio : null,
    mission: G.mission ? {
      name: MISSIONS.find((m) => m.id === G.missionId).name,
      time: G.missionId === 'free' ? fmt(G.elapsed) : fmt(G.timeLeft),
      score: G.score,
      progress: prog,
      objective: G.mission.objective,
    } : null,
  });
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (G.phase === 'flying' && !G.shotHold) {
    handleCommands();
    simulate(dt);
  } else if (G.phase === 'title') {
    ac.rpm += (0.12 - ac.rpm) * dt;
  }

  syncVisuals(dt);
  updateCamera(dt);

  G.panelAcc += dt;
  if (G.panelAcc > 0.055) {
    panelFrame();
    G.panelAcc = 0;
  }
  hudFrame();
  audio.update(ac, input.throttle, G.phase === 'flying');

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- screenshot / demo poses
const SHOTS = {
  cockpit: { mission: 'ridge', view: 'cockpit', gate: 8, back: 430, speed: 99, bank: 6, pitch: 3, throttle: 0.84, prewarm: 1.0, ctl: { roll: 0.05 } },
  chase: { mission: 'ridge', view: 'chase', gate: 6, back: 700, speed: 108, bank: 26, pitch: 3, throttle: 0.92, prewarm: 1.6, ctl: { roll: 0.35 } },
  runway: { mission: 'approach', view: 'chase', speed: 74, prewarm: 1.8 },
  approach: { mission: 'approach', view: 'chase', speed: 74, prewarm: 1.8 },
  strike: { mission: 'patrol', view: 'chase', speed: 96, prewarm: 1.2, fire: true },
};

function applyShot(name) {
  const s = { ...(SHOTS[name] || SHOTS.cockpit) };
  const gateParam = Number(new URLSearchParams(location.search).get('gate'));
  if (Number.isInteger(gateParam) && gateParam > 0) s.gate = gateParam;
  G.shots = { name, hideHud: false };
  startMission(s.mission);
  G.view = G.views.indexOf(s.view);

  if (s.mission === 'ridge') {
    // earlier gates are behind us: mark them cleared so the HUD points at the one ahead
    G.mission.gates.forEach((g, i) => {
      if (i < s.gate) {
        g.passed = true;
        g.mesh.children.forEach((c) => {
          c.material.color.set(0x62ff9a);
          c.material.emissive?.set(0x62ff9a);
          c.material.opacity = 0.3;
        });
      }
    });
    const gate = G.mission.gates[s.gate];
    const dir = gate.dir;
    const back = gate.pos.clone().addScaledVector(dir, -s.back);
    back.y = Math.max(back.y, terrainHeight(back.x, back.z) + 130);
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z)) + 360) % 360;
    ac.setAirborne(back, heading, s.speed, s.pitch, s.bank);
    ac.gearT = 0;
    ac.gearCmd = 0;
    if (s.gate > 8) { ac.flapCmd = 0.33; ac.flapT = 0.33; }
  } else if (s.mission === 'approach') {
    ac.setAirborne(new THREE.Vector3(RUNWAY.x + 1, RUNWAY.elevation + 82, RUNWAY.z + 1180), 0, s.speed, -2.6, 3);
    ac.gearCmd = 1; ac.gearT = 1; ac.flapCmd = 0.66; ac.flapT = 0.66;
  } else if (s.mission === 'patrol') {
    G.mission.ammo = 999;
    const t = G.mission.targets[4];
    const from = t.pos.clone().add(new THREE.Vector3(-250, 118, 360));
    const d = t.pos.clone().sub(from);
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z)) + 360) % 360;
    const pitch = (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI + 2.2;
    ac.setAirborne(from, heading, s.speed, pitch, 0);
    ac.gearT = 0; ac.gearCmd = 0;
  }
  input.throttle = s.throttle ?? 0.8;
  input.reset();
  input.throttle = s.throttle ?? 0.8;

  // prewarm so the pose looks flown-in rather than placed
  const ctl = {
    pitch: 0, roll: s.ctl?.roll ?? 0, yaw: 0, throttle: input.throttle, brake: false, fire: false,
  };
  const n = Math.round((s.prewarm || 0) / STEP);
  for (let i = 0; i < n; i++) {
    ac.update(STEP, ctl);
    G.mission.update(STEP, ac, ctl);
  }
  // hold the pose: a screenshot needs a frame, not a flight
  G.shotHold = true;
  G.elapsed = 46;
  G.radio = s.mission === 'approach' ? 'RWY 36 · 1.6 NM · CLEARED TO LAND'
    : s.mission === 'patrol' ? 'DEPOT 5 · IN RANGE · GUNS' : `GATE ${(s.gate ?? 0) + 1} AHEAD · STAY LOW`;
  G.radioUntil = 9999;
  G.panelAcc = 1;
  panelFrame();
  if (s.fire) {
    // the burst flies all the way in, so the fire in frame is the game's own hit
    const target = G.mission.targets[4];
    for (let i = 0; i < 4; i++) G.mission.fire(ac);
    for (let i = 0; i < 110; i++) G.mission.update(0.006, ac, ctl);
    // and a fresh rope of tracers hangs between the muzzle and the target
    const muzzle = ac.pos.clone().addScaledVector(ac.forward(), 5).addScaledVector(ac.up(), -0.8);
    for (let k = 0; k < 9; k++) {
      const shots = G.mission.fire(ac);
      for (const b of shots || []) {
        b.vel.set(0, 0, 0);
        b.pos.copy(muzzle).lerp(target.pos, 0.08 + k * 0.075);
        b.mesh.position.copy(b.pos);
        b.mesh.scale.set(1.4, 0.7, 1.4);
        b.life = 999;
      }
    }
  }
}

const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- boot
if (params.get('shot')) applyShot(params.get('shot'));
else showScreen('title');
plane.root.position.copy(ac.pos);
plane.root.quaternion.copy(ac.quat);
requestAnimationFrame((t) => { last = t; frame(t); });

// small hook so the screenshot harness can drive the game
window.__kes = { ac, G, input, camera, scene, renderer, startMission, applyShot };

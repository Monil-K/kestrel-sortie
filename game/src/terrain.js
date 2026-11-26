// The island: an analytic height field (so physics, scenery and screenshots always agree on
// where the ground is) turned into a flat-shaded low-poly mesh, plus the airfield that the
// whole game is built around.

import * as THREE from 'three';
import { WORLD, RUNWAY, AIRPORT, WORLD_SEED } from './config.js';
import { fbm, ridged, mulberry32, smoothstep, clamp, lerp } from './random.js';

const SEED = WORLD_SEED;

function plateauMask(x, z) {
  // a wide coastal shelf: the airfield, its apron and a clear approach corridor to the south
  const dx = Math.max(Math.abs(x - 60) - 300, 0);
  const dz = Math.max(Math.abs(z) - 2050, 0);
  return 1 - smoothstep(0, 560, Math.hypot(dx, dz));
}

// Height of the ground in metres above sea level at a world position.
export function terrainHeight(x, z) {
  const nx = (x + 150) / 2650;
  const nz = (z - 120) / 3050;
  const wobble = (fbm(x * 0.00042, z * 0.00042, 3, SEED + 5) - 0.5) * 0.24;
  const dMain = Math.hypot(nx, nz) + wobble;
  const main = 1 - smoothstep(0.70, 1.03, dMain);

  const isletA = 1 - smoothstep(0.56, 1.0, Math.hypot((x + 2050) / 780, (z - 2480) / 640));
  const isletB = 1 - smoothstep(0.56, 1.0, Math.hypot((x - 2520) / 720, (z - 1560) / 560));
  const land = Math.max(main, isletA * 0.92, isletB * 0.92);

  const hills = fbm(x * 0.00075, z * 0.00075, 4, SEED + 11);
  const fine = fbm(x * 0.0042, z * 0.0042, 3, SEED + 23);
  let h = -28 + land * (56 + hills * 158 + fine * 24);

  const spine = ridged(x * 0.00062 + 3.2, z * 0.00062 - 1.7, 4, SEED + 31);
  h += Math.pow(land, 1.3) * Math.pow(spine, 1.7) * 540;

  const vd = Math.hypot(x - 1500, z + 1500) / 1250;
  if (vd < 1.25) {
    const cone = Math.max(0, 1 - vd);
    h += Math.pow(cone, 1.35) * 520 * (0.84 + 0.16 * ridged(x * 0.003, z * 0.003, 3, SEED + 41));
  }

  // The airfield sits on a levelled coastal shelf; the blend keeps the coast honest.
  const shelf = plateauMask(x, z);
  return lerp(h, RUNWAY.elevation, shelf);
}

export function terrainSlope(x, z) {
  const e = 12;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// True when a world position is on the paved runway (used for landing grades and brake grip).
export function onRunway(x, z) {
  return (
    Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 &&
    Math.abs(z - RUNWAY.z) < RUNWAY.length / 2
  );
}

export function onApron(x, z) {
  return x > 60 && x < 220 && z > -260 && z < 340;
}

function paintTerrainColor(h, slope, x, z, color) {
  const jitter = fbm(x * 0.01, z * 0.01, 2, SEED + 71);
  if (h < 1.5) {
    color.setRGB(0.52 + jitter * 0.08, 0.48 + jitter * 0.06, 0.36);
  } else if (h < 9) {
    const t = smoothstep(1.5, 9, h);
    color.setRGB(lerp(0.7, 0.55, t) + jitter * 0.04, lerp(0.63, 0.54, t) + jitter * 0.04, lerp(0.42, 0.33, t));
  } else if (h < 230 && slope < 0.52) {
    const t = smoothstep(9, 230, h);
    color.setRGB(lerp(0.2, 0.17, t) + jitter * 0.06, lerp(0.33, 0.26, t) + jitter * 0.07, lerp(0.14, 0.13, t));
  } else if (h < 430) {
    const t = smoothstep(230, 430, h);
    color.setRGB(lerp(0.26, 0.33, t), lerp(0.26, 0.29, t), lerp(0.23, 0.25, t));
  } else {
    const t = smoothstep(430, 560, h);
    color.setRGB(lerp(0.36, 0.44, t) + jitter * 0.03, lerp(0.35, 0.4, t), lerp(0.33, 0.38, t));
  }
  if (slope > 0.55 && h > 20) color.lerp(new THREE.Color(0.27, 0.26, 0.24), 0.6);
}

function buildTerrainMesh() {
  const { extent, grid } = WORLD;
  const geo = new THREE.PlaneGeometry(extent, extent, grid, grid);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    paintTerrainColor(h, terrainSlope(x, z), x, z, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function runwayTexture() {
  const w = 256;
  const h = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#5a5e60';
  g.fillRect(0, 0, w, h);
  // weathered asphalt
  const rnd = mulberry32(4711);
  for (let i = 0; i < 9000; i++) {
    const v = 72 + Math.floor(rnd() * 34);
    g.fillStyle = `rgba(${v},${v + 2},${v},0.5)`;
    g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 2 + rnd() * 9);
  }
  // rubber down the touchdown zone
  const grad = g.createLinearGradient(0, h * 0.62, 0, h * 0.98);
  grad.addColorStop(0, 'rgba(20,20,20,0)');
  grad.addColorStop(1, 'rgba(18,18,18,0.42)');
  g.fillStyle = grad;
  g.fillRect(0, h * 0.62, w, h * 0.38);

  g.fillStyle = '#e9e6dc';
  // edge lines
  g.fillRect(10, 40, 5, h - 80);
  g.fillRect(w - 15, 40, 5, h - 80);
  // centreline dashes
  for (let y = 150; y < h - 150; y += 110) g.fillRect(w / 2 - 3, y, 6, 58);
  // threshold bars at both ends
  const bars = (yTop) => {
    for (let i = 0; i < 6; i++) {
      const bw = 14;
      g.fillRect(26 + i * 34, yTop, bw, 46);
    }
  };
  bars(46);
  bars(h - 92);
  // touchdown zone markers
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const y = h * 0.36 + k * 90;
      for (let i = 0; i < 2; i++) {
        const x = side < 0 ? 40 + i * 26 : w - 54 - i * 26;
        g.fillRect(x, y, 14, 40);
      }
    }
  }
  // designators
  g.save();
  g.translate(w / 2, 128);
  g.fillStyle = '#efeee6';
  g.font = 'bold 90px "Helvetica Neue", Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('36', 0, 0);
  g.restore();
  g.save();
  g.translate(w / 2, h - 150);
  g.rotate(Math.PI);
  g.fillStyle = '#efeee6';
  g.font = 'bold 90px "Helvetica Neue", Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('18', 0, 0);
  g.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function asphaltTexture(width, height, base, rep) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  const rnd = mulberry32(991);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.floor(rnd() * 40);
    g.fillStyle = `rgba(${v},${v},${v - 4},0.32)`;
    g.fillRect(rnd() * 128, rnd() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(width, height);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildAirfield(scene) {
  const group = new THREE.Group();
  group.name = 'airfield';
  const y = RUNWAY.elevation;

  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.88, metalness: 0.02 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, y + 0.45, RUNWAY.z);
  strip.receiveShadow = true;
  group.add(strip);

  const apronMat = new THREE.MeshStandardMaterial({
    map: asphaltTexture(6, 26, '#8b8d88'),
    roughness: 0.94,
  });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(150, 600), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(140, y + 0.44, 40);
  apron.receiveShadow = true;
  group.add(apron);

  // taxiway from apron to threshold
  const taxi = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 220),
    new THREE.MeshStandardMaterial({ map: asphaltTexture(1, 9, '#7e807b'), roughness: 0.95 }),
  );
  taxi.rotation.x = -Math.PI / 2;
  taxi.position.set(40, y + 0.44, -270);
  group.add(taxi);

  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9c96, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x545c58, roughness: 0.7, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x223c44, roughness: 0.08, metalness: 0.85, emissive: 0x0a1a20, emissiveIntensity: 0.6,
  });

  // control tower
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.6, 26, 8), concrete);
  shaft.position.y = 13;
  tower.add(shaft);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 6.2, 5.6, 8), glass);
  cab.position.y = 28.5;
  tower.add(cab);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 7.8, 0.8, 8), dark);
  roof.position.y = 31.6;
  tower.add(roof);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 12, 5), dark);
  mast.position.y = 38;
  tower.add(mast);
  tower.position.set(AIRPORT.tower.x, y, AIRPORT.tower.z);
  tower.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(tower);

  // hangars
  for (const hg of AIRPORT.hangars) {
    const shed = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(46, 13, 34), concrete);
    body.position.y = 6.5;
    shed.add(body);
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(17.2, 17.2, 46, 14, 1, false, 0, Math.PI), dark);
    arch.rotation.z = Math.PI / 2;
    arch.position.y = 13;
    shed.add(arch);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 12, 30), new THREE.MeshStandardMaterial({ color: 0x3c4a46, metalness: 0.4, roughness: 0.5 }));
    door.position.set(-23, 6.2, 0);
    shed.add(door);
    shed.position.set(hg.x, y, hg.z);
    shed.rotation.y = hg.rot;
    shed.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(shed);
  }

  // fuel farm
  const farm = new THREE.Group();
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xc9c2a6, roughness: 0.55, metalness: 0.25 });
  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 12, 14), tankMat);
    tank.position.set(i * 22, 6, 0);
    farm.add(tank);
  }
  farm.position.set(AIRPORT.fuelFarm.x, y, AIRPORT.fuelFarm.z);
  farm.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(farm);

  // windsock
  const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6, 5), dark);
  sockPole.position.set(-42, y + 3, 640);
  group.add(sockPole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 3.4, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xff7a2f, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(-39.5, y + 5.6, 640);
  group.add(sock);

  // runway edge lights + approach lights
  const lightGeo = new THREE.BoxGeometry(0.6, 0.4, 0.6);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xfff3cf, emissive: 0xffdca8, emissiveIntensity: 1.4 });
  const edge = new THREE.InstancedMesh(lightGeo, edgeMat, 96);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 48; i++) {
    const zz = -RUNWAY.length / 2 + 20 + i * ((RUNWAY.length - 40) / 47);
    m.makeTranslation(RUNWAY.x - RUNWAY.width / 2 - 2, y + 0.3, RUNWAY.z + zz);
    edge.setMatrixAt(i * 2, m);
    m.makeTranslation(RUNWAY.x + RUNWAY.width / 2 + 2, y + 0.3, RUNWAY.z + zz);
    edge.setMatrixAt(i * 2 + 1, m);
  }
  group.add(edge);

  const approachMat = new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0xbfefff, emissiveIntensity: 1.6 });
  const approach = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), approachMat, 12);
  for (let i = 0; i < 12; i++) {
    m.makeTranslation(RUNWAY.x, y + 0.4, RUNWAY.z + RUNWAY.length / 2 + 90 + i * 58);
    approach.setMatrixAt(i, m);
  }
  group.add(approach);

  scene.add(group);
  return { group, sock, strip };
}

function scatterScenery(scene) {
  const rnd = mulberry32(SEED + 303);
  const dummy = new THREE.Object3D();
  const count = 1500;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
  const crownGeo = new THREE.ConeGeometry(3.4, 12, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1, flatShading: true });
  const crownMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
  const tint = new THREE.Color();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 30) {
    guard++;
    const x = (rnd() - 0.5) * 7400;
    const z = (rnd() - 0.5) * 7400;
    const h = terrainHeight(x, z);
    if (h < 6 || h > 300) continue;
    if (terrainSlope(x, z) > 0.5) continue;
    if (Math.abs(x - 60) < 320 && Math.abs(z) < 950) continue; // keep the airfield clear
    const s = 0.7 + rnd() * 0.85;
    dummy.position.set(x, h + 2.4 * s, z);
    dummy.rotation.y = rnd() * Math.PI * 2;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + 7 * s;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    tint.setRGB(0.16 + rnd() * 0.1, 0.3 + rnd() * 0.16, 0.15 + rnd() * 0.07);
    crowns.setColorAt(placed, tint);
    placed++;
  }
  trunks.count = placed;
  crowns.count = placed;
  trunks.castShadow = crowns.castShadow = true;
  scene.add(trunks, crowns);

  // boulders on the ridges
  const rockGeo = new THREE.IcosahedronGeometry(3.2, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6a62, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 420);
  let r2 = 0;
  let g2 = 0;
  while (r2 < 420 && g2 < 20000) {
    g2++;
    const x = (rnd() - 0.5) * 8000;
    const z = (rnd() - 0.5) * 8000;
    const h = terrainHeight(x, z);
    if (h < 12 || h > 520) continue;
    dummy.position.set(x, h + 1.2, z);
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.scale.set(0.6 + rnd() * 1.8, 0.5 + rnd() * 1.2, 0.6 + rnd() * 1.8);
    dummy.updateMatrix();
    rocks.setMatrixAt(r2, dummy.matrix);
    r2++;
  }
  rocks.count = r2;
  rocks.castShadow = true;
  scene.add(rocks);

  return { trees: placed, rocks: r2 };
}

export function buildWorld(scene) {
  const terrain = buildTerrainMesh();
  scene.add(terrain);
  const airfield = buildAirfield(scene);
  const scenery = scatterScenery(scene);
  return {
    terrain,
    airfield,
    scenery,
    update(t) {
      airfield.sock.rotation.y = Math.sin(t * 0.6) * 0.28 + 0.35;
      airfield.sock.rotation.x = Math.sin(t * 1.7) * 0.12;
    },
  };
}

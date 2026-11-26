// The Kestrel: one turboprop strike aircraft built from primitives, with a cockpit you can
// actually sit in. Everything is generated in code (no model files), so the livery, panel lines
// and cockpit are all part of the game's own source.

import * as THREE from 'three';

const PAINT = {
  sand: 0xc7ad82,
  olive: 0x4c5b3c,
  belly: 0xd8d2c2,
  dark: 0x2b3230,
  metal: 0x6f7673,
  glass: 0x1b3a44,
  accent: 0xe0522e,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.25,
    flatShading: opts.flat ?? false,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

// A tapered, slightly swept panel: wings, stabilisers and the fin are all made with this.
function taperedPanel({ span, rootChord, tipChord, sweep, thickness, dihedral = 0 }) {
  const s = new THREE.Shape();
  const rc = rootChord / 2;
  const tc = tipChord / 2;
  s.moveTo(0, rc);
  s.lineTo(span, -sweep + tc);
  s.lineTo(span, -sweep - tc);
  s.lineTo(0, -rc);
  s.lineTo(0, rc);
  const geo = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  geo.rotateZ(dihedral);
  return geo;
}

function liveryTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#c7ad82';
  g.fillRect(0, 0, 512, 512);
  // disruptive olive patches
  const rnd = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  g.fillStyle = '#55643f';
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    const x = rnd() * 512;
    const y = rnd() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      g.lineTo(x + (rnd() - 0.4) * 120, y + (rnd() - 0.4) * 96);
    }
    g.closePath();
    g.fill();
  }
  // panel lines
  g.strokeStyle = 'rgba(40,44,40,0.25)';
  g.lineWidth = 1.5;
  for (let x = 0; x < 512; x += 48) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke();
  }
  for (let y = 0; y < 512; y += 44) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export function buildAircraft(panelTexture) {
  const root = new THREE.Group();
  root.name = 'kestrel';

  const livery = liveryTexture();
  const fuselageMat = new THREE.MeshStandardMaterial({
    map: livery, roughness: 0.55, metalness: 0.28, flatShading: false,
  });
  const bellyMat = mat(PAINT.belly, { roughness: 0.6, metalness: 0.15 });
  const darkMat = mat(PAINT.dark, { roughness: 0.45, metalness: 0.6 });
  const metalMat = mat(PAINT.metal, { roughness: 0.35, metalness: 0.85 });
  const accentMat = mat(PAINT.accent, { roughness: 0.5, metalness: 0.2 });

  // ---- fuselage: lathed from a nose-to-tail profile
  const profile = [
    [0.02, -5.45],
    [0.34, -5.25],
    [0.52, -5.05],
    [0.7, -4.7],
    [0.84, -4.1],
    [0.95, -3.2],
    [1.0, -1.6],
    [1.0, 0.2],
    [0.95, 1.6],
    [0.84, 2.9],
    [0.68, 3.9],
    [0.5, 4.7],
    [0.34, 5.4],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fuseGeo = new THREE.LatheGeometry(profile, 16);
  fuseGeo.rotateX(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuseGeo, fuselageMat);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  root.add(fuselage);

  // belly panel (lighter underside)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.36), bellyMat);
  belly.scale.set(1.005, 1.005, 4.4);
  belly.position.z = 0.1;
  root.add(belly);

  // ---- nose, spinner and propeller
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 12), darkMat);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -5.55;
  root.add(spinner);

  const prop = new THREE.Group();
  prop.position.z = -5.5;
  const bladeGeo = new THREE.BoxGeometry(0.17, 1.55, 0.05);
  bladeGeo.translate(0, 0.82, 0);
  const bladeMat = mat(0x1d2321, { roughness: 0.5, metalness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(bladeGeo, bladeMat);
    b.rotation.z = (i / 4) * Math.PI * 2;
    b.rotation.y = 0.42;
    prop.add(b);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.72, 24),
    new THREE.MeshBasicMaterial({ color: 0xb9c6c4, transparent: true, opacity: 0.07, side: THREE.DoubleSide }),
  );
  prop.add(disc);
  root.add(prop);

  // ---- wings with dihedral, pylons and drop tanks
  const wingGeo = taperedPanel({
    span: 4.8, rootChord: 2.05, tipChord: 1.2, sweep: 0.42, thickness: 0.26, dihedral: 0.055,
  });
  const wingL = new THREE.Mesh(wingGeo, fuselageMat);
  wingL.position.set(0, -0.15, 0.15);
  const wingR = new THREE.Mesh(wingGeo.clone().scale(-1, 1, 1), fuselageMat);
  wingR.position.set(0, -0.15, 0.15);
  for (const w of [wingL, wingR]) { w.castShadow = true; w.receiveShadow = true; root.add(w); }

  const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 1.0), accentMat);
  tipL.position.set(-4.75, 0.12, -0.05);
  root.add(tipL);
  const tipR = tipL.clone();
  tipR.position.x = 4.75;
  root.add(tipR);

  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.7), metalMat);
    pylon.position.set(side * 2.1, -0.34, 0.1);
    root.add(pylon);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.1, 10), metalMat);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(side * 2.1, -0.55, 0.15);
    tank.castShadow = true;
    root.add(tank);
    const tankNose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 10), metalMat);
    tankNose.rotation.x = -Math.PI / 2;
    tankNose.position.set(side * 2.1, -0.55, -1.0);
    root.add(tankNose);
  }

  // ---- tail
  const stab = taperedPanel({ span: 1.9, rootChord: 0.95, tipChord: 0.55, sweep: 0.25, thickness: 0.14 });
  const stabL = new THREE.Mesh(stab, fuselageMat);
  stabL.position.set(0, 0.28, 4.45);
  const stabR = new THREE.Mesh(stab.clone().scale(-1, 1, 1), fuselageMat);
  stabR.position.set(0, 0.28, 4.45);
  for (const s of [stabL, stabR]) { s.castShadow = true; root.add(s); }

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.35, 1.55);
  finShape.lineTo(1.35, 1.62);
  finShape.lineTo(1.25, 0.1);
  finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.14, bevelEnabled: false });
  finGeo.translate(0, 0, -0.07);
  finGeo.rotateY(-Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, fuselageMat);
  fin.position.set(0, 0.35, 5.1);
  fin.castShadow = true;
  root.add(fin);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.35, 0.36), fuselageMat);
  rudder.position.set(0, 1.1, 4.72);
  root.add(rudder);
  const finCap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.9), accentMat);
  finCap.position.set(0, 1.95, 4.62);
  root.add(finCap);

  // tail number, painted on the fin
  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = 256; tagCanvas.height = 128;
  const tg = tagCanvas.getContext('2d');
  tg.fillStyle = '#c7ad82'; tg.fillRect(0, 0, 256, 128);
  tg.fillStyle = '#2b3230';
  tg.font = 'bold 54px "Helvetica Neue", Arial';
  tg.textAlign = 'center'; tg.textBaseline = 'middle';
  tg.fillText('KV-07', 128, 64);
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.7 }));
  tag.rotation.y = Math.PI / 2;
  tag.position.set(0.075, 1.05, 4.62);
  root.add(tag);
  const tag2 = tag.clone();
  tag2.rotation.y = -Math.PI / 2;
  tag2.position.x = -0.075;
  root.add(tag2);

  // ---- gun barrel under the nose
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.5, 8), darkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(-0.55, -0.72, -3.6);
  root.add(barrel);

  // ---- canopy + cockpit
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x183038,
    metalness: 0.1,
    roughness: 0.06,
    transparent: true,
    opacity: 0.5,
    transmission: 0.0,
    side: THREE.DoubleSide,
  });
  const canopyGeo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeo, glassMat);
  canopy.scale.set(0.62, 0.78, 1.65);
  canopy.position.set(0, 0.74, -1.15);
  root.add(canopy);

  const frameMat = mat(0x39423e, { roughness: 0.4, metalness: 0.5 });
  // canopy rails
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6), frameMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(side * 0.74, 0.76, -1.1);
    root.add(rail);
  }
  // windscreen bow, across the top of the glass
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.035, 6, 16, Math.PI), frameMat);
  arch.position.set(0, 1.02, -2.6);
  arch.rotation.z = Math.PI;
  root.add(arch);

  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit';
  // glare shield, sitting between the windscreen and the top of the panel
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.5), mat(0x1a1f1d, { roughness: 0.9 }));
  shield.position.set(0, 0.88, -2.33);
  shield.rotation.x = -0.2;
  cockpit.add(shield);
  // instrument panel, tilted toward the pilot
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.6),
    new THREE.MeshStandardMaterial({
      map: panelTexture, emissiveMap: panelTexture, emissive: 0xffffff, emissiveIntensity: 0.55,
      roughness: 0.5, metalness: 0.15,
    }),
  );
  panel.position.set(0, 0.6, -2.16);
  panel.rotation.x = -0.36;
  cockpit.add(panel);
  // panel surround
  const surround = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.68, 0.07), mat(0x121617, { roughness: 0.92 }));
  surround.position.set(0, 0.59, -2.2);
  surround.rotation.x = -0.34;
  cockpit.add(surround);
  // side consoles, down beside the pilot's knees
  for (const side of [-1, 1]) {
    const console = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 1.0), mat(0x1b201e, { roughness: 0.9 }));
    console.position.set(side * 0.6, 0.33, -1.25);
    cockpit.add(console);
  }
  // control stick and throttle
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.4, 8), frameMat);
  stick.position.set(0, 0.42, -1.15);
  stick.rotation.x = -0.14;
  cockpit.add(stick);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.08), mat(0x111413, { roughness: 0.8 }));
  grip.position.set(0, 0.62, -1.18);
  cockpit.add(grip);
  const throttle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), mat(0x101312, { roughness: 0.85 }));
  throttle.position.set(0.6, 0.55, -1.5);
  cockpit.add(throttle);
  // seat back
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.12), mat(0x2a2f2b, { roughness: 0.95 }));
  seat.position.set(0, 0.62, -0.32);
  seat.rotation.x = 0.12;
  cockpit.add(seat);
  root.add(cockpit);

  // pilot's eye reference (used by the cockpit camera)
  const eye = new THREE.Object3D();
  eye.position.set(0, 1.06, -0.85);
  root.add(eye);

  // the propeller is a paint stirrer from the pilot's seat; hide the blades there
  const setPropForView = (inCockpit) => {
    for (const b of prop.children) {
      if (b !== disc) b.visible = !inCockpit;
    }
  };

  // ---- landing gear
  const gear = new THREE.Group();
  const tyreMat = mat(0x14181a, { roughness: 0.95 });
  const strutMat = mat(0x9aa0a0, { roughness: 0.3, metalness: 0.9 });
  const wheel = (r, w) => {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), tyreMat);
    tyre.rotation.z = Math.PI / 2;
    g.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.02, 10), strutMat);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    return g;
  };
  const noseGear = new THREE.Group();
  const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), strutMat);
  noseStrut.position.y = -0.45;
  noseGear.add(noseStrut);
  const noseWheel = wheel(0.28, 0.18);
  noseWheel.position.y = -0.95;
  noseGear.add(noseWheel);
  noseGear.position.set(0, -0.35, -3.9);
  gear.add(noseGear);

  const mains = [];
  for (const side of [-1, 1]) {
    const main = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.25, 8), strutMat);
    strut.position.y = -0.62;
    main.add(strut);
    const w = wheel(0.36, 0.24);
    w.position.y = -1.3;
    main.add(w);
    main.position.set(side * 1.45, -0.25, 0.35);
    main.rotation.z = side * 0.12;
    gear.add(main);
    mains.push(main);
  }
  gear.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(gear);

  // ---- navigation lights
  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xff2b18, { emissive: 0xff2b18, emissiveIntensity: 2.5 }));
  navRed.position.set(-4.8, 0.12, -0.1);
  const navGreen = navRed.clone();
  navGreen.material = mat(0x25ff7a, { emissive: 0x25ff7a, emissiveIntensity: 2.5 });
  navGreen.position.x = 4.8;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xfff0c0, { emissive: 0xffd88a, emissiveIntensity: 3 }));
  beacon.position.set(0, 2.0, 4.6);
  root.add(navRed, navGreen, beacon);

  let gearT = 1; // 1 = down, 0 = up
  const setGear = (t) => {
    gearT = THREE.MathUtils.clamp(t, 0, 1);
    gear.visible = gearT > 0.02;
    gear.position.y = (1 - gearT) * 0.55;
    gear.rotation.x = (1 - gearT) * 1.2;
    noseGear.rotation.x = (1 - gearT) * 1.6;
    for (const m of mains) m.scale.y = 0.35 + gearT * 0.65;
  };
  setGear(1);

  return {
    root,
    cockpit,
    prop,
    gear,
    eye,
    beacon,
    setGear,
    get gearT() { return gearT; },
    setCockpitVisible(v) {
      cockpit.visible = v;
      // from the pilot's seat the canopy shell only tints the whole view, and the fuselage
      // skin the seat sits inside would fill it: the frames and consoles stay
      canopy.visible = !v;
      fuselage.visible = !v;
      belly.visible = !v;
      setPropForView(v);
    },
    spinProp(dt, rpm, throttle) {
      prop.rotation.z += dt * (5 + rpm * 145);
      disc.material.opacity = 0.05 + throttle * 0.12;
      beacon.material.emissiveIntensity = 1 + Math.abs(Math.sin(performance.now() * 0.004)) * 2.4;
    },
  };
}

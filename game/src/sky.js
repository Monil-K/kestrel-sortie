// Sky, sun and sea. Both are shaders with no texture fetches from the network: the sky is a
// gradient dome with a sun and a haze band, the sea takes its colour from the depth of the
// seabed under it so the shallows read turquoise and the deep water goes cold and dark.

import * as THREE from 'three';
import { WORLD } from './config.js';
import { terrainHeight } from './terrain.js';
import { mulberry32 } from './random.js';

export const SUN_DIR = new THREE.Vector3(0.4, 0.62, 0.68).normalize();

export function buildSky(scene, renderer) {
  const geo = new THREE.SphereGeometry(12000, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uZenith: { value: new THREE.Color(0x2a5d84) },
      uHorizon: { value: new THREE.Color(0xbcd2d6) },
      uHaze: { value: new THREE.Color(0xdfe6dd) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSun;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uHaze;
      uniform float uTime;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float s = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return s;
      }

      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -1.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.62));
        float band = smoothstep(0.30, -0.02, abs(up - 0.02));
        col = mix(col, uHaze, band * 0.55);
        col = mix(col, uHaze * 0.9, smoothstep(0.0, -0.35, up));

        // a high, thin cloud deck projected on a plane above the world
        if (up > 0.02) {
          vec2 uv = d.xz / max(up, 0.02) * 0.9 + vec2(uTime * 0.004, uTime * 0.0016);
          float c = fbm(uv * 1.4);
          float cover = smoothstep(0.52, 0.86, c);
          float shade = smoothstep(0.45, 0.95, fbm(uv * 1.4 + vec2(0.6, 0.2)));
          vec3 cloud = mix(vec3(0.72, 0.76, 0.80), vec3(1.0, 0.99, 0.97), shade);
          float fade = smoothstep(0.02, 0.22, up);
          col = mix(col, cloud, cover * fade * 0.85);
        }

        float sd = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.86, 0.62) * pow(sd, 900.0) * 3.0;
        col += vec3(1.0, 0.78, 0.52) * pow(sd, 14.0) * 0.22;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  scene.add(dome);

  // depth field of the seabed, sampled by the water shader
  const N = 192;
  const data = new Uint8Array(N * N);
  const half = WORLD.extent / 2;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -half + (i / (N - 1)) * WORLD.extent;
      const z = -half + (j / (N - 1)) * WORLD.extent;
      const depth = Math.max(0, -terrainHeight(x, z));
      data[j * N + i] = Math.min(255, Math.round((depth / 70) * 255));
    }
  }
  const depthTex = new THREE.DataTexture(data, N, N, THREE.RedFormat);
  depthTex.needsUpdate = true;
  depthTex.magFilter = THREE.LinearFilter;
  depthTex.minFilter = THREE.LinearFilter;

  const waterGeo = new THREE.PlaneGeometry(16000, 16000, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: SUN_DIR.clone() },
      uDepth: { value: depthTex },
      uExtent: { value: new THREE.Vector2(WORLD.extent, WORLD.extent) },
      uDeep: { value: new THREE.Color(0x0d3a4a) },
      uShallow: { value: new THREE.Color(0x3fa7a2) },
      uSky: { value: new THREE.Color(0xbcd2d6) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uSun;
      uniform sampler2D uDepth;
      uniform vec2 uExtent;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;

      vec2 wave(vec2 p, vec2 dir, float freq, float speed, float amp) {
        float phase = dot(p, dir) * freq + uTime * speed;
        return dir * cos(phase) * amp;
      }

      void main() {
        vec2 uv = (vWorld.xz + uExtent * 0.5) / uExtent;
        float seabed = texture2D(uDepth, clamp(uv, 0.0, 1.0)).r;   // 0 shallow .. 1 deep
        vec2 p = vWorld.xz;

        float atten = 1.0 / (1.0 + length(vWorld.xz - cameraPosition.xz) * 0.0022);
        vec2 slope = vec2(0.0);
        slope += wave(p, normalize(vec2(1.0, 0.35)), 0.009, 0.8, 0.10);
        slope += wave(p, normalize(vec2(-0.4, 1.0)), 0.017, 1.3, 0.07);
        slope += wave(p, normalize(vec2(0.8, -0.7)), 0.041, 2.1, 0.035) * atten;
        slope += wave(p, normalize(vec2(0.2, 0.95)), 0.130, 3.4, 0.012) * atten;
        vec3 n = normalize(vec3(slope.x, 1.0, slope.y));

        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
        float glint = pow(max(dot(reflect(-uSun, n), viewDir), 0.0), 90.0);

        vec3 base = mix(uShallow, uDeep, smoothstep(0.02, 0.5, seabed));
        vec3 col = mix(base, uSky, clamp(fres * 0.75, 0.0, 0.7));
        col += vec3(1.0, 0.94, 0.82) * glint * 1.6;

        float alpha = mix(0.55, 0.97, smoothstep(0.01, 0.30, seabed));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = -0.35;
  water.renderOrder = 1;
  scene.add(water);

  scene.fog = new THREE.Fog(0xb9cdd4, WORLD.fogNear, WORLD.fogFar);

  const sun = new THREE.DirectionalLight(0xfff0d8, 1.85);
  sun.position.copy(SUN_DIR).multiplyScalar(4000);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1200;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xcfe6f2, 0x45503a, 0.72);
  scene.add(hemi);

  return {
    sun,
    hemi,
    dome,
    water,
    update(t, focus, camera) {
      waterMat.uniforms.uTime.value = t;
      mat.uniforms.uTime.value = t;
      dome.position.set(camera.position.x, 0, camera.position.z);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(SUN_DIR, 700);
    },
  };
}


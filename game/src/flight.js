// Flight model. Lift, drag, thrust and sideslip from the aircraft's own air data, integrated at a
// fixed step. The numbers are tuned so the aircraft has to be flown: it stalls when it is slow
// and pulled hard, it loses control authority as it slows, and it weathervanes into a slip.

import * as THREE from 'three';
import { AC, RUNWAY } from './config.js';
import { terrainHeight, onRunway } from './terrain.js';
import { clamp } from './random.js';

const G = 9.80665;
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

export class FlightModel {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.omega = new THREE.Vector3();
    this.grounded = true;
    this.crashed = false;
    this.crashReason = '';
    this.fuel = 1;
    this.gearT = 1;
    this.gearCmd = 1;
    this.flapT = 0;
    this.flapCmd = 0;
    this.brake = false;
    this.rpm = 0.2;
    this.airspeed = 0;
    this.altitude = 0;
    this.agl = 0;
    this.alpha = 0;
    this.beta = 0;
    this.gLoad = 1;
    this.vspeed = 0;
    this.heading = 0;
    this.pitch = 0;
    this.bank = 0;
    this.stalled = false;
    this.overspeed = false;
    this.buffet = 0;
    this.turbulence = 0;
    this.elapsed = 0;
    this.touchdown = null; // { vs, bank, offset, grade } set on the frame the wheels touch
    this.onGroundSeconds = 0;
    this.damage = 0;
    this.turnRate = 0;
    this._prevVel = new THREE.Vector3();
  }

  reset(kind = 'runway') {
    const heading = kind === 'runway' ? 0 : 32;
    this.quat.setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(-heading), 0, 'YXZ'));
    if (kind === 'runway') {
      this.pos.set(RUNWAY.x, RUNWAY.elevation + AC.gearHeight, RUNWAY.z + RUNWAY.length / 2 - 80);
      this.vel.set(0, 0, 0);
      this.grounded = true;
    } else {
      this.pos.set(-1150, 560, 1650);
      this.vel.copy(this.forward()).multiplyScalar(96);
      this.grounded = false;
    }
    this.omega.set(0, 0, 0);
    this.crashed = false;
    this.crashReason = '';
    this.fuel = 0.86;
    this.gearT = kind === 'runway' ? 1 : 0;
    this.gearCmd = this.gearT;
    this.flapT = 0;
    this.flapCmd = 0;
    this.brake = false;
    this.rpm = 0.25;
    this.damage = 0;
    this.elapsed = 0;
    this.touchdown = null;
    this.stalled = false;
    this.onGroundSeconds = 0;
    this._syncAngles();
  }

  forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat); }
  up() { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat); }
  right() { return new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat); }

  _syncAngles() {
    const f = this.forward();
    this.heading = (THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)) + 360) % 360;
    const up = this.up();
    const pitch = Math.asin(clamp(f.y, -1, 1));
    this.pitch = THREE.MathUtils.radToDeg(pitch);
    const right = this.right();
    this.bank = THREE.MathUtils.radToDeg(Math.atan2(-right.y, up.y));
    this.altitude = this.pos.y;
    this.agl = this.pos.y - terrainHeight(this.pos.x, this.pos.z);
    this.airspeed = this.vel.length();
    this.vspeed = this.vel.y;
  }

  setAirborne(pos, headingDeg, speed, pitchDeg = 2, bankDeg = 0) {
    this.pos.copy(pos);
    const e = new THREE.Euler(
      THREE.MathUtils.degToRad(pitchDeg),
      THREE.MathUtils.degToRad(-headingDeg),
      -THREE.MathUtils.degToRad(bankDeg),
      'YXZ',
    );
    this.quat.setFromEuler(e);
    this.vel.copy(this.forward()).multiplyScalar(speed);
    this.grounded = false;
    this.gearT = 0;
    this.gearCmd = 0;
    this._syncAngles();
  }

  update(dt, ctl) {
    if (this.crashed) return;
    this.elapsed += dt;

    // ---- systems with a little lag, so switches read as mechanisms
    this.gearT += clamp(this.gearCmd - this.gearT, -dt * 0.42, dt * 0.42);
    this.flapT += clamp(this.flapCmd - this.flapT, -dt * 0.5, dt * 0.5);
    this.brake = !!ctl.brake;

    const throttle = clamp(ctl.throttle, 0, 1);
    const targetRpm = this.grounded ? 0.22 + throttle * 0.78 : 0.45 + throttle * 0.55;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 2.4);

    const rho = 1.225 * Math.exp(-Math.max(0, this.pos.y) / 8500);
    const bodyQ = this.quat.clone().invert();
    const vLocal = this.vel.clone().applyQuaternion(bodyQ);
    const u = -vLocal.z;
    const wUp = -vLocal.y;
    const vSide = vLocal.x;
    const V = this.vel.length();
    const q = 0.5 * rho * V * V;

    const alpha = V > 1.2 ? Math.atan2(-wUp, Math.max(u, 0.5)) : 0;
    const beta = V > 1.2 ? Math.atan2(vSide, Math.max(u, 0.5)) : 0;
    this.alpha = alpha;
    this.beta = beta;

    const flapLift = this.flapT * 0.34;
    const flapDrag = this.flapT * AC.flapDrag;
    const gearDrag = this.gearT * AC.gearDrag;

    // ---- lift curve with a real stall break and a little post-stall lift
    const stallA = AC.alphaStall;
    let cl;
    if (Math.abs(alpha) <= stallA) {
      cl = AC.cl0 + AC.clAlpha * alpha + flapLift;
    } else {
      const over = Math.abs(alpha) - stallA;
      const base = AC.cl0 + Math.sign(alpha) * AC.clAlpha * stallA + flapLift;
      cl = base * Math.max(0.28, 1 - over * 3.4);
    }
    cl = clamp(cl, -1.15, AC.clMax + flapLift * 0.5);
    const stalled = Math.abs(alpha) > stallA && V > 4;
    this.stalled = stalled;

    const cd = AC.cd0 + gearDrag + flapDrag + AC.inducedK * cl * cl + Math.abs(beta) * 0.22;
    const qs = q * AC.wingArea;

    const lift = qs * cl;
    const drag = qs * cd;
    const side = -qs * AC.sideForce * beta;

    // thrust falls away with speed and air density
    const machFactor = 1 - clamp((u - 120) / 90, 0, 0.72);
    const thrust = throttle * AC.thrustMax * AC.propEfficiency * (rho / 1.225) * machFactor;

    const force = new THREE.Vector3(side, lift, 0);
    // drag acts along the velocity vector (opposite the airflow)
    if (V > 0.2) {
      const dragDir = this.vel.clone().normalize();
      force.addScaledVector(dragDir, -drag);
    }
    force.z += -thrust; // forward is -Z in body axes
    const worldForce = force.applyQuaternion(this.quat);
    worldForce.y -= AC.mass * G;

    this.vel.addScaledVector(worldForce, dt / AC.mass);

    // ---- rotational control: rates approach the commanded rate, authority falls with q
    const qf = clamp(q / AC.refQ, 0.16, 1.75);
    const stallLoss = stalled ? 0.45 : 1;
    const authority = qf * stallLoss;
    const trimPitch = -alpha * 1.15; // the airframe wants to fly at low alpha
    let targetPitch = ctl.pitch * AC.ratePitch * authority - trimPitch * 0.55;
    let targetRoll = -ctl.roll * AC.rateRoll * authority;
    const targetYaw = -ctl.yaw * AC.rateYaw * authority - beta * 0.85 * qf;

    if (stalled) {
      targetPitch -= 0.45; // the nose drops
      targetRoll += Math.sin(this.elapsed * 7.5) * 0.38; // wing rock
    }
    const vneRatio = V / AC.vne;
    if (vneRatio > 1) {
      this.overspeed = true;
      this.damage = Math.min(1, this.damage + dt * (vneRatio - 1) * 0.5);
      targetPitch += Math.sin(this.elapsed * 22) * 0.05;
    } else {
      this.overspeed = false;
    }
    this.buffet = stalled ? 1 : clamp((V - AC.vne * 0.86) / (AC.vne * 0.2), 0, 1);

    const tau = 0.11;
    const k = 1 - Math.exp(-dt / tau);
    this.omega.x += (targetPitch - this.omega.x) * k;
    this.omega.y += (targetYaw - this.omega.y) * k;
    this.omega.z += (targetRoll - this.omega.z) * k;

    // integrate orientation in body axes
    const w = this.omega;
    const rate = w.length();
    if (rate > 1e-5) {
      const dq = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(w.x / rate, w.y / rate, w.z / rate),
        rate * dt,
      );
      this.quat.multiply(dq).normalize();
    }

    // ---- integrate position
    this.pos.addScaledVector(this.vel, dt);

    // ---- fuel
    if (throttle > 0.02) this.fuel = Math.max(0, this.fuel - dt * AC.fuelBurn * (0.35 + throttle * 2.4));
    if (this.fuel <= 0) this.vel.addScaledVector(worldForce.clone().set(0, 0, 0), 0);

    const groundY = terrainHeight(this.pos.x, this.pos.z);
    const wheelHeight = AC.gearHeight * (0.35 + 0.65 * this.gearT) + (1 - Math.min(1, this.gearT / 0.6)) * 0.0;
    const contactY = groundY + (this.gearT > 0.6 ? AC.gearHeight : 1.35);

    // ---- ground contact, landings and crashes
    if (this.pos.y <= contactY) {
      const impact = -this._prevVel.y;
      const roll = Math.abs(this.bank);
      const runway = onRunway(this.pos.x, this.pos.z);
      const onPavement = runway || (this.pos.x > 60 && this.pos.x < 220);

      if (!this.grounded) {
        // first contact this frame
        if (this.gearT < 0.9) {
          this.crash('Belly landing — gear was up.');
          return;
        }
        if (impact > 7.2) {
          this.crash(`Hard impact at ${Math.round(impact * 197)} ft/min.`);
          return;
        }
        if (roll > 24) {
          this.crash('Wingtip caught the ground.');
          return;
        }
        if (!onPavement && this.vel.length() > 42) {
          this.crash('Set down off the runway at speed.');
          return;
        }
        const offset = Math.abs(this.pos.x - RUNWAY.x);
        this.touchdown = {
          vs: impact,
          bank: this.bank,
          offset,
          runway,
          grade: runway
            ? impact < 1.1 && offset < 9 ? 'greaser' : impact < 2.2 && offset < 18 ? 'smooth' : 'firm'
            : 'rough',
        };
      }
      this.pos.y = contactY;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
      this.onGroundSeconds += dt;

      // rolling friction, brakes, and the tyres' grip direction
      const speed = this.vel.length();
      const taxi = speed > 1.5 ? this.vel.clone().normalize() : new THREE.Vector3();
      const decel = (this.brake ? 4.6 : 0.42) + speed * 0.012 + (runway ? 0 : 1.6);
      const newSpeed = Math.max(0, speed - decel * dt);
      this.vel.copy(taxi).multiplyScalar(newSpeed);

      // nose-wheel steering, and the wings levelling themselves on the ground
      const steerAuth = clamp(1 - speed / 70, 0.08, 1);
      const steer = -ctl.yaw * 0.55 * steerAuth * Math.min(speed, 18) / 18;
      const headingErr = Math.atan2(this.forward().x, -this.forward().z);
      const yawCorrection = -headingErr * Math.min(1, dt * 1.6) + steer * dt * 2.2;
      this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yawCorrection));
      const right = this.right();
      const bankErr = Math.atan2(-right.y, this.up().y);
      this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bankErr * Math.min(1, dt * 2.2) * -1));

      // rotate: enough elevator and speed lifts the wheels off
      const rotateSpeed = 52;
      if (newSpeed > rotateSpeed && ctl.pitch > 0.25 && this.gearT > 0.9) {
        this.grounded = false;
        this.pos.y = contactY + 0.12;
        this.vel.y = 1.4;
        this.omega.x = 0.24;
      }
    } else if (this.grounded) {
      // rolled off a rise
      this.grounded = false;
      this.touchdown = null;
    }

    // ---- terrain collision in flight
    if (!this.grounded && this.pos.y < groundY + 1.4) {
      this.crash('Flew into the terrain.');
      return;
    }

    this.gLoad = (lift / (AC.mass * G)) + Math.cos((this.bank * Math.PI) / 180) * 0;
    this._prevVel.copy(this.vel);
    this._syncAngles();

    // bank-driven turn rate readout for the HUD
    this.turnRate = (G * Math.tan((this.bank * Math.PI) / 180)) / Math.max(18, this.airspeed);
  }

  crash(reason) {
    this.crashed = true;
    this.crashReason = reason;
    this.grounded = false;
    this.vel.multiplyScalar(0.12);
  }
}

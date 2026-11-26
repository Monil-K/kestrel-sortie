// Controls: keyboard for the stick, throttle and systems, mouse for looking around the cockpit.
// Axis values are smoothed so the aircraft does not snap when a key goes down.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    this.throttle = 0.72;
    this.brake = false;
    this.fire = false;
    this.look = { x: 0, y: 0 };
    this.dragging = false;
    this.toggles = [];

    window.addEventListener('keydown', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.toggles.push(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => this.keys.clear());

    // mouse look, held with the left button; wheel trims the throttle
    window.addEventListener('mousedown', () => { this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; this.look.x *= 0.4; this.look.y *= 0.4; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.look.x = Math.max(-1.2, Math.min(1.2, this.look.x - e.movementX * 0.0026));
      this.look.y = Math.max(-0.7, Math.min(0.7, this.look.y - e.movementY * 0.0026));
    });
    window.addEventListener('wheel', (e) => {
      this.throttle = Math.max(0, Math.min(1, this.throttle - Math.sign(e.deltaY) * 0.05));
    }, { passive: true });
  }

  has(k) { return this.keys.has(k); }

  consumePresses() {
    const out = this.toggles.slice();
    this.toggles.length = 0;
    return out;
  }

  update(dt) {
    const up = this.keys.has('ArrowUp') ? 1 : 0;
    const down = this.keys.has('ArrowDown') ? 1 : 0;
    const left = this.keys.has('ArrowLeft') ? 1 : 0;
    const right = this.keys.has('ArrowRight') ? 1 : 0;
    const rudL = this.keys.has('q') ? 1 : 0;
    const rudR = this.keys.has('e') ? 1 : 0;

    const k = 1 - Math.exp(-dt * 7.5);
    this.pitch += (up - down - this.pitch) * k;
    this.roll += (right - left - this.roll) * k;
    this.yaw += (rudR - rudL - this.yaw) * k;

    if (this.keys.has('w')) this.throttle = Math.min(1, this.throttle + dt * 0.55);
    if (this.keys.has('s')) this.throttle = Math.max(0, this.throttle - dt * 0.55);
    this.brake = this.keys.has('b');
    this.fire = this.keys.has(' ');
    return {
      pitch: this.pitch,
      roll: this.roll,
      yaw: this.yaw,
      throttle: this.throttle,
      brake: this.brake,
      fire: this.fire,
    };
  }

  reset() {
    this.keys.clear();
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    this.look.x = 0;
    this.look.y = 0;
    this.throttle = 0.72;
  }
}

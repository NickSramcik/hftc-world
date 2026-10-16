// One virtual PlayStation pad fed by the keyboard, a gamepad (standard mapping) and
// on-screen touch controls. Buttons: cross, square, circle, triangle, l1, r1, l2, r2,
// select, start. stick: left stick (x right, y up), each -1..1. look: right stick.

export const BUTTONS = ['cross', 'square', 'circle', 'triangle', 'l1', 'r1', 'l2', 'r2', 'select', 'start'];

const KEYS = {
  Space: 'cross', KeyK: 'cross',
  ShiftLeft: 'square', ShiftRight: 'square', KeyJ: 'square',
  KeyF: 'circle', KeyL: 'circle',
  KeyR: 'triangle', KeyI: 'triangle',
  KeyQ: 'l1', KeyE: 'r1', KeyZ: 'l2', KeyC: 'r2',
  KeyV: 'select', Tab: 'select',
  Enter: 'start', Escape: 'start', KeyP: 'start',
};
const STICK = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
// standard gamepad: 0 cross, 1 circle, 2 square, 3 triangle, 4 L1, 5 R1, 6 L2, 7 R2, 8 select, 9 start
const PAD = ['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'select', 'start'];

export class Input {
  constructor() {
    this.down = Object.fromEntries(BUTTONS.map((b) => [b, false]));
    this.prev = { ...this.down };
    this.stick = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.keys = new Set();
    this.touchBtn = Object.fromEntries(BUTTONS.map((b) => [b, false]));
    this.touchStick = { x: 0, y: 0 };
    this.inject = null;           // scripted input for checks: { stick:{x,y}, buttons:Set }
    this.lastDevice = 'keyboard';
    addEventListener('keydown', (e) => {
      if (e.code in KEYS || e.code in STICK) e.preventDefault();
      this.keys.add(e.code); this.lastDevice = 'keyboard';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  // Wire the on-screen controls (elements with data-btn, and the #stick zone).
  bindTouch(root) {
    for (const el of root.querySelectorAll('[data-btn]')) {
      const b = el.dataset.btn;
      const on = (e) => { e.preventDefault(); this.touchBtn[b] = true; el.classList.add('on'); this.lastDevice = 'touch'; };
      const off = (e) => { e.preventDefault(); this.touchBtn[b] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    }
    const zone = root.querySelector('#stickzone'), knob = root.querySelector('#knob'), base = root.querySelector('#stickbase');
    let id = null, cx = 0, cy = 0;
    const R = 46;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault(); id = e.pointerId; cx = e.clientX; cy = e.clientY;
      zone.setPointerCapture(id);
      base.style.left = `${cx - 60}px`; base.style.top = `${cy - 60}px`; base.style.opacity = 1;
      knob.style.transform = 'translate(0px, 0px)';
      this.lastDevice = 'touch';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touchStick.x = dx / R; this.touchStick.y = -dy / R;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; this.touchStick.x = this.touchStick.y = 0; base.style.opacity = 0.35;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  poll() {
    this.prev = { ...this.down };
    const d = Object.fromEntries(BUTTONS.map((b) => [b, false]));
    let sx = 0, sy = 0, lx = 0, ly = 0;
    for (const k of this.keys) {
      if (KEYS[k]) d[KEYS[k]] = true;
      if (STICK[k]) { sx += STICK[k][0]; sy += STICK[k][1]; }
    }
    for (const b of BUTTONS) if (this.touchBtn[b]) d[b] = true;
    sx += this.touchStick.x; sy += this.touchStick.y;
    for (const gp of (navigator.getGamepads ? navigator.getGamepads() : [])) {
      if (!gp) continue;
      PAD.forEach((b, i) => { if (gp.buttons[i]?.pressed) { d[b] = true; this.lastDevice = 'gamepad'; } });
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      sx += dz(gp.axes[0] || 0); sy -= dz(gp.axes[1] || 0);
      lx += dz(gp.axes[2] || 0); ly -= dz(gp.axes[3] || 0);
      if (gp.buttons[12]?.pressed) sy += 1;
      if (gp.buttons[13]?.pressed) sy -= 1;
      if (gp.buttons[14]?.pressed) sx -= 1;
      if (gp.buttons[15]?.pressed) sx += 1;
      if (Math.abs(sx) + Math.abs(sy) + Math.abs(lx) > 0) this.lastDevice = 'gamepad';
    }
    if (this.inject) {
      sx += this.inject.stick?.x || 0; sy += this.inject.stick?.y || 0;
      for (const b of this.inject.buttons || []) d[b] = true;
    }
    const l = Math.hypot(sx, sy);
    if (l > 1) { sx /= l; sy /= l; }
    this.stick.x = sx; this.stick.y = sy;
    this.look.x = lx; this.look.y = ly;
    this.down = d;
  }

  held(b) { return this.down[b]; }
  pressed(b) { return this.down[b] && !this.prev[b]; }
  released(b) { return !this.down[b] && this.prev[b]; }
}

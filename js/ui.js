// In-world UI for Tiny Earth rev 1.2: poke-able button panels, text labels, and the ghost-hand tutor.
import * as THREE from 'three';

const PX_PER_M = 2600; // canvas resolution for crisp text in the headset

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// A flat label/card drawn on a canvas. Call .set(text...) to redraw.
export class Card {
  constructor(wM, hM, opts = {}) {
    this.w = wM; this.h = hM; this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(wM * PX_PER_M); this.canvas.height = Math.round(hM * PX_PER_M);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.renderOrder = 5;
  }
  set(lines, style = {}) {
    const { ctx: c, canvas } = this; const W = canvas.width, H = canvas.height;
    const bg = style.bg ?? this.opts.bg ?? 'rgba(255,255,255,0.94)';
    const fg = style.fg ?? this.opts.fg ?? '#0d3b23';
    const border = style.border ?? this.opts.border ?? null;
    c.clearRect(0, 0, W, H);
    c.fillStyle = bg; roundRect(c, 3, 3, W - 6, H - 6, Math.min(W, H) * 0.18); c.fill();
    if (border) { c.lineWidth = Math.max(4, H * 0.05); c.strokeStyle = border; roundRect(c, c.lineWidth / 2 + 3, c.lineWidth / 2 + 3, W - c.lineWidth - 6, H - c.lineWidth - 6, Math.min(W, H) * 0.16); c.stroke(); }
    const arr = Array.isArray(lines) ? lines : [lines];
    const size = style.size ?? this.opts.size ?? H * 0.42 / Math.max(1, arr.length * 0.85);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    arr.forEach((ln, i) => {
      const bold = i === 0 ? 'bold ' : '';
      const s = i === 0 ? size : size * 0.72;
      c.font = `${bold}${Math.round(s)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      const y = H / 2 + (i - (arr.length - 1) / 2) * size * 1.15;
      c.fillText(ln, W / 2, y, W * 0.92);
    });
    this.tex.needsUpdate = true;
    return this;
  }
}

// A poke-able 3D button: a card on a thin raised base. Pressed when a fingertip pushes through its face.
export class Button {
  constructor(label, wM, hM, onPress, colors = {}) {
    this.group = new THREE.Group();
    this.w = wM; this.h = hM; this.onPress = onPress; this.label = label;
    this.colors = { bg: '#2ee88a', fg: '#06321c', border: '#0b6b3a', ...colors };
    this.base = new THREE.Mesh(new THREE.BoxGeometry(wM, hM, 0.006), new THREE.MeshLambertMaterial({ color: 0x0b6b3a }));
    this.base.position.z = -0.004;
    this.card = new Card(wM, hM, { size: hM * PX_PER_M * 0.4 });
    this.card.mesh.position.z = 0.0002;
    this.face = new THREE.Group(); this.face.add(this.card.mesh);
    this.group.add(this.base, this.face);
    this.cool = 0; this.prev = [null, null]; this.hover = [false, false]; this.enabled = true;
    this.redraw();
  }
  setLabel(label, colors) { this.label = label; if (colors) Object.assign(this.colors, colors); this.redraw(); }
  redraw() { this.card.set(this.label, { bg: this.colors.bg, fg: this.colors.fg, border: this.colors.border }); }
  // tipWorld: fingertip in world space; hi = hand index. Pressed when the tip pushes through the face from the front.
  test(tipWorld, dt, hi = 0) {
    if (hi === 0) this.cool = Math.max(0, this.cool - dt);
    if (!this.enabled || !isVisibleChain(this.group)) { this.prev[hi] = null; this.face.position.z = 0; return false; }
    const l = this.group.worldToLocal(tipWorld.clone());
    const inside = Math.abs(l.x) < this.w / 2 + 0.006 && Math.abs(l.y) < this.h / 2 + 0.006 && l.z < 0.05 && l.z > -0.05;
    const prevZ = this.prev[hi];
    this.prev[hi] = inside ? l.z : null;
    if (inside) this.hover[hi] = true; else this.hover[hi] = false;
    this.face.position.z = (this.hover[0] || this.hover[1]) && l.z < 0.02 ? THREE.MathUtils.clamp(l.z - 0.003, -0.005, 0) : 0;
    if (inside && prevZ !== null && prevZ !== undefined && prevZ > 0.003 && l.z <= 0.003 && this.cool <= 0) {
      this.cool = 0.45; this.onPress?.(); return true;
    }
    return false;
  }
  click() { if (this.enabled && this.cool <= 0) { this.cool = 0.3; this.onPress?.(); } }
}
function isVisibleChain(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }

// A panel = backing card + title + grid of buttons
export class Panel {
  constructor(title, wM, hM) {
    this.group = new THREE.Group();
    this.back = new Card(wM, hM, { bg: 'rgba(8,40,30,0.86)' });
    this.back.set('');
    this.back.mesh.position.z = -0.008;
    this.group.add(this.back.mesh);
    this.title = new Card(wM * 0.9, 0.022, { bg: 'rgba(0,0,0,0)', fg: '#ffffff', size: 0.022 * PX_PER_M * 0.62 });
    this.title.set(title); this.title.mesh.position.set(0, hM / 2 - 0.018, 0);
    this.group.add(this.title.mesh);
    this.buttons = []; this.w = wM; this.h = hM;
  }
  setTitle(t) { this.title.set(t); }
  add(btn, x, y) { btn.group.position.set(x, y, 0); this.group.add(btn.group); this.buttons.push(btn); return btn; }
  test(tip, dt) { let p = false; for (const b of this.buttons) p = b.test(tip, dt) || p; return p; }
}

// Ghost hand that demonstrates gestures (walk / pinch / poke). Simple capsule fingers, translucent glow.
export class GhostHand {
  constructor() {
    this.group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x7fffe0, transparent: true, opacity: 0.45, depthWrite: false });
    this.mat = mat;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.055), mat); palm.position.set(0, 0.03, -0.035);
    this.group.add(palm);
    const mk = (len, r = 0.0055) => { const piv = new THREE.Group(); const f = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat); f.position.z = len / 2 + r; f.rotation.x = Math.PI / 2; piv.add(f); return piv; };
    this.index = mk(0.05); this.middle = mk(0.054); this.ring = mk(0.048); this.pinky = mk(0.04, 0.005); this.thumb = mk(0.038, 0.006);
    this.index.position.set(0.016, 0.03, -0.01); this.middle.position.set(0.004, 0.03, -0.008); this.ring.position.set(-0.009, 0.03, -0.01); this.pinky.position.set(-0.021, 0.03, -0.014);
    this.thumb.position.set(0.026, 0.026, -0.04); this.thumb.rotation.y = 0.9;
    this.group.add(this.index, this.middle, this.ring, this.pinky, this.thumb);
    this.mode = 'walk'; this.t = 0; this.group.visible = false;
  }
  show(mode, at) { this.mode = mode; this.anchor = at.clone(); this.group.visible = true; this.t = 0; }
  hide() { this.group.visible = false; }
  update(dt) {
    if (!this.group.visible) return;
    this.t += dt; const t = this.t;
    this.mat.opacity = 0.32 + 0.18 * Math.sin(t * 4);
    const g = this.group; g.position.copy(this.anchor);
    // defaults
    [this.ring, this.pinky].forEach(f => (f.rotation.x = 1.9));
    if (this.mode === 'walk') {
      // index + middle point down and alternate like little legs; hand drifts forward and back
      g.rotation.set(0, Math.PI, 0);
      const s = Math.sin(t * 7);
      this.index.rotation.x = 1.25 + s * 0.35; this.middle.rotation.x = 1.25 - s * 0.35;
      this.thumb.rotation.x = 1.4;
      g.position.z += Math.sin(t * 0.9) * 0.03; g.position.y += 0.005 + Math.abs(s) * 0.003;
    } else if (this.mode === 'pinch') {
      g.rotation.set(0, Math.PI, 0);
      const k = (Math.sin(t * 3) + 1) / 2;
      this.index.rotation.x = 0.6 + k * 0.5; this.middle.rotation.x = 1.6; this.thumb.rotation.x = 0.2 + k * 0.6;
      g.position.y += 0.02 + (1 - k) * 0.02;
    } else if (this.mode === 'poke') {
      g.rotation.set(0, Math.PI, 0);
      const k = Math.max(0, Math.sin(t * 3.2));
      this.index.rotation.x = 0.75; this.middle.rotation.x = 1.9; this.thumb.rotation.x = 1.4;
      g.position.y += 0.035 - k * 0.03; g.position.z += 0.02;
    }
  }
}

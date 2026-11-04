// Koffer-Film 3D: Origami-Diorama mit Three.js, vier Welten und eine Regie.
// Alles ist eine reine Funktion der Zeit t (Sekunden): renderAt(t) zeichnet exakt dieses Bild.
// Dadurch laufen Wiedergabe, Springen und der MP4-Export Bild für Bild synchron zur Musik.
// Zeitachse: Titel 0–5 · Sendung 1 5–17 · Sendung 2 17–29 · Sendung 3 29–41 · Finale 41–51.
import * as THREE from 'three';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from './vendor/jsm/postprocessing/ShaderPass.js';

/* ---------- Zeit-Helfer ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const win = (t, a, b) => clamp((t - a) / (b - a));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const inOut = v => { v = clamp(v); return v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
const outBack = v => { v = clamp(v); const c = 1.9; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
const lerp = (a, b, v) => a + (b - a) * v;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const DURATION = 51;

/* ---------- Farben ---------- */
const C = {
  washi: '#F3EBDA', cream: '#FBF6EA', red: '#C93F2B', redD: '#9E2F20', ind: '#2F4D7E', indD: '#22385E',
  mat: '#7E9C69', matD: '#5D7A4E', gold: '#D7A23A', char: '#3D3F49', stone: '#A8A498', white: '#FBF8F1',
  snow: '#FFFFFF', momiji: '#D2462C', momiji2: '#E07A2E', ginkgo: '#E3B33C', cedar: '#3F6142', sea: '#5F93C8'
};

/* ---------- Papierstruktur (prozedural, einmalig) ---------- */
function paperTexture() {
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = 236 + Math.random() * 19; d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 900; k++) {
    const x = Math.random() * s, y = Math.random() * s, l = 8 + Math.random() * 26, a = Math.random() * Math.PI;
    g.strokeStyle = `rgba(${150 + Math.random() * 60},${140 + Math.random() * 50},${120 + Math.random() * 40},${.05 + Math.random() * .08})`;
    g.lineWidth = .6 + Math.random() * .8; g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * .5 + (Math.random() - .5) * 6, y + Math.sin(a) * l * .5 + (Math.random() - .5) * 6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createFilm(host, opt = {}) {
  const W0 = opt.width || host.clientWidth || 960, H0 = opt.height || Math.round(W0 * 9 / 16);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opt.export, powerPreference: 'high-performance' });
  renderer.setPixelRatio(opt.export ? 1 : Math.min(opt.maxDpr || 2, window.devicePixelRatio || 1));
  renderer.setSize(W0, H0, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cv = renderer.domElement; cv.className = 'kf3-gl'; host.appendChild(cv);
  const ov = document.createElement('canvas'); ov.className = 'kf3-ov'; host.appendChild(ov);
  const og = ov.getContext('2d');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, W0 / H0, .1, 900);
  const tex = paperTexture();
  const mats = {};
  function paper(col, o = {}) {
    const k = col + JSON.stringify(o);
    if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: col, map: tex, bumpMap: tex, bumpScale: 1.2, roughness: .93, metalness: 0, flatShading: true, side: THREE.DoubleSide }, o));
    return mats[k];
  }
  function glow(col, em, k) { return new THREE.MeshStandardMaterial({ color: col, emissive: em, emissiveIntensity: k, roughness: .6, side: THREE.DoubleSide }); }
  function mesh(geo, col, o) { const m = new THREE.Mesh(geo, typeof col === 'string' ? paper(col, o) : col); m.castShadow = true; m.receiveShadow = true; return m; }
  function triGeo(pts) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); return g; }

  /* ---------- Licht, Himmel, Nebel (Stimmung je Szene) ---------- */
  const hemi = new THREE.HemisphereLight('#E9F1FF', '#B49C74', .78); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFE1B4', 3.3); sun.castShadow = true;
  sun.shadow.mapSize.set(opt.export ? 4096 : 2048, opt.export ? 4096 : 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
  const sc = sun.shadow.camera; sc.left = -19; sc.right = 19; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 160;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#BFD3FF', .55); scene.add(rim, rim.target);
  const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: V(-.5, .35, -.8).normalize() }, sunCol: { value: new THREE.Color() }, stars: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyU, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top,mid,bot,sunCol,sunDir; uniform float stars; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){ float y=vP.y; vec3 c=mix(bot,mid,smoothstep(-.02,.2,y)); c=mix(c,top,smoothstep(.2,.75,y));
        float s=max(dot(normalize(vP),normalize(sunDir)),0.); c+=sunCol*(pow(s,40.)*.9+pow(s,6.)*.25);
        if(stars>0.){ vec3 q=floor(vP*260.); float r=h(q); c+=vec3(1.,.97,.9)*step(.9975,r)*stars*smoothstep(.05,.3,y)*(.5+.5*h(q+1.)); }
        gl_FragColor=vec4(c,1.); }`
  }));
  scene.add(sky);
  scene.fog = new THREE.Fog('#EFD9BA', 75, 280);
  const PAL = {
    morning: { top: '#4F86C6', mid: '#A7CBE8', bot: '#F7DDB2', sun: '#FFD596', fog: ['#EFD9BA', 75, 280], hemi: ['#E9F1FF', '#B49C74', .78], light: ['#FFE1B4', 3.3], exp: .95, bloom: [.32, .55, .86], stars: 0 },
    golden:  { top: '#3D72BA', mid: '#9EC1E3', bot: '#F6CB93', sun: '#FFC772', fog: ['#F2D8B6', 85, 290], hemi: ['#FFF0DC', '#A8936E', .8], light: ['#FFD199', 3.4], exp: .96, bloom: [.36, .6, .84], stars: 0 },
    night:   { top: '#0A1230', mid: '#18244D', bot: '#2E3A68', sun: '#C9D6FF', fog: ['#151D3A', 55, 230], hemi: ['#7084C8', '#1A1C2C', .5], light: ['#AFC4FF', 1.25], exp: 1.05, bloom: [.72, .6, .66], stars: 1 },
    sunrise: { top: '#6C8FD4', mid: '#F2B58C', bot: '#FFD9A8', sun: '#FFCF8A', fog: ['#F4CFA6', 60, 240], hemi: ['#FFF0DD', '#C29A74', .85], light: ['#FFD3A0', 3.0], exp: .95, bloom: [.45, .6, .82], stars: 0 }
  };
  let bloom;
  function palette(p) {
    skyU.top.value.set(p.top); skyU.mid.value.set(p.mid); skyU.bot.value.set(p.bot); skyU.sunCol.value.set(p.sun); skyU.stars.value = p.stars;
    scene.fog.color.set(p.fog[0]); scene.fog.near = p.fog[1]; scene.fog.far = p.fog[2];
    hemi.color.set(p.hemi[0]); hemi.groundColor.set(p.hemi[1]); hemi.intensity = p.hemi[2];
    sun.color.set(p.light[0]); sun.intensity = p.light[1]; renderer.toneMappingExposure = p.exp;
    if (bloom) { bloom.strength = p.bloom[0]; bloom.radius = p.bloom[1]; bloom.threshold = p.bloom[2]; }
  }

  /* ---------- Welten ---------- */
  const worlds = [0, 300, 600, 900].map(ox => { const g = new THREE.Group(); g.position.x = ox; scene.add(g); return g; });
  let cur = worlds[0];
  const pops = [];
  function popup(x, z, t0, dur = .9, rotY = 0) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0, z); pivot.rotation.y = rotY;
    const inner = new THREE.Group(); pivot.add(inner); cur.add(pivot);
    pops.push({ inner, t0, dur }); return inner;
  }
  function box(w, h, d, col, x = 0, y = 0, z = 0) { const m = mesh(new THREE.BoxGeometry(w, h, d), col); m.position.set(x, y + h / 2, z); return m; }
  function windows(group, w, h, d, rows, cols, k, col = '#F6D99A', em = '#FFC56A') {
    const mat = glow(col, em, k);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if ((r * 7 + c * 3) % 5 === 0) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w * .12, h * .05), mat);
      m.position.set(-w * .35 + c * (w * .7 / Math.max(1, cols - 1)), h * .15 + r * (h * .7 / Math.max(1, rows - 1)), d / 2 + .01); group.add(m);
    }
    return mat;
  }
  function roof(r, h, col) { const m = mesh(new THREE.ConeGeometry(r, h, 4, 1), col); m.rotation.y = Math.PI / 4; return m; }
  function tree(col, s = 1, kind = 'round') {
    const g = new THREE.Group(); g.add(box(.18 * s, 1 * s, .18 * s, C.char));
    if (kind === 'cedar') for (let i = 0; i < 4; i++) { const c = mesh(new THREE.ConeGeometry((1.15 - i * .24) * s, 1.6 * s, 7), col); c.position.y = (1.3 + i * .85) * s; g.add(c); }
    else { const c = mesh(new THREE.IcosahedronGeometry(.95 * s, 0), col); c.position.y = 1.55 * s; c.scale.set(1, .85, 1); g.add(c); }
    return g;
  }
  function torii(s = 1) {
    const g = new THREE.Group();
    [-1, 1].forEach(k => { const p = mesh(new THREE.CylinderGeometry(.13 * s, .16 * s, 2.6 * s, 8), C.red); p.position.set(k * .95 * s, 1.3 * s, 0); g.add(p); });
    const nuki = mesh(new THREE.BoxGeometry(2.4 * s, .16 * s, .18 * s), C.red); nuki.position.y = 2.05 * s; g.add(nuki);
    const kasa = mesh(new THREE.BoxGeometry(3 * s, .2 * s, .32 * s), C.char); kasa.position.y = 2.62 * s; g.add(kasa);
    const kasa2 = mesh(new THREE.BoxGeometry(2.7 * s, .14 * s, .26 * s), C.red); kasa2.position.y = 2.48 * s; g.add(kasa2);
    return g;
  }
  function signTexture(txt, bg, fg, w = 256, h = 64, font = 'bold 40px "Hiragino Sans","Noto Sans JP",sans-serif', vertical = false) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (vertical) { const ch = [...txt], step = h / (ch.length + .6); ch.forEach((x, i) => g.fillText(x, w / 2, step * (i + .8))); } else g.fillText(txt, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function sign(txt, w, h, bg, fg, opts = {}) {
    const tx = signTexture(txt, bg, fg, opts.pw || 512, opts.ph || Math.round(512 * h / w), opts.font || `bold ${Math.round((opts.ph || 512 * h / w) * .55)}px "Helvetica Neue","Hiragino Sans",Arial,sans-serif`, opts.vertical);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), opts.glow ? new THREE.MeshStandardMaterial({ map: tx, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: opts.glow, roughness: .6 }) : new THREE.MeshStandardMaterial({ map: tx, roughness: .8 }));
  }
  function ground(o) {
    const g = new THREE.PlaneGeometry(300, 120, 150, 60); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = [], cA = new THREE.Color(o.c[0]), cB = new THREE.Color(o.c[1]), cC = new THREE.Color(o.c[2]), cR = new THREE.Color(o.c[3]), tmp = new THREE.Color();
    const tri = u => Math.abs((u % 1 + 1) % 1 - .5) * 2;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), far = smooth(win(Math.abs(z - 1), 9, 26));
      const h = far * (2.6 * tri(x * .045 + z * .021 + o.seed) + 1.6 * tri(x * .09 - z * .05 + .3)) * (z < 0 ? o.hill : .6);
      p.setY(i, h - .02);
      const road = 1 - smooth(win(Math.abs(z + 5.5), .7, 1.4));
      tmp.copy(cA).lerp(cB, far).lerp(cC, clamp(h / 4)); tmp.lerp(cR, road * .9);
      col.push(tmp.r, tmp.g, tmp.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, bumpMap: tex, bumpScale: 1, roughness: .95, flatShading: true }));
    m.receiveShadow = true; cur.add(m);
    // Felder
    const cells = [], pal = o.fields.map(c => new THREE.Color(c));
    for (let x = -46; x <= 46; x += 3.3) for (let z = -13; z <= 22; z += 2.7) {
      if (z > -7.2 && z < -3.8) continue;
      if (o.skip.some(([cx, cz, rx, rz]) => Math.abs(x - cx) < rx && Math.abs(z - cz) < rz)) continue;
      if ((x * 7 + z * 13) % 5 < 1) continue;
      cells.push([x + Math.sin(x * z) * .25, z + Math.cos(x + z) * .2]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1, roughness: .95, flatShading: true }), cells.length);
    const ob = new THREE.Object3D();
    cells.forEach((c, i) => { ob.position.set(c[0], .03, c[1]); ob.rotation.set(0, Math.sin(i * 3.7) * .06, 0); ob.scale.set(2.9, .05 + (i % 3) * .02, 2.3); ob.updateMatrix(); im.setMatrixAt(i, ob.matrix); im.setColorAt(i, pal[(i * 5 + (i >> 2)) % pal.length]); });
    im.receiveShadow = true; cur.add(im);
    if (o.river) {
      const river = new THREE.CatmullRomCurve3([V(-60, 0, 14), V(-30, 0, 11.5), V(-8, 0, 16.5), V(12, 0, 12), V(34, 0, 15.5), V(60, 0, 13)]);
      const pts = river.getSpacedPoints(160), pos = [], idx = [];
      pts.forEach((pp, i) => { const tg = river.getTangentAt(i / 160), n = V(-tg.z, 0, tg.x).multiplyScalar(1.1 + Math.sin(i * .2) * .25); pos.push(pp.x + n.x, .09, pp.z + n.z, pp.x - n.x, .09, pp.z - n.z); if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i); });
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
      const rv = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: o.river, emissive: '#3F6FA8', emissiveIntensity: .18, roughness: .35, side: THREE.DoubleSide })); rv.receiveShadow = true; cur.add(rv);
    }
  }
  function plate(x, z, w, d, col, y = .03) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, .06, d), new THREE.MeshStandardMaterial({ color: col, map: tex, roughness: .95 })); m.receiveShadow = true; m.position.set(x, y, z); cur.add(m); return m; }
  function cloudsFor(list, col = '#FFFDF7') {
    const cm = paper(col), clouds = new THREE.Group(); cur.add(clouds);
    list.forEach(([x, y, z, k]) => {
      const g = new THREE.Group(); [[0, 0, 0, 3.2], [3.4, -.4, .5, 2.4], [-3.2, -.6, -.3, 2.2], [1.2, 1.2, -.6, 2.3]].forEach(([a, b, c, r]) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cm); m.position.set(a, b, c); m.scale.y = .62; g.add(m); });
      g.position.set(x, y, z); g.scale.setScalar(k); clouds.add(g); });
    return clouds;
  }
  function stoneLantern(k) {
    const g = new THREE.Group(); g.add(box(.36, .5, .36, C.stone)); g.add(box(.18, .5, .18, C.stone, 0, .5));
    const lm = glow('#FFE3A0', '#FFB648', k); const l = new THREE.Mesh(new THREE.BoxGeometry(.42, .38, .42), lm); l.position.y = 1.2; g.add(l);
    const r = roof(.44, .32, C.char); r.position.y = 1.55; g.add(r); g.userData.mat = lm; return g;
  }
  function castle(tiers, base, wall, roofCol, emissive = 0) {
    const g = new THREE.Group(); const b = mesh(new THREE.CylinderGeometry(base * .82, base, 1.7, 4), C.stone); b.rotation.y = Math.PI / 4; b.position.y = .85; g.add(b);
    let y = 1.7; const wm = emissive ? glow(wall, '#FFF3D8', emissive) : wall;
    tiers.forEach((w, i) => { const hgt = 1.45 - i * .12; const wl = mesh(new THREE.BoxGeometry(w, hgt, w), wm); wl.position.y = y + hgt / 2; g.add(wl); y += hgt;
      const r = roof(w * .95, .95, roofCol); r.position.y = y + .3; r.scale.y = .7; g.add(r); y += .45; });
    [-1, 1].forEach(k => { const s = mesh(new THREE.ConeGeometry(.09, .45, 5), C.gold); s.position.set(k * .35, y + .25, 0); s.rotation.z = k * .5; g.add(s); });
    return g;
  }
  function building(gx, gz, t0, w, h, d, col, k = .15, signOpt) {
    const g = popup(gx, gz, t0, .8); g.add(box(w, h, d, col)); const m = windows(g, w, h, d, Math.max(2, Math.round(h / 1.1)), Math.max(2, Math.round(w / 1.2)), k);
    if (signOpt) { const s = sign(signOpt.txt, signOpt.w || w * .7, signOpt.h || .46, signOpt.bg, signOpt.fg, signOpt); s.position.set(signOpt.x || 0, signOpt.y || h + .32, d / 2 + .03); if (signOpt.side) { s.position.set(w / 2 + .05, signOpt.y || h * .6, 0); s.rotation.y = Math.PI / 2; } g.add(s); }
    return { g, m };
  }

  /* =================================================================
     WELT 1 · Titel + Sendung 1: Tokio → Kyōto (Morgen)
     ================================================================= */
  cur = worlds[0];
  ground({ c: ['#E7E2C6', '#B9C99E', '#93AC7E', '#EFE4CB'], fields: ['#DCE5C4', '#C9D9A9', '#E9DFB8', '#DCCB92', '#B7CB95', '#E6E9CF'], seed: 0, hill: 1.5, river: '#6E9FD0',
    skip: [[-29, 0, 11, 9], [30, .5, 11, 9.5], [-7, -8, 4.5, 3]] });
  plate(-29.5, 0, 24, 15, '#D9D1BF'); plate(-29.5, 5.2, 24, 1.3, '#8C8884', .05); plate(-21.5, 0, 1.3, 15, '#8C8884', .055);
  for (let i = 0; i < 9; i++) plate(-41 + i * 2.6, 5.2, 1.1, .32, '#F4F0E6', .075);
  for (let i = 0; i < 5; i++) plate(-21.5, 3.6 + i * .5, 1.05, .22, '#F4F0E6', .08);
  plate(30, 0, 24, 15, '#E8DCC0');
  { const st = new THREE.InstancedMesh(new THREE.CylinderGeometry(.42, .46, .08, 7), paper('#C9BB98'), 26), o = new THREE.Object3D();
    for (let i = 0; i < 26; i++) { const u = i / 25; o.position.set(lerp(23.5, 33.5, u) + Math.sin(i * 1.3) * .35, .1, lerp(1.2, 5.8, Math.sin(u * Math.PI)) + Math.cos(i * 2.1) * .3); o.rotation.y = i; o.updateMatrix(); st.setMatrixAt(i, o.matrix); }
    st.receiveShadow = true; cur.add(st); }
  const clouds1 = cloudsFor([[-60, 30, -70, 1.6], [-20, 34, -90, 2.2], [25, 29, -75, 1.7], [60, 33, -85, 2], [5, 24, -48, 1.1], [-40, 22, -45, 1], [45, 24, -50, 1.2]]);
  const glow1 = [];
  [[-36, -4, 2.2, 6.5, 2.2, C.ind], [-33.4, -5, 1.8, 9, 1.8, C.white], [-31, -3.2, 2.4, 5, 2, C.ind], [-37.5, 1, 2, 4, 2, C.white],
   [-28.4, -4.4, 2, 7.5, 2, C.white], [-26, -6, 2.6, 6, 2, C.ind], [-34.5, 3, 1.6, 3, 1.6, C.mat], [-22.5, -3, 2, 4.4, 2, C.white]].forEach((b, i) => glow1.push(building(b[0], b[1], 5.05 + i * .07, b[2], b[3], b[4], b[5]).m));
  { const g = popup(-30.8, -1.6, 5.2, 1);
    const t = mesh(new THREE.CylinderGeometry(.22, .95, 15, 6), C.white); t.position.y = 7.5; g.add(t);
    [[5.2, .78], [9.6, .55]].forEach(r => { const d = mesh(new THREE.CylinderGeometry(r[1] + .25, r[1] + .25, .55, 10), C.red); d.position.y = r[0]; g.add(d); });
    const a = mesh(new THREE.CylinderGeometry(.04, .07, 2.6, 5), C.char); a.position.y = 16.3; g.add(a); }
  { const g = popup(-25.5, 3.4, 5.6, .8);
    g.add(box(3.2, 1.9, 2.2, C.white));
    const s1 = mesh(new THREE.BoxGeometry(3.24, .22, 2.24), C.mat); s1.position.y = 1.62; g.add(s1);
    const s2 = mesh(new THREE.BoxGeometry(3.24, .1, 2.24), C.gold); s2.position.y = 1.44; g.add(s2);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .9), glow('#CFE3F2', '#FFE7B5', .35)); glass.position.set(.55, .62, 1.111); g.add(glass);
    const door = mesh(new THREE.PlaneGeometry(.7, 1.1), C.indD); door.position.set(-.9, .55, 1.112); g.add(door);
    const sg = sign('コンビニ', 1.6, .4, '#FBF8F1', '#2A2D35', { font: 'bold 70px "Hiragino Sans","Noto Sans JP",sans-serif', ph: 128 }); sg.position.set(0, 2.25, 1.0); g.add(sg);
    const post = mesh(new THREE.BoxGeometry(.06, .5, .06), C.char); post.position.set(0, 1.95, 1.0); g.add(post); }
  for (let i = 0; i < 6; i++) { const g = popup(-38 + i * 2.6, 6.2 + (i % 2) * .8, 5.3 + i * .06, .7); g.add(tree(i % 2 ? C.ginkgo : '#D9A83A', .7)); }
  { const g = popup(-8, -50, 8.7, 1.3);
    const geo = new THREE.ConeGeometry(17, 13.5, 9, 3); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 6.5 && y > -6.5) { p.setX(i, p.getX(i) * (1 + Math.sin(i * 12.9) * .05)); p.setZ(i, p.getZ(i) * (1 + Math.cos(i * 7.3) * .05)); } }
    geo.computeVertexNormals(); const f = mesh(geo, '#3F5F92'); f.position.y = 6.75; g.add(f);
    const cap = mesh(new THREE.ConeGeometry(4.6, 3.66, 9, 1), C.snow); cap.position.y = 11.7; g.add(cap);
    g.parent.scale.setScalar(1.3); }
  const steam = [];
  { const ONSEN = V(-6.5, 0, -8.6), g = popup(ONSEN.x, ONSEN.z, 9.4, .7);
    const rim2 = mesh(new THREE.CylinderGeometry(1.5, 1.6, .3, 10), C.stone); rim2.position.y = .15; g.add(rim2);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, .05, 20), glow('#79A9D6', '#4C7DB5', .25)); water.position.y = .31; g.add(water);
    const sm = new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: .55, roughness: 1, depthWrite: false });
    for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 0), sm.clone()); g.add(s); steam.push(s); }
    const ry = popup(ONSEN.x - 3.2, ONSEN.z - 1.4, 9.5, .8); ry.add(box(2.6, 1.3, 1.8, C.washi)); const r = roof(2.2, 1, C.char); r.position.y = 1.8; r.scale.set(1, .55, .75); ry.add(r); }
  { const g = popup(31, -2, 11.6, 1.1); let y = 0;
    for (let i = 0; i < 5; i++) { const w = 2.2 - i * .3; g.add(box(w, 1.1, w, C.red, 0, y, 0)); y += 1.1; const r = roof(w * 1.15, .9, C.char); r.position.y = y + .3; g.add(r); y += .5; }
    const sp = mesh(new THREE.CylinderGeometry(.06, .06, 2.4, 6), C.gold); sp.position.y = y + 1; g.add(sp); }
  { const g = popup(34.5, 3.6, 12.0, .9); g.add(torii(1.1)); }
  glow1.push(building(23.2, -2.2, 11.8, 4.4, 3.2, 2.6, C.white, .2, { txt: 'HOTEL TAVINOS', w: 2.6, h: .46, bg: '#C93F2B', fg: '#FFFFFF', y: 3.5 }).m);
  [[28.5, -5, 1], [36, -3, .9], [35.5, 7, .8], [38, 2, 1], [22, -6, .9], [40, -2, .8], [26, -7, .8]].forEach((p, i) => { const g = popup(p[0], p[1], 11.9 + i * .07, .8); g.add(tree(i % 3 === 2 ? C.momiji2 : C.momiji, p[2])); });
  // Titelkarte
  const card = new THREE.Group(); cur.add(card);
  const CARD = V(-30, 7.2, 12);
  const cardTex = (() => {
    const w = 1600, h = 1000, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#FCF8EE'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(180,150,100,.35)'; g.lineWidth = 3; g.strokeRect(40, 40, w - 80, h - 80);
    g.fillStyle = '#2A2D35'; g.textAlign = 'center';
    g.font = '600 260px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif'; g.fillText('宅急便', w / 2, 470);
    g.fillStyle = '#C93F2B'; g.font = '600 92px "Hiragino Mincho ProN","Yu Mincho",Georgia,serif'; g.fillText('Die Reise eurer Koffer', w / 2, 650);
    g.fillStyle = '#6A6D75'; g.font = '500 44px -apple-system,"Helvetica Neue",Arial,sans-serif'; g.fillText('drei Sendungen  ·  gefaltet aus Papier', w / 2, 760);
    g.fillStyle = '#C93F2B'; g.fillRect(1300, 110, 170, 170); g.fillStyle = '#fff'; g.font = '700 120px "Hiragino Mincho ProN",serif'; g.fillText('旅', 1385, 240);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const cardFace = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshStandardMaterial({ map: cardTex, roughness: .9, side: THREE.DoubleSide })); cardFace.castShadow = true; card.add(cardFace);
  const flaps = [];
  [['t', 0, 2.5], ['b', 0, -2.5], ['l', -4, 0], ['r', 4, 0]].forEach(([k, x, y]) => {
    const hinge = new THREE.Group(); hinge.position.set(x, y, .01); card.add(hinge);
    const tg = k === 't' ? triGeo([[-4, 0, 0], [4, 0, 0], [0, -2.5, 0]]) : k === 'b' ? triGeo([[-4, 0, 0], [0, 2.5, 0], [4, 0, 0]]) : k === 'l' ? triGeo([[0, 2.5, 0], [0, -2.5, 0], [4, 0, 0]]) : triGeo([[0, 2.5, 0], [-4, 0, 0], [0, -2.5, 0]]);
    const m = new THREE.Mesh(tg, paper('#EADDC0')); m.castShadow = true; hinge.add(m); flaps.push({ k, hinge }); });

  /* =================================================================
     WELT 2 · Sendung 2: Ōsaka → Kōyasan → Hiroshima (goldener Nachmittag)
     ================================================================= */
  cur = worlds[1];
  ground({ c: ['#EDE3C8', '#B8C893', '#8FA770', '#F0E2C4'], fields: ['#DCE3B8', '#CBD7A2', '#EADFB3', '#E0C98F', '#BFCF96', '#EFE6C8'], seed: .37, hill: 1.6, river: '#6A97C6',
    skip: [[-29, 0, 11, 9], [32, .5, 13, 11], [-4, -9, 11, 4]] });
  plate(-29.5, 0, 24, 15, '#D8CDB6'); plate(-29.5, 5.2, 24, 1.3, '#8C8884', .05);
  plate(27, 0, 18, 15, '#E6DCC4');
  for (let i = 0; i < 9; i++) plate(-41 + i * 2.6, 5.2, 1.1, .32, '#F4F0E6', .075);
  { const canal = new THREE.Mesh(new THREE.BoxGeometry(26, .05, 2.2), glow('#5B8CC0', '#3D6DA6', .2)); canal.position.set(-29, .08, 8.2); canal.receiveShadow = true; cur.add(canal);
    const br = mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.6, 16, 1, true, -Math.PI / 2 - .7, 1.4), C.red); br.rotation.z = Math.PI / 2; br.position.set(-27, -1.55, 8.2); br.scale.set(1, 1, .6); cur.add(br); }
  const clouds2 = cloudsFor([[-55, 28, -72, 1.6], [-15, 32, -88, 2.1], [30, 27, -70, 1.6], [62, 31, -82, 1.9], [8, 22, -46, 1.1]], '#FFF3E2');
  const glow2 = [];
  { const g = popup(-33, -5, 17.1, 1.1); g.add(castle([4.4, 3.4, 2.4], 3.6, C.white, '#5C8A6A')); g.parent.scale.setScalar(1.2); }
  glow2.push(building(-24.6, -2.5, 17.35, 4, 4.6, 2.6, C.white, .25, { txt: 'BRIDGE HOTEL', w: 2.6, h: .46, bg: '#2F4D7E', fg: '#FFFFFF', y: 4.95 }).m);
  [[-38, 1, 2, 5, 2, '#E9D4B8'], [-29, -6.5, 2.2, 6, 2, C.ind], [-21.5, -4.5, 2, 3.6, 2, '#E9D4B8'], [-37, -7, 2.2, 7, 2, C.white]].forEach((b, i) => glow2.push(building(b[0], b[1], 17.2 + i * .08, b[2], b[3], b[4], b[5]).m));
  [['たこ焼', '#FF5A7A'], ['道頓堀', '#FFD34F']].forEach(([txt, c], i) => { const g = popup(-35.5 + i * 7.2, 5.9, 17.5 + i * .1, .7); const s = sign(txt, .7, 2, c, '#2A2D35', { vertical: true, pw: 128, ph: 360, font: 'bold 84px "Hiragino Sans","Noto Sans JP",sans-serif', glow: .6 }); s.position.y = 1.6; g.add(s); const p = mesh(new THREE.BoxGeometry(.08, 1.2, .08), C.char); p.position.y = .6; g.add(p); });
  // Kōyasan: Zedernwald, Tor, Laternenweg
  for (let i = 0; i < 26; i++) { const x = -14 + (i % 9) * 2.4 + Math.sin(i * 3.1) * .7, z = -12.5 + Math.floor(i / 9) * 2.1 + Math.cos(i * 1.7) * .4; const g = popup(x, z, 20.3 + (i % 9) * .05 + Math.floor(i / 9) * .08, .8); g.add(tree(i % 4 ? C.cedar : '#4A6E48', 1.15 + (i % 3) * .2, 'cedar')); }
  { const g = popup(-3.5, -7.6, 20.6, 1); g.add(box(.5, 3.4, .5, C.redD, -1.6)); g.add(box(.5, 3.4, .5, C.redD, 1.6)); g.add(box(4.2, 1.2, 1.4, C.red, 0, 2.2, 0));
    const r = roof(3.6, 1.2, C.char); r.position.y = 4.0; r.scale.set(1.15, .7, .6); g.add(r); const r2 = roof(2.6, 1, C.char); r2.position.y = 5.0; r2.scale.set(1.1, .7, .55); g.add(r2); }
  const lanterns2 = [];
  for (let i = 0; i < 11; i++) { const g = popup(-19 + i * 2.1, -4.2, 20.2 + i * .05, .6); const l = stoneLantern(1.2); g.add(l); lanterns2.push(l.userData.mat); }
  // Hiroshima am Meer
  { const sea = new THREE.Mesh(new THREE.BoxGeometry(40, .05, 70), glow(C.sea, '#3C6EA8', .2)); sea.position.set(55, .1, 0); sea.receiveShadow = true; cur.add(sea);
    const g = popup(40, -2, 23.9, 1); g.add(torii(1.7));
    const isl = mesh(new THREE.ConeGeometry(9, 6, 7), '#5E7E55'); isl.position.set(58, 3, -16); cur.add(isl); }
  glow2.push(building(23.4, -2.2, 23.6, 4.6, 5.2, 2.8, '#F1ECE2', .25, { txt: 'DORMY INN', w: 2.8, h: .5, bg: '#22385E', fg: '#FFFFFF', y: 5.55 }).m);
  [[28.5, -5.5, .9], [36, -6, .8], [21, -6.5, .85], [31.5, -7, .7]].forEach((p, i) => { const g = popup(p[0], p[1], 23.8 + i * .07, .8); g.add(tree(i % 2 ? C.momiji2 : C.momiji, p[2])); });

  /* =================================================================
     WELT 3 · Sendung 3: Hiroshima → Himeji → Tokio (Nacht)
     ================================================================= */
  cur = worlds[2];
  ground({ c: ['#B9B6A6', '#8D9A7C', '#6F7F62', '#C7C0AA'], fields: ['#A9B08F', '#9EA886', '#B8B496', '#A59C78', '#93A07F', '#BDBBA2'], seed: .71, hill: 1.7, river: '#4F78A8',
    skip: [[-29, 0, 11, 9], [30, .5, 11, 9.5], [2, -11, 9, 5]] });
  const clouds3 = cloudsFor([[-55, 26, -70, 1.5], [20, 30, -85, 2], [55, 25, -66, 1.4]], '#8C93B8');
  const glow3 = [];
  { const sea = new THREE.Mesh(new THREE.BoxGeometry(40, .05, 70), glow('#36598C', '#28477A', .35)); sea.position.set(-57, .1, 0); sea.receiveShadow = true; cur.add(sea);
    const g = popup(-41, -1.5, 29.15, .9); g.add(torii(1.6));
    for (let k = -1; k <= 1; k += 2) { const l = new THREE.PointLight('#FFB45A', 6, 14, 1.6); l.position.set(-41 + k * 2.2, 1.2, 1.2); cur.add(l); } }
  glow3.push(building(-26, -2.5, 29.2, 4.6, 5.2, 2.8, '#E9E4DA', 1.3, { txt: 'DORMY INN', w: 2.8, h: .5, bg: '#22385E', fg: '#FFFFFF', y: 5.55, glow: .7 }).m);
  [[-33, -6.5, 2.2, 5, 2, '#C9C3B4'], [-20.5, -5.5, 2, 3.4, 2, '#D9D3C4'], [-36, 1.5, 2, 3.5, 2, '#C9C3B4']].forEach((b, i) => glow3.push(building(b[0], b[1], 29.25 + i * .07, b[2], b[3], b[4], b[5], 1.2).m));
  plate(-29.5, 0, 24, 15, '#9E998C'); plate(-29.5, 5.2, 24, 1.3, '#5E5C5C', .05);
  const deer = [];
  [[-22.6, 6.2, .3], [-24.2, 6.9, -2.6]].forEach(([x, z, r], i) => { const g = popup(x, z, 29.6 + i * .1, .6, r);
    const b = mesh(new THREE.BoxGeometry(.9, .42, .34), '#A9774B'); b.position.y = .82; g.add(b);
    [[-.32, .14], [.32, .14], [-.32, -.14], [.32, -.14]].forEach(([a, c]) => { const l = mesh(new THREE.BoxGeometry(.08, .64, .08), '#7A5232'); l.position.set(a, .32, c); g.add(l); });
    const n = mesh(new THREE.BoxGeometry(.2, .5, .2), '#A9774B'); n.position.set(.48, 1.12, 0); n.rotation.z = -.35; g.add(n);
    const hd = mesh(new THREE.BoxGeometry(.34, .2, .2), '#9A6A40'); hd.position.set(.66, 1.38, 0); g.add(hd);
    [-1, 1].forEach(k => { const a = mesh(new THREE.BoxGeometry(.04, .32, .04), '#E8D9B8'); a.position.set(.6, 1.6, k * .08); a.rotation.x = k * .4; g.add(a); }); deer.push(g); });
  const lant3 = [];
  [[-17.5, 1.2], [-17.5, 6.2], [-31, 6.8], [-35.5, -1]].forEach(([x, z], i) => { const g = popup(x, z, 29.4 + i * .05, .6); const l = stoneLantern(2.2); g.add(l); lant3.push(l.userData.mat); });
  { const g = popup(2, -13, 32.1, 1.3); g.add(castle([5.2, 4.3, 3.4, 2.5, 1.7], 4.4, '#F7F4EC', '#8B95A8', .03)); g.parent.scale.setScalar(1.35);
    for (let k = -1; k <= 1; k += 2) { const l = new THREE.SpotLight('#FFF1D6', 22, 40, .5, .6, 1.2); l.position.set(2 + k * 7, 1, -4); l.target.position.set(2, 6, -13); cur.add(l, l.target); } }
  // Shinkansen auf Schienen
  { const rail = mesh(new THREE.BoxGeometry(110, .14, 1.1), '#7D7B78'); rail.position.set(0, .12, -5.4); rail.castShadow = false; cur.add(rail); }
  const train = new THREE.Group(); cur.add(train);
  { const bodyM = paper('#F6F6F2'), stripeM = glow('#2E62B5', '#2E62B5', .6), winM = glow('#FFE7B8', '#FFC870', 2.2);
    for (let i = 0; i < 4; i++) { const car = new THREE.Group(); car.position.x = -i * 4.3; train.add(car);
      const b = mesh(new THREE.BoxGeometry(4.1, 1.05, 1.0), bodyM); b.position.y = .82; car.add(b);
      const s = new THREE.Mesh(new THREE.BoxGeometry(4.12, .1, 1.02), stripeM); s.position.y = .55; car.add(s);
      for (let k = 0; k < 7; k++) [-1, 1].forEach(sd => { const w = new THREE.Mesh(new THREE.PlaneGeometry(.36, .22), winM); w.position.set(-1.6 + k * .53, 1.0, sd * .505); w.rotation.y = sd < 0 ? Math.PI : 0; car.add(w); });
      if (i === 0) { const nose = mesh(new THREE.ConeGeometry(.56, 2.2, 6), bodyM); nose.rotation.z = -Math.PI / 2; nose.scale.set(1, 1, .9); nose.position.set(3.15, .78, 0); car.add(nose); }
      if (i === 3) { const tail = mesh(new THREE.ConeGeometry(.56, 1.6, 6), bodyM); tail.rotation.z = Math.PI / 2; tail.position.set(-2.85, .78, 0); car.add(tail); } } }
  // Tokio-Kanda bei Nacht mit Neon
  plate(30, 0, 24, 15, '#8F8B84'); plate(30, 5.2, 24, 1.3, '#4F4E50', .05);
  for (let i = 0; i < 9; i++) plate(19 + i * 2.6, 5.2, 1.1, .32, '#E8E2D2', .075);
  glow3.push(building(23.4, -2.2, 35.6, 4.6, 5.6, 2.8, '#E9E4DA', 1.3, { txt: 'DORMY INN KANDA', w: 3.4, h: .5, bg: '#22385E', fg: '#FFFFFF', y: 5.95, glow: .8 }).m);
  [[29, -5, 2.2, 8, 2, '#5A6285'], [33.5, -3, 2.4, 6, 2, '#6B6F8A'], [37, 1, 2, 4.6, 2, '#5A6285'], [19.5, -5.5, 2, 6.4, 2, '#6B6F8A'], [31.2, 1.8, 1.8, 3.4, 1.8, '#7C7F98']].forEach((b, i) => glow3.push(building(b[0], b[1], 35.7 + i * .07, b[2], b[3], b[4], b[5], 1.25).m));
  [['アキバ', '#FF4FA3', 29.9, -3.9, 5.2], ['ラーメン', '#4FE3FF', 34.75, -1.9, 4], ['カラオケ', '#FFD34F', 20.55, -4.4, 4.6], ['ゲーム', '#9B7BFF', 38.05, 2.1, 3.3]].forEach(([txt, c, x, z, y], i) => {
    const g = popup(x, z, 35.9 + i * .08, .7); const s = sign(txt, .66, 2.3, '#141826', c, { vertical: true, pw: 128, ph: 440, font: 'bold 92px "Hiragino Sans","Noto Sans JP",sans-serif', glow: 2.4 }); s.position.set(0, y - 1.2, 0); g.add(s);
    const l = new THREE.PointLight(c, 5, 9, 1.8); l.position.set(0, y - 1.2, .8); g.add(l); });

  /* =================================================================
     WELT 4 · Finale: Papierinsel über dem Wolkenmeer (Sonnenaufgang)
     ================================================================= */
  cur = worlds[3];
  { const isl = mesh(new THREE.CylinderGeometry(17, 15.5, 2.4, 40), '#F3EAD6'); isl.position.y = -1.2; cur.add(isl);
    const top = new THREE.Mesh(new THREE.CircleGeometry(16.6, 48), new THREE.MeshStandardMaterial({ color: '#E7E0C4', map: tex, roughness: .95 })); top.rotation.x = -Math.PI / 2; top.position.y = .01; top.receiveShadow = true; cur.add(top);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9.5, 10.2, 48), paper('#D8C9A3')); ring.rotation.x = -Math.PI / 2; ring.position.y = .03; cur.add(ring);
    const cm = paper('#FFF6EA');
    for (let i = 0; i < 46; i++) { const a = i * 2.39996, r = 20 + (i % 7) * 6 + Math.sin(i) * 3; const c = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + (i % 4), 1), cm); c.position.set(Math.cos(a) * r, -3.2 - (i % 3), Math.sin(a) * r); c.scale.y = .45; cur.add(c); } }
  const LM = [
    g => { const t = mesh(new THREE.CylinderGeometry(.18, .7, 9, 6), C.white); t.position.y = 4.5; g.add(t); const d = mesh(new THREE.CylinderGeometry(.85, .85, .4, 10), C.red); d.position.y = 3.3; g.add(d); },
    g => { const f = mesh(new THREE.ConeGeometry(3.4, 3.2, 9), '#3F5F92'); f.position.y = 1.6; g.add(f); const c = mesh(new THREE.ConeGeometry(1.1, 1.05, 9), C.snow); c.position.y = 2.68; g.add(c); },
    g => { let y = 0; for (let i = 0; i < 4; i++) { const w = 1.5 - i * .22; g.add(box(w, .75, w, C.red, 0, y, 0)); y += .75; const r = roof(w * 1.15, .6, C.char); r.position.y = y + .2; g.add(r); y += .34; } },
    g => { g.add(castle([2.6, 2, 1.4], 2.2, C.white, '#5C8A6A')); g.scale.setScalar(.8); },
    g => { [-.9, 0, .9].forEach((x, i) => { const c = tree(C.cedar, .8 + (i % 2) * .2, 'cedar'); c.position.x = x; g.add(c); }); },
    g => { g.add(torii(1.1)); },
    g => { g.add(castle([2.8, 2.2, 1.7, 1.2], 2.4, '#F7F4EC', '#8B95A8')); g.scale.setScalar(.75); }
  ];
  LM.forEach((f, i) => { const a = -Math.PI / 2 + i / LM.length * Math.PI * 2 + .3, g = popup(Math.cos(a) * 12.6, Math.sin(a) * 12.6, 41.25 + i * .14, .9, -a + Math.PI / 2); f(g); });
  const finCases = [];
  [[C.red, C.redD, -1.6, .2], [C.ind, C.indD, 0, -1.1], [C.mat, C.matD, 1.6, .3]].forEach(([c, d, x, z], i) => {
    const g = new THREE.Group(); g.add(box(1.15, 1.55, .62, c)); const hd = mesh(new THREE.TorusGeometry(.2, .04, 6, 12, Math.PI), C.char); hd.position.y = 1.56; g.add(hd);
    const tg = mesh(new THREE.PlaneGeometry(.3, .38), C.gold); tg.position.set(-.25, .7, .315); g.add(tg); g.position.set(x * 1.4, 0, z); g.scale.setScalar(1.7); g.rotation.y = .2 - i * .2; cur.add(g); finCases.push(g); });

  /* ---------- Gemeinsame Figuren: Koffer, Kranich, Wanderer, Blätter ---------- */
  const CW = 1.15, CD = .62, CH = 1.55;
  const suit = new THREE.Group(); scene.add(suit);
  const sRed = paper(C.red), sRedD = paper(C.redD);
  function face(w, h, m) { const ms = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); ms.castShadow = true; ms.receiveShadow = true; return ms; }
  const base = face(CW, CD, sRedD); base.rotation.x = -Math.PI / 2; base.position.y = .001; suit.add(base);
  const hFront = new THREE.Group(); hFront.position.set(0, 0, CD / 2); suit.add(hFront);
  const fFront = face(CW, CH, sRed); fFront.position.y = CH / 2; hFront.add(fFront);
  const tagM = mesh(new THREE.PlaneGeometry(.32, .4), C.gold); tagM.position.set(-.25, CH * .42, .004); hFront.add(tagM);
  [-.3, .3].forEach(x => { const rib = mesh(new THREE.PlaneGeometry(.06, CH * .86), C.redD); rib.position.set(x, CH / 2, .003); hFront.add(rib); });
  const hBack = new THREE.Group(); hBack.position.set(0, 0, -CD / 2); suit.add(hBack);
  const fBack = face(CW, CH, sRedD); fBack.position.y = CH / 2; hBack.add(fBack);
  const hTop = new THREE.Group(); hTop.position.set(0, CH, 0); hBack.add(hTop);
  const fTop = face(CW, CD, sRed); fTop.rotation.x = -Math.PI / 2; fTop.position.z = CD / 2; hTop.add(fTop);
  const handle = mesh(new THREE.TorusGeometry(.2, .04, 6, 12, Math.PI), C.char); handle.position.set(0, .02, CD / 2); hTop.add(handle);
  const hLeft = new THREE.Group(); hLeft.position.set(-CW / 2, 0, 0); suit.add(hLeft);
  const fLeft = face(CD, CH, sRedD); fLeft.rotation.y = Math.PI / 2; fLeft.position.y = CH / 2; hLeft.add(fLeft);
  const hRight = new THREE.Group(); hRight.position.set(CW / 2, 0, 0); suit.add(hRight);
  const fRight = face(CD, CH, sRed); fRight.rotation.y = Math.PI / 2; fRight.position.y = CH / 2; hRight.add(fRight);
  const wheels = new THREE.Group(); suit.add(wheels);
  [[-.4, .2], [.4, .2], [-.4, -.2], [.4, -.2]].forEach(p => { const w = mesh(new THREE.CylinderGeometry(.07, .07, .06, 10), C.char); w.rotation.z = Math.PI / 2; w.position.set(p[0], -.02, p[1]); wheels.add(w); });
  function setSuitcase(u) {
    hFront.rotation.x = (Math.PI / 2) * u; hBack.rotation.x = -(Math.PI / 2) * u;
    hLeft.rotation.z = (Math.PI / 2) * u; hRight.rotation.z = -(Math.PI / 2) * u;
    hTop.rotation.x = -(Math.PI / 2) * smooth(win(u, 0, .6));
    wheels.visible = u < .05; handle.visible = u < .4;
  }
  function makeCrane(c1, c2) {
    const crane = new THREE.Group(), m1 = paper(c1), m2 = paper(c2);
    const body = new THREE.Group(); crane.add(body);
    { const F = [.75, .02, 0], B = [-.75, .02, 0], T = [0, .42, 0], L = [0, -.22, .3], R = [0, -.22, -.3];
      body.add(new THREE.Mesh(triGeo([F, T, L, B, L, T]), m1), new THREE.Mesh(triGeo([F, R, T, B, T, R]), m2), new THREE.Mesh(triGeo([F, L, R, B, R, L]), m2)); }
    const neck = new THREE.Group(); neck.position.set(.55, .05, 0); crane.add(neck);
    neck.add(new THREE.Mesh(triGeo([[0, 0, .07], [1.25, 1.1, 0], [0, 0, -.07], [0, 0, .07], [0, .25, 0], [1.25, 1.1, 0], [0, 0, -.07], [1.25, 1.1, 0], [0, .25, 0]]), m1));
    neck.add(new THREE.Mesh(triGeo([[1.25, 1.1, .05], [1.6, .92, 0], [1.25, 1.1, -.05], [1.18, 1.0, 0], [1.6, .92, 0], [1.25, 1.1, .05]]), m2));
    const tail = new THREE.Group(); tail.position.set(-.55, .05, 0); crane.add(tail);
    tail.add(new THREE.Mesh(triGeo([[0, 0, .07], [-1.35, 1.05, 0], [0, 0, -.07], [0, 0, .07], [0, .25, 0], [-1.35, 1.05, 0], [0, 0, -.07], [-1.35, 1.05, 0], [0, .25, 0]]), m2));
    const wl = new THREE.Group(); wl.position.set(0, .3, .02); crane.add(wl);
    wl.add(new THREE.Mesh(triGeo([[-.55, 0, 0], [.5, 0, 0], [-.15, .05, 1.95], [-.55, 0, 0], [-.15, .05, 1.95], [-.05, -.06, .8]]), m1));
    const wr = new THREE.Group(); wr.position.set(0, .3, -.02); crane.add(wr);
    wr.add(new THREE.Mesh(triGeo([[-.55, 0, 0], [-.15, .05, -1.95], [.5, 0, 0], [-.55, 0, 0], [-.05, -.06, -.8], [-.15, .05, -1.95]]), m2));
    crane.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    crane.userData.set = (f, flap) => {
      const a = smooth(win(f, 0, .45)), b = smooth(win(f, .25, .75)), c = smooth(win(f, .5, 1));
      body.scale.set(1, lerp(.05, 1, a), lerp(.2, 1, a)); neck.rotation.z = lerp(-1.05, 0, b); tail.rotation.z = lerp(1.0, 0, b);
      const w = c, fl = Math.sin(flap) * .75 * w;
      wl.rotation.x = lerp(-0.02, -.15, w) - fl; wr.rotation.x = lerp(0.02, .15, w) + fl; wl.scale.setScalar(lerp(.6, 1, c)); wr.scale.setScalar(lerp(.6, 1, c)); };
    scene.add(crane); return crane;
  }
  const crane = makeCrane(C.red, C.redD);
  const finCranes = [makeCrane(C.red, C.redD), makeCrane('#3E64A3', C.indD), makeCrane('#86A86F', C.matD)];
  const sheet = mesh(new THREE.PlaneGeometry(2.4, 2.4), C.red); sheet.rotation.x = -Math.PI / 2; scene.add(sheet);
  function walker(col) {
    const g = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(.2, .45, 3, 8), col); body.position.y = .62; g.add(body);
    const head = mesh(new THREE.SphereGeometry(.17, 10, 8), '#F0D4B4'); head.position.y = 1.16; g.add(head);
    const bag = mesh(new THREE.BoxGeometry(.32, .42, .2), C.gold); bag.position.set(-.04, .7, -.24); g.add(bag);
    const legs = []; [-1, 1].forEach(k => { const l = mesh(new THREE.CapsuleGeometry(.07, .3, 2, 6), C.char); l.position.set(k * .09, .2, 0); g.add(l); legs.push(l); });
    g.userData.legs = legs; g.rotation.y = Math.PI / 2; scene.add(g); return g;
  }
  const walkers = [walker(C.ind), walker(C.mat)];
  const leafShape = new THREE.Shape(); {
    const R = [.06, .2, .12, .34, .12, .2, .07, .19, .11, .26, .1, .15, .05];
    R.forEach((r, i) => { const a = Math.PI * (-.15 + 1.3 * i / (R.length - 1)), x = Math.cos(a) * r, y = Math.sin(a) * r; i ? leafShape.lineTo(x, y) : leafShape.moveTo(x, y); });
    leafShape.lineTo(.015, -.02); leafShape.lineTo(.02, -.16); leafShape.lineTo(-.02, -.16); leafShape.lineTo(-.015, -.02); }
  const LEAVES = 220, leaves = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape), new THREE.MeshStandardMaterial({ roughness: .8, side: THREE.DoubleSide }), LEAVES);
  const lc = [new THREE.Color(C.momiji), new THREE.Color(C.momiji2), new THREE.Color(C.ginkgo), new THREE.Color('#B8321F')];
  let rs = 7; const rnd = () => (rs = rs * 16807 % 2147483647) / 2147483647;
  const seeds = []; for (let i = 0; i < LEAVES; i++) { seeds.push([rnd(), rnd(), rnd(), rnd(), .6 + rnd() * .8]); leaves.setColorAt(i, lc[i % 4]); }
  leaves.castShadow = true; scene.add(leaves);
  const dummy = new THREE.Object3D();
  function setLeaves(t, center, amount, spread = 26, top = 9) {
    for (let i = 0; i < LEAVES; i++) {
      const s = seeds[i], on = i < LEAVES * amount ? 1 : 0, fall = ((t * .09 * s[4] + s[1]) % 1);
      dummy.position.set(center.x + (s[0] - .5) * spread + Math.sin(t * .7 + i) * .8, top - fall * (top + .2), center.z + (s[2] - .5) * spread * .62);
      dummy.rotation.set(t * 1.3 * s[4] + i, t * .9 + s[3] * 6, t * .5 * s[4]);
      dummy.scale.setScalar(on * (.7 + s[3] * .6)); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }

  /* ---------- Die drei Sendungen ---------- */
  function trailFor(S, col, em) {
    const m = new THREE.Mesh(new THREE.TubeGeometry(S.curve, 220, .035, 5, false), new THREE.MeshStandardMaterial({ color: col, emissive: em, emissiveIntensity: S.night ? .55 : .8, transparent: true, opacity: .85 }));
    m.position.x = S.ox; scene.add(m); S.trail = m; S.trailCount = m.geometry.index.count;
  }
  const SH = [
    { start: 5, ox: 0, c0: V(-19.3, 0, 3.3), c1: V(26.4, 0, 4.6), r0: .35, r1: -.5, walk: [-23, -8.5, -5.4], leaves: [V(-24, 0, 5), V(26.4, 0, 4.6), .1, .9],
      curve: [V(-19.3, 1.3, 3.3), V(-19, 5.5, 3), V(-9, 9.5, 0), V(1, 13, -4.5), V(11, 10, -1), V(20, 5.8, 2.5), V(26.4, 1.3, 4.6)] },
    { start: 17, ox: 300, c0: V(-19.6, 0, 3.0), c1: V(27.2, 0, 4.4), r0: .3, r1: -.45, walk: [-20, -2, -5.4], leaves: [V(-26, 0, 4), V(28, 0, 4), .25, .7],
      curve: [V(-19.6, 1.3, 3.0), V(-16, 6.5, 2), V(-7, 12, -2), V(0, 14.5, -5), V(9, 11.5, -1.5), V(19, 6.2, 2.4), V(27.2, 1.3, 4.4)] },
    { start: 29, ox: 600, c0: V(-20.2, 0, 3.0), c1: V(27.6, 0, 4.4), r0: .3, r1: -.45, walk: null, night: true, leaves: [V(-24, 0, 4), V(28, 0, 4), .05, .08],
      curve: [V(-20.2, 1.3, 3.0), V(-15, 7, 2), V(-5, 12.5, -1), V(4, 14, -3.5), V(13, 11, -1), V(21, 6, 2.4), V(27.6, 1.3, 4.4)] }
  ];
  SH.forEach((S, i) => { S.curve = new THREE.CatmullRomCurve3(S.curve, false, 'catmullrom', .35); trailFor(S, i === 2 ? '#FFF4D6' : '#FFF6E3', i === 2 ? '#FFD38A' : '#FFE2A8'); });

  /* ---------- Postprocessing ---------- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W0, H0);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(W0, H0), .32, .55, .86); composer.addPass(bloom);
  const tilt = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(W0, H0) }, focus: { value: .55 }, band: { value: .16 }, amount: { value: 1.0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float focus,band,amount; varying vec2 vUv;
      void main(){ float d=smoothstep(band,band+.32,abs(vUv.y-focus))*amount; vec4 acc=vec4(0.);
        for(int i=0;i<16;i++){ float a=float(i)*2.39996; float r=sqrt(float(i)/16.)*d*7.; vec2 o=vec2(cos(a),sin(a))*r/res; acc+=texture2D(tDiffuse,vUv+o); }
        gl_FragColor=acc/16.; }`
  }); composer.addPass(tilt);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vig: { value: .32 }, grain: { value: .035 }, fade: { value: 0 }, wipe: { value: 0 }, seed: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time,vig,grain,fade,wipe,seed; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
      void main(){ vec2 c=vUv-.5; float ca=.0016*length(c);
        vec3 col=vec3(texture2D(tDiffuse,vUv+c*ca).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-c*ca).b);
        col*=1.-vig*smoothstep(.25,.9,length(c*vec2(1.1,1.)));
        col+=(fract(sin(dot(vUv*vec2(1920.,1080.),vec2(12.9898,78.233))+time*7.)*43758.5453)-.5)*grain;
        if(wipe>0.){ float f=fbm(vUv*vec2(4.,3.)+seed)*.62+vUv.x*.38; float e=wipe*1.25-.12; float m=smoothstep(f-.004,f+.004,e);
          vec3 pap=vec3(.97,.94,.87)*(.94+.06*fbm(vUv*40.)); float edge=smoothstep(.05,0.,abs(e-f)); pap*=1.-edge*.28;
          col=mix(col,pap,m); col+=vec3(.08,.05,.02)*smoothstep(.02,0.,abs(e-f-.01))*(1.-m); }
        col=mix(col,vec3(.98,.95,.89),fade); gl_FragColor=vec4(col,1.); }`
  }); composer.addPass(finish);

  /* ---------- Kamera je Szene ---------- */
  const look = V(0, 0, 0), pos = V(0, 0, 0), wp = V(0, 0, 0);
  function blend(seq) { pos.copy(seq[0][0].p); look.copy(seq[0][0].l); for (let i = 1; i < seq.length; i++) { pos.lerp(seq[i][0].p, seq[i][1]); look.lerp(seq[i][0].l, seq[i][1]); } }
  const chase = (cp, tan) => { const th = V(tan.x, 0, tan.z).normalize(); return { p: cp.clone().add(th.clone().multiplyScalar(-3.5)).add(V(0, 2.4, 14.5)), l: cp.clone().add(th.multiplyScalar(4)).add(V(0, -.8, 0)) }; };
  function shotS1(t, cp, tan) {
    const A = { p: V(CARD.x + Math.sin(t * .3) * .3, CARD.y + .2, CARD.z + 11.5 - t * .55), l: V(CARD.x, CARD.y, CARD.z) };
    const B = { p: V(-36.5 + (t - 5) * .9, 6.2 - (t - 5) * .5, 19 - (t - 5) * 1.6), l: V(-28, 2.2, 1) };
    const c0 = SH[0].c0, c1 = SH[0].c1;
    const C1 = { p: V(c0.x + 2.3 - (t - 7) * .35, 1.75 + (t - 7) * .25, c0.z + 5.6 - (t - 7) * .55), l: V(c0.x - .4, .85 + (t - 7) * .2, c0.z) };
    const ang = -.62 + (t - 12) * .16, rise = smooth(win(t, 15.8, 17));
    const E = { p: V(c1.x + Math.sin(ang) * 9.8, 3.9 - (t - 12) * .12 + rise * 6, c1.z + Math.cos(ang) * 9.8), l: V(c1.x + 1.2, 1.9 + rise * 8, c1.z - 2.2) };
    blend([[A, 0], [B, smooth(win(t, 3.9, 5.4))], [C1, smooth(win(t, 6.4, 7.3))], [chase(cp, tan), smooth(win(t, 8.0, 9.0))], [E, smooth(win(t, 11.9, 13.3))]]);
    return lerp(.25, 1.0, smooth(win(t, 4.5, 5.5))) * (1 - .6 * smooth(win(t, 8.2, 9))) + .5 * smooth(win(t, 13, 14));
  }
  function shotS(S, lt, cp, tan, endLook) {
    const ox = S.ox, c0 = S.c0, c1 = S.c1;
    const B = { p: V(ox - 40 + lt * 2.2, 15 - lt * 4.2, 22 - lt * 2.8), l: V(ox - 27, 2.2, 0) };
    const C1 = { p: V(ox + c0.x + 2.3 - (lt - 2) * .35, 1.75 + (lt - 2) * .25, c0.z + 5.6 - (lt - 2) * .55), l: V(ox + c0.x - .4, .85 + (lt - 2) * .2, c0.z) };
    const ang = endLook.a0 + (lt - 7) * .16, rise = smooth(win(lt, 10.8, 12));
    const E = { p: V(ox + c1.x + Math.sin(ang) * 10, 4 - (lt - 7) * .12 + rise * 6, c1.z + Math.cos(ang) * 10), l: V(ox + c1.x + endLook.dx, 2 + rise * 8, c1.z + endLook.dz) };
    const CH = S.night ? (() => { const th = V(tan.x, 0, tan.z).normalize(); const p = cp.clone().add(th.clone().multiplyScalar(-6)).add(V(0, -3.2, 17.5)); p.y = Math.max(p.y, 3.4); return { p, l: V(cp.x + th.x * 5, 3.2, -6) }; })() : chase(cp, tan);
    blend([[B, 0], [C1, smooth(win(lt, 1.3, 2.3))], [CH, smooth(win(lt, 3.0, 4.0))], [E, smooth(win(lt, 6.9, 8.3))]]);
    return lerp(.35, 1.0, smooth(win(lt, .8, 1.8))) * (1 - .6 * smooth(win(lt, 3.2, 4))) + .5 * smooth(win(lt, 8, 9));
  }
  function shotF(lt) {
    const a = .5 + lt * .17, r = lerp(31, 26, smooth(lt / 10)), h = lerp(10, 18, smooth(win(lt, 0, 7)));
    pos.set(900 + Math.sin(a) * r, h, Math.cos(a) * r); look.set(900, lerp(4, 3, smooth(lt / 8)), 0);
    return .55;
  }

  /* ---------- Typografie ---------- */
  const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",Georgia,serif', SANS = '-apple-system,"Helvetica Neue","Hiragino Sans",Arial,sans-serif';
  function caption(t, a, b, x, y, lines, align = 'left') {
    const k = smooth(win(t, a, a + .7)) * (1 - smooth(win(t, b - .6, b))); if (k <= 0) return;
    const S = ov.width / 1920; og.save(); og.globalAlpha = k; og.textAlign = align; og.shadowColor = 'rgba(20,14,6,.55)'; og.shadowBlur = 18 * S;
    let yy = y * S; const dx = (1 - k) * 24 * S * (align === 'right' ? 1 : -1);
    const cy = yy + (lines.length * 26 - 30) * S, cx = align === 'right' ? x * S - 260 * S : x * S + 260 * S, gr = og.createRadialGradient(cx, cy, 0, cx, cy, 560 * S);
    gr.addColorStop(0, 'rgba(18,12,6,.36)'); gr.addColorStop(.55, 'rgba(18,12,6,.16)'); gr.addColorStop(1, 'rgba(18,12,6,0)');
    og.shadowBlur = 0; og.save(); og.translate(cx, cy); og.scale(1, .42); og.translate(-cx, -cy); og.fillStyle = gr; og.fillRect(cx - 600 * S, cy - 600 * S, 1200 * S, 1200 * S); og.restore(); og.shadowBlur = 18 * S;
    lines.forEach(([txt, kind]) => {
      if (kind === 'eyebrow') { og.font = `700 ${22 * S}px ${SANS}`; og.fillStyle = '#F3C770'; og.letterSpacing = `${6 * S}px`; og.fillText(txt.toUpperCase(), x * S + dx, yy); yy += 18 * S; og.letterSpacing = '0px';
        og.shadowBlur = 0; og.fillStyle = 'rgba(243,199,112,.9)'; const lw = 120 * S * smooth(win(t, a + .2, a + 1.1)); og.fillRect(align === 'right' ? x * S - lw : x * S, yy, lw, 2 * S); og.shadowBlur = 18 * S; yy += 50 * S; }
      else if (kind === 'big') { og.font = `600 ${64 * S}px ${SERIF}`; og.fillStyle = '#FFFFFF'; og.fillText(txt, x * S + dx, yy); yy += 58 * S; }
      else { og.font = `500 ${30 * S}px ${SANS}`; og.fillStyle = 'rgba(255,255,255,.92)'; og.fillText(txt, x * S + dx, yy); yy += 40 * S; }
    });
    og.restore();
  }
  function stat(t, a, x, num, label, col) {
    const k = smooth(win(t, a, a + .6)) * (1 - smooth(win(t, 50.2, 50.9))); if (k <= 0) return;
    const S = ov.width / 1920, v = inOut(win(t, a + .1, a + 1.6)); og.save(); og.globalAlpha = k; og.textAlign = 'center';
    og.fillStyle = 'rgba(252,248,238,.9)'; og.shadowColor = 'rgba(40,24,8,.25)'; og.shadowBlur = 30 * S; const w = 330 * S, h = 168 * S, y0 = 860 * S + (1 - k) * 30 * S;
    og.beginPath(); og.roundRect(x * S - w / 2, y0, w, h, 14 * S); og.fill(); og.shadowBlur = 0;
    og.fillStyle = col; og.font = `600 ${78 * S}px ${SERIF}`; og.fillText(num(v), x * S, y0 + 94 * S);
    og.fillStyle = '#2A2D35'; og.font = `500 ${26 * S}px ${SANS}`; og.fillText(label, x * S, y0 + 140 * S); og.restore();
  }
  function stamp(t) {
    const k = win(t, 45.6, 46.0); if (k <= 0) return; const S = ov.width / 1920, sc = lerp(2.2, 1, outBack(k)), fade = 1 - smooth(win(t, 50.2, 50.9));
    og.save(); og.globalAlpha = Math.min(1, k * 2) * fade; og.translate(1640 * S, 250 * S); og.rotate(-.16); og.scale(sc, sc);
    og.fillStyle = '#C93F2B'; og.beginPath(); og.roundRect(-95 * S, -110 * S, 190 * S, 220 * S, 12 * S); og.fill();
    og.strokeStyle = '#fff'; og.lineWidth = 4 * S; og.strokeRect(-78 * S, -93 * S, 156 * S, 186 * S);
    og.fillStyle = '#fff'; og.textAlign = 'center'; og.font = `700 ${50 * S}px ${SERIF}`; og.fillText('お疲れ', 0, -8 * S); og.fillText('さま', 0, 62 * S); og.restore();
  }
  function overlay(t) {
    og.clearRect(0, 0, ov.width, ov.height);
    caption(t, 5.4, 9.6, 110, 140, [['Sendung 1 · Fr 13.11.', 'eyebrow'], ['東京 → 京都', 'big'], ['Tokio nach Kyōto', 'sub']]);
    caption(t, 6.6, 8.3, 1810, 860, [['Konbini in Ikebukuro', 'sub'], ['Koffer aufgeben, Beleg behalten', 'sub']], 'right');
    caption(t, 9.6, 12.8, 110, 900, [['ihr reist leicht', 'eyebrow'], ['nur Rucksack · Ryokan-Nacht in Hakone', 'sub']]);
    caption(t, 14.3, 16.6, 110, 800, [['Sa 14.11. · 京都', 'eyebrow'], ['HOTEL TAVINOS', 'big'], ['euer Koffer wartet schon', 'sub']]);
    caption(t, 17.5, 21.6, 110, 140, [['Sendung 2 · So 22.11.', 'eyebrow'], ['大阪 → 広島', 'big'], ['Ōsaka nach Hiroshima', 'sub']]);
    caption(t, 18.6, 20.3, 1810, 860, [['Rezeption Bridge Hotel', 'sub'], ['morgens beim Check-out', 'sub']], 'right');
    caption(t, 21.6, 24.8, 110, 900, [['ihr reist leicht', 'eyebrow'], ['Laternenweg · Tempelnacht auf dem Kōyasan', 'sub']]);
    caption(t, 26.3, 28.6, 110, 800, [['Mo 23.11. · 広島', 'eyebrow'], ['DORMY INN', 'big'], ['euer Koffer wartet schon', 'sub']]);
    caption(t, 29.5, 33.6, 110, 140, [['Sendung 3 · Di 24.11.', 'eyebrow'], ['広島 → 東京', 'big'], ['Hiroshima nach Tokio', 'sub']]);
    caption(t, 30.6, 32.3, 1810, 860, [['Rezeption Dormy Inn', 'sub'], ['morgens, vor Miyajima', 'sub']], 'right');
    caption(t, 33.6, 36.8, 110, 900, [['ihr reist leicht', 'eyebrow'], ['Miyajima · Himeji · Nozomi nach Tokio', 'sub']]);
    caption(t, 38.3, 40.6, 110, 800, [['Mi 25.11. · 東京', 'eyebrow'], ['DORMY INN KANDA', 'big'], ['euer Koffer wartet schon', 'sub']]);
    stat(t, 42.4, 560, v => String(Math.round(3 * v)), 'Koffer-Reisen', '#C93F2B');
    stat(t, 42.8, 960, v => '~' + Math.round(1700 * v).toLocaleString('de-DE'), 'km leicht gereist', '#2F4D7E');
    stat(t, 43.2, 1360, v => '0', 'kg geschleppt', '#5D7A4E');
    stamp(t);
    const kf = smooth(win(t, 47.2, 48)) * (1 - smooth(win(t, 50.2, 50.9)));
    if (kf > 0) { const S = ov.width / 1920; og.save(); og.globalAlpha = kf; og.textAlign = 'center'; og.shadowColor = 'rgba(40,24,8,.45)'; og.shadowBlur = 24 * S;
      og.fillStyle = '#FFFFFF'; og.font = `600 ${84 * S}px ${SERIF}`; og.fillText('Gute Reise, ihr zwei.', 960 * S, 250 * S);
      og.font = `500 ${28 * S}px ${SANS}`; og.fillStyle = 'rgba(255,255,255,.92)'; og.letterSpacing = `${6 * S}px`; og.fillText('宅急便 · 13. · 22. · 24. NOVEMBER', 960 * S, 312 * S); og.restore(); }
  }

  /* ---------- Bild für Zeitpunkt t ---------- */
  const cp = V(0, 0, 0), tan = V(1, 0, 0), focus = V(0, 0, 0);
  let lastPal = null;
  function rig(S, lt, t) {
    const appear = outBack(win(lt, 1.0, 1.7)), unfold = inOut(win(lt, 2.35, 2.95)), fold = win(lt, 2.9, 3.6);
    const fly = inOut(win(lt, 3.5, 8.5)), land = win(lt, 8.45, 9.05), refold = inOut(win(lt, 8.95, 9.55));
    const atEnd = lt >= 8.95, P = atEnd ? S.c1 : S.c0, ox = S.ox;
    S.curve.getPointAt(clamp(fly), cp); cp.x += ox; S.curve.getTangentAt(clamp(fly, .001, .999), tan);
    suit.position.set(ox + P.x, atEnd ? 0 : (1 - appear) * 3, P.z); suit.rotation.y = atEnd ? S.r1 : S.r0; suit.scale.setScalar(atEnd ? 1 : Math.max(.001, appear));
    setSuitcase(atEnd ? 1 - refold : unfold); suit.visible = (lt >= 1.0 && lt < 3.05) || lt >= 8.95;
    const early = lt < 5, SP = early ? S.c0 : S.c1;
    sheet.visible = (lt >= 2.85 && lt < 3.45) || (lt >= 8.5 && lt < 9.05); sheet.position.set(ox + SP.x, .02, SP.z);
    sheet.scale.setScalar(Math.max(.001, early ? 1 - smooth(win(lt, 3.0, 3.45)) : smooth(win(lt, 8.5, 8.9)))); sheet.rotation.z = early ? S.r0 : S.r1;
    crane.visible = lt >= 2.9 && lt < 9.05; crane.userData.set(early ? smooth(fold) : 1 - smooth(land), t * 13);
    if (lt < 3.5) { crane.position.set(ox + S.c0.x, .05 + smooth(win(lt, 3.2, 3.5)) * 1.2, S.c0.z); crane.rotation.set(0, -.2, 0); }
    else if (lt < 8.5) { crane.position.copy(cp); crane.position.y += Math.sin(t * 2.2) * .12;
      crane.rotation.set(Math.sin(t * 1.3) * .12, Math.atan2(-tan.z, tan.x), Math.asin(clamp(tan.y, -1, 1)) * .8); }
    else { crane.position.set(ox + S.c1.x, 1.3 - smooth(land) * 1.25, S.c1.z); crane.rotation.set(0, -.5, 0); }
    crane.scale.setScalar(lt < 3.5 ? lerp(.55, 1, smooth(win(lt, 3.0, 3.5))) : lt > 8.5 ? lerp(1.25, .55, smooth(land)) : lerp(1, 1.25, smooth(win(lt, 3.5, 4.3))));
    S.trail.visible = lt > 3.5 && lt < 9.6; S.trail.geometry.setDrawRange(0, Math.floor(S.trailCount * clamp(fly) / 3) * 3); S.trail.material.opacity = (S.night ? .4 : .85) * (1 - smooth(win(lt, 8.4, 9.6)));
    walkers.forEach((w, i) => { const v = win(lt, 3.4, 9.2); w.visible = !!S.walk && lt > 3.4 && lt < 9.6;
      if (S.walk) w.position.set(ox + lerp(S.walk[0], S.walk[1], v) - i * .75, Math.abs(Math.sin(t * 7 + i)) * .06, S.walk[2] + i * .35);
      w.userData.legs[0].rotation.x = Math.sin(t * 7 + i) * .5; w.userData.legs[1].rotation.x = -Math.sin(t * 7 + i) * .5; });
    focus.set(lt < 3.5 ? ox - 26 : lt < 8.5 ? cp.x : ox + S.c1.x, 0, lt < 8.5 && lt >= 3.5 ? 0 : 2);
    const L = S.leaves; setLeaves(t, lt < 8 ? V(ox + L[0].x, 0, L[0].z) : V(ox + L[1].x, 0, L[1].z), lt < 8 ? L[2] : L[3]);
  }
  function renderAt(t) {
    t = clamp(t, 0, DURATION);
    const si = t < 17 ? 0 : t < 29 ? 1 : t < 41 ? 2 : 3;
    worlds.forEach((w, i) => { w.visible = i === si; });
    const palName = ['morning', 'golden', 'night', 'sunrise'][si];
    if (palName !== lastPal) { palette(PAL[palName]); lastPal = palName;
      [paper(C.red), paper(C.redD)].forEach(m => { m.emissive.set(si === 2 ? '#FF5A32' : '#000000'); m.emissiveIntensity = si === 2 ? .55 : 0; }); }
    pops.forEach(p => { const v = win(t, p.t0, p.t0 + p.dur), k = v <= 0 ? 0 : outBack(v); p.inner.rotation.x = -(Math.PI / 2) * (1 - k); p.inner.visible = v > 0; p.inner.scale.y = lerp(.6, 1, smooth(v)); });
    SH.forEach((S, i) => { if (i !== si) S.trail.visible = false; });
    let tiltAmt = .5;
    finCranes.forEach(c => c.visible = false); finCases.forEach(c => c.visible = si === 3);
    if (si < 3) {
      const S = SH[si], lt = t - S.start;
      if (si === 0) {
        flaps.forEach((f, i) => { const v = inOut(win(t, .2 + i * .18, .9 + i * .18)), a = Math.PI * v * .985;
          if (f.k === 't') f.hinge.rotation.x = a; else if (f.k === 'b') f.hinge.rotation.x = -a; else if (f.k === 'l') f.hinge.rotation.y = -a; else f.hinge.rotation.y = a; });
        const away = inOut(win(t, 3.9, 5.1));
        card.position.set(CARD.x - away * 3, CARD.y + away * 9, CARD.z - away * 6); card.rotation.set(-away * 1.2, away * .6, away * .3); card.visible = t < 5.3;
        if (t < 5) { suit.visible = crane.visible = sheet.visible = false; walkers.forEach(w => w.visible = false); setLeaves(t, V(-30, 0, 10), .12); focus.set(-28, 0, 4); cp.set(-19.3, 1.3, 3.3); tan.set(1, 0, 0); }
        else rig(S, lt, t);
        tiltAmt = shotS1(t, cp, tan);
        glow1.forEach(m => { m.emissiveIntensity = .15 + .25 * smooth(win(t, 13, 16)); });
        steam.forEach((s, i) => { const ph = ((t * .35 + i / steam.length) % 1); s.position.set(Math.sin(i * 2.1 + t) * .5, .5 + ph * 2.6, Math.cos(i * 1.7) * .4); s.scale.setScalar(.6 + ph * 1.4); s.material.opacity = .5 * (1 - ph); });
        clouds1.position.x = t * .5;
      } else {
        rig(S, lt, t);
        tiltAmt = shotS(S, lt, cp, tan, si === 1 ? { a0: -.38, dx: 2.2, dz: -2.6 } : { a0: -.62, dx: 1.2, dz: -2.4 });
        if (si === 1) { clouds2.position.x = lt * .5; lanterns2.forEach((m, i) => m.emissiveIntensity = 1.2 + .25 * Math.sin(t * 6 + i)); }
        if (si === 2) { clouds3.position.x = lt * .4; lant3.forEach((m, i) => m.emissiveIntensity = 2 + .3 * Math.sin(t * 5 + i * 2));
          const tv = inOut(win(lt, 2.6, 9.4)); train.position.set(lerp(-46, 52, tv), 0, -5.4);
          deer.forEach((d, i) => { d.rotation.z = Math.sin(t * 1.5 + i) * .02; }); }
      }
      camera.position.copy(pos); camera.lookAt(look);
    } else {
      const lt = t - 41;
      suit.visible = crane.visible = sheet.visible = false; walkers.forEach(w => w.visible = false);
      finCases.forEach((c, i) => { const v = win(lt, .5 + i * .18, 1.1 + i * .18); c.position.y = (1 - outBack(v)) * 6; c.visible = v > 0; });
      finCranes.forEach((c, i) => { c.visible = lt > .2; const a = lt * .55 + i * Math.PI * 2 / 3, r = 7.5 - lt * .25, y = 3.5 + lt * 1.05 + Math.sin(lt * 2 + i) * .4;
        c.position.set(900 + Math.cos(a) * r, y, Math.sin(a) * r); c.rotation.set(Math.sin(lt * 1.3 + i) * .1, Math.atan2(-Math.cos(a), -Math.sin(a)), .22); c.scale.setScalar(lerp(.6, 1.3, smooth(lt / 3)));
        c.userData.set(1, t * 12 + i); });
      tiltAmt = shotF(lt); camera.position.copy(pos); camera.lookAt(look);
      focus.set(900, 0, 0);
      setLeaves(t, V(900, 0, 0), lt > 5.8 ? 1 : .15, 34, 14);
      bloom.strength = PAL.sunrise.bloom[0] + .5 * Math.exp(-Math.pow((t - 47.05) * 2.2, 2));
      skyU.sunDir.value.set(.2, lerp(.02, .16, smooth(lt / 10)), -1).normalize();
    }
    if (si < 3) skyU.sunDir.value.set(si === 2 ? .45 : -.55, si === 2 ? .38 : .32 - (si === 1 ? .12 : 0), -.78).normalize();
    sun.target.position.copy(focus); sun.position.copy(focus).add(si === 1 ? V(-8, 22, 24) : V(-14, 26, 18));
    rim.target.position.copy(focus); rim.position.copy(focus).add(V(30, 18, -40));
    if (camera.position.y < 1.2) { camera.position.y = 1.2; camera.lookAt(look); }
    sky.position.copy(camera.position);
    tilt.uniforms.amount.value = tiltAmt;
    // Papier-Übergänge an den Szenengrenzen
    let w = 0, seed = 0; [17, 29, 41].forEach((B, i) => { if (t > B - .8 && t < B + .8) { w = t < B ? smooth(win(t, B - .8, B)) : 1 - smooth(win(t, B, B + .8)); seed = i * 7.3; } });
    finish.uniforms.wipe.value = w; finish.uniforms.seed.value = seed;
    finish.uniforms.time.value = t; finish.uniforms.fade.value = 1 - smooth(win(t, 0, .9)) + smooth(win(t, DURATION - .8, DURATION));
    composer.render();
    overlay(t);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio(); ov.width = Math.round(w * pr); ov.height = Math.round(h * pr);
    tilt.uniforms.res.value.set(w * pr, h * pr); bloom.resolution.set(w, h);
  }
  resize(W0, H0);
  palette(PAL.morning);
  return { renderAt, resize, canvas: cv, overlay: ov, renderer, duration: DURATION };
}

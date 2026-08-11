/**
 * Kal-Purja — Interactive Exploded Viewer
 * Phase 1: hand-built schematic geometry for a single-cylinder IC Engine.
 * Every part is a real THREE.Group so it can later be swapped for a
 * loaded GLB without touching the UI, data or explosion logic below.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ------------------------------------------------------------------ *
 * 1. Component data — the "study material" behind each part.
 *    Swap this array for a fetch('/api/components') call once a real
 *    backend exists; nothing else in this file needs to change.
 * ------------------------------------------------------------------ */

const COMPONENTS = [
  {
    id: 'block',
    name: 'Cylinder Block',
    color: 0x545a61, metalness: 0.35, roughness: 0.75,
    normal: [0, 0, 0], exploded: [0, 0, 0],
    build: buildCylinderBlock,
    info: {
      function: 'The main housing of the engine. It holds the cylinder bore in which the piston slides, carries the coolant and oil passages, and provides the mounting points every other component is built around.',
      material: ['Grey cast iron — traditional, high damping', 'Aluminium alloy — modern, lighter, better heat dissipation'],
      manufacturing: ['Sand casting or high-pressure die casting', 'CNC boring of the cylinder bore', 'Honing for final bore surface finish'],
      forces: ['Reacts to peak gas pressure during combustion', 'Absorbs thermal expansion through repeated heating cycles', 'Dampens vibration from the reciprocating assembly'],
      equation: null,
      curriculum: ['Manufacturing', 'Machine Design']
    }
  },
  {
    id: 'piston',
    name: 'Piston',
    color: 0xd7dbe0, metalness: 0.75, roughness: 0.3,
    normal: [0, 1.05, 0], exploded: [0, 4.2, 0],
    build: buildPiston,
    info: {
      function: 'Converts the pressure of expanding combustion gas into a linear mechanical push, then hands that force to the connecting rod through the gudgeon pin.',
      material: ['Aluminium-silicon alloy — light, dissipates heat quickly', 'Cast iron — used in some heavy-duty diesel pistons'],
      manufacturing: ['Gravity or pressure die casting', 'Forging for high-performance pistons', 'CNC finishing of the ring grooves and skirt'],
      forces: ['Gas force pushing down on the crown', 'Side thrust against the cylinder wall', 'Inertia force from reversing direction at each stroke', 'Thermal loading concentrated at the crown'],
      equation: 'F = P × A  (gas force = pressure × piston crown area)',
      curriculum: ['Thermodynamics', 'Machine Design']
    }
  },
  {
    id: 'rod',
    name: 'Connecting Rod',
    color: 0x9aa0a8, metalness: 0.7, roughness: 0.35,
    normal: [0, -0.15, 0], exploded: [0.15, 1.8, 0],
    build: buildConnectingRod,
    info: {
      function: 'Links the piston to the crankshaft. It carries the push from the piston down to the crank pin, converting the piston\'s straight-line motion into the crank\'s rotary motion.',
      material: ['Forged steel — most common, high fatigue strength', 'Forged aluminium or titanium — motorsport applications'],
      manufacturing: ['Drop forging to rough shape', 'Precision machining of the big-end and small-end bores', 'Shot peening to improve fatigue life'],
      forces: ['Axial compression on the power stroke, tension on the exhaust stroke', 'Buckling risk — treated as a column/strut in design', 'Bending from slight side loads'],
      equation: 'P_cr = π² E I / L²  (Euler buckling load of the rod as a strut)',
      curriculum: ['Machine Design', 'CAD']
    }
  },
  {
    id: 'crank',
    name: 'Crankshaft',
    color: 0x7b828a, metalness: 0.75, roughness: 0.3,
    normal: [0, -1.3, 0], exploded: [0, -3.4, 0],
    build: buildCrankshaft,
    info: {
      function: 'Turns the reciprocating push delivered by the connecting rod into continuous rotary motion, then sends that rotation on to the flywheel and, eventually, the wheels or driven machine.',
      material: ['Forged steel — high strength, fatigue resistant', 'Nodular (ductile) cast iron — common in mass-produced engines'],
      manufacturing: ['Drop forging or casting of the blank', 'CNC grinding of the main and crank-pin journals', 'Dynamic balancing before final assembly'],
      forces: ['Torsional load from combustion impulses', 'Bending moment between main bearings', 'Centrifugal force from the counterweights at speed'],
      equation: 'T = F × r  (torque = force at crank pin × crank radius)',
      curriculum: ['Machine Design', 'CAD']
    }
  },
  {
    id: 'flywheel',
    name: 'Flywheel',
    color: 0x3d4247, metalness: 0.55, roughness: 0.5,
    normal: [1.7, -1.3, 0], exploded: [3.7, -3.4, 0],
    build: buildFlywheel,
    info: {
      function: 'A heavy disc bolted to the end of the crankshaft. It stores rotational kinetic energy during the power stroke and releases it through the idle strokes, keeping the crank speed smooth instead of jerky.',
      material: ['Cast iron — mass is the whole point here', 'Steel — used where a smaller diameter is needed'],
      manufacturing: ['Casting to a rough disc', 'Precision machining and balancing — critical at high RPM', 'Ring gear pressed on for the starter motor, where fitted'],
      forces: ['Stores energy as rotational inertia', 'Must be balanced to avoid vibration at operating speed'],
      equation: 'E = ½ I ω²  (kinetic energy stored at angular speed ω)',
      curriculum: ['Machine Design', 'Thermodynamics']
    }
  }
];

/* ------------------------------------------------------------------ *
 * 2. Three.js scene setup
 * ------------------------------------------------------------------ */

let scene, camera, renderer, controls, raycaster, pointer;
let selectedId = COMPONENTS[1].id; // default focus: piston
let currentTab = 'function';
const partGroups = {}; // id -> { group, normal: Vector3, exploded: Vector3 }

const DEFAULT_CAMERA_POS = [6, 5, 9];
const DEFAULT_TARGET = [0.6, -0.3, 0];

init();
animate();

function init() {
  const canvas = document.getElementById('viewerCanvas');
  const wrap = canvas.parentElement;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171b);
  scene.fog = new THREE.Fog(0x14171b, 13, 28);

  camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / wrap.clientHeight, 0.1, 100);
  camera.position.set(...DEFAULT_CAMERA_POS);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(6, 10, 6);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x4fb8e8, 0.45);
  rim.position.set(-6, 2, -5);
  scene.add(rim);

  const grid = new THREE.GridHelper(24, 48, 0x2c3238, 0x1e2226);
  grid.position.y = -2.4;
  scene.add(grid);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 20;
  controls.target.set(...DEFAULT_TARGET);
  controls.update();

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  buildComponents();
  updateExplosion(0.35);
  buildPartsList();
  wireControls();
  selectComponent(selectedId);

  renderer.domElement.addEventListener('click', onCanvasClick);
  window.addEventListener('resize', onResize);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  const wrap = renderer.domElement.parentElement;
  if (!wrap.clientWidth || !wrap.clientHeight) return;
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
}

/* ------------------------------------------------------------------ *
 * 3. Building the parts, and the explosion math
 * ------------------------------------------------------------------ */

function buildComponents() {
  COMPONENTS.forEach((c) => {
    const group = c.build(c);
    group.userData.componentId = c.id;
    group.position.set(...c.normal);
    scene.add(group);
    partGroups[c.id] = {
      group,
      normal: new THREE.Vector3(...c.normal),
      exploded: new THREE.Vector3(...c.exploded)
    };
  });
}

// actualPosition = normalPosition + (explodedPosition - normalPosition) * t
function updateExplosion(t) {
  Object.values(partGroups).forEach(({ group, normal, exploded }) => {
    group.position.lerpVectors(normal, exploded, t);
  });
  const tb = document.getElementById('tbExplode');
  if (tb) tb.textContent = Math.round(t * 100) + '%';
}

/* ---- geometry builders ----
   Schematic, primitive-based stand-ins. Replace any build() function
   with a GLTFLoader call once real CAD-exported models exist — the
   rest of the app only cares that build() returns a THREE.Group. */

function buildCylinderBlock(c) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });

  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 0.2), mat);
  back.position.set(0, -1.0, -1.1);
  group.add(back);

  const sideGeo = new THREE.BoxGeometry(0.2, 3.0, 2.2);
  const left = new THREE.Mesh(sideGeo, mat);
  left.position.set(-1.2, -1.0, 0);
  group.add(left);

  const right = new THREE.Mesh(sideGeo, mat);
  right.position.set(1.2, -1.0, 0);
  group.add(right);

  const deckMat = new THREE.MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness, side: THREE.DoubleSide });
  const deck = new THREE.Mesh(new THREE.RingGeometry(0.68, 1.15, 32), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.5, 0);
  group.add(deck);

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 2.2), mat);
  base.position.set(0, -2.5, 0);
  group.add(base);

  return group;
}

function buildPiston(c) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.4, roughness: 0.6 });
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, metalness: 0.8, roughness: 0.25 });

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.22, 32), mat);
  crown.position.y = 0.5;
  group.add(crown);

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.75, 32), mat);
  skirt.position.y = 0.0;
  group.add(skirt);

  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.565, 0.028, 8, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.32 - i * 0.14;
    group.add(ring);
  }

  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.3, 16), pinMat);
  pin.rotation.z = Math.PI / 2;
  pin.position.y = -0.25;
  group.add(pin);

  return group;
}

function buildConnectingRod(c) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });

  const smallEnd = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.09, 12, 24), mat);
  smallEnd.rotation.x = Math.PI / 2;
  smallEnd.position.y = 0.95;
  group.add(smallEnd);

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.34), mat);
  shaft.position.y = 0.2;
  group.add(shaft);

  const bigEnd = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 12, 24), mat);
  bigEnd.rotation.x = Math.PI / 2;
  bigEnd.position.y = -0.65;
  group.add(bigEnd);

  return group;
}

function buildCrankshaft(c) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });

  const mainJournal = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 2.6, 24), mat);
  mainJournal.rotation.z = Math.PI / 2;
  group.add(mainJournal);

  const crankPin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 20), mat);
  crankPin.rotation.z = Math.PI / 2;
  crankPin.position.set(0, 0.5, 0);
  group.add(crankPin);

  const webGeo = new THREE.BoxGeometry(0.5, 0.55, 0.65);
  const web1 = new THREE.Mesh(webGeo, mat);
  web1.position.set(-0.25, 0.25, 0);
  group.add(web1);
  const web2 = new THREE.Mesh(webGeo, mat);
  web2.position.set(0.25, 0.25, 0);
  group.add(web2);

  return group;
}

function buildFlywheel(c) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.28, 40), mat);
  disc.rotation.z = Math.PI / 2;
  group.add(disc);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.55, 20), mat);
  hub.rotation.z = Math.PI / 2;
  group.add(hub);

  return group;
}

/* ------------------------------------------------------------------ *
 * 4. Selection, raycasting, highlighting
 * ------------------------------------------------------------------ */

function onCanvasClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const meshes = [];
  Object.values(partGroups).forEach(({ group }) => {
    group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  });

  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return;

  let obj = hits[0].object;
  while (obj && !obj.userData.componentId) obj = obj.parent;
  if (obj) selectComponent(obj.userData.componentId);
}

function selectComponent(id) {
  selectedId = id;

  Object.entries(partGroups).forEach(([cid, { group }]) => {
    const isSelected = cid === id;
    group.traverse((o) => {
      if (o.isMesh) {
        o.material.emissive = new THREE.Color(isSelected ? 0x4fb8e8 : 0x000000);
        o.material.emissiveIntensity = isSelected ? 0.55 : 0;
      }
    });
  });

  renderInfo(id);
  highlightPartsList(id);
}

/* ------------------------------------------------------------------ *
 * 5. UI: parts list, info panel, tabs, search, slider
 * ------------------------------------------------------------------ */

function buildPartsList() {
  const list = document.getElementById('partsList');
  list.innerHTML = '';
  COMPONENTS.forEach((c) => {
    const btn = document.createElement('button');
    btn.className = 'part-item';
    btn.dataset.id = c.id;
    btn.textContent = c.name;
    btn.addEventListener('click', () => selectComponent(c.id));
    list.appendChild(btn);
  });
}

function highlightPartsList(id) {
  document.querySelectorAll('.part-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

function renderInfo(id) {
  const comp = COMPONENTS.find((c) => c.id === id);
  if (!comp) return;

  document.getElementById('tbName').textContent = comp.name;
  document.getElementById('tbMaterial').textContent = comp.info.material[0];

  renderTabBody(comp);

  const tagsEl = document.getElementById('curriculumTags');
  tagsEl.innerHTML = '';
  comp.info.curriculum.forEach((tag) => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    tagsEl.appendChild(span);
  });
}

function renderTabBody(comp) {
  const body = document.getElementById('infoBody');
  body.innerHTML = '';

  if (currentTab === 'function') {
    const p = document.createElement('p');
    p.className = 'info-text';
    p.textContent = comp.info.function;
    body.appendChild(p);
    return;
  }

  const key = currentTab === 'forces' ? 'forces' : currentTab;
  const items = comp.info[key];

  if (items && items.length) {
    const ul = document.createElement('ul');
    ul.className = 'info-list';
    items.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  if (currentTab === 'forces' && comp.info.equation) {
    const eq = document.createElement('div');
    eq.className = 'equation';
    eq.textContent = comp.info.equation;
    body.appendChild(eq);
  }
}

function wireControls() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      const comp = COMPONENTS.find((c) => c.id === selectedId);
      if (comp) renderTabBody(comp);
    });
  });

  document.getElementById('explodeSlider').addEventListener('input', (e) => {
    updateExplosion(Number(e.target.value) / 100);
  });

  document.getElementById('resetCam').addEventListener('click', () => {
    camera.position.set(...DEFAULT_CAMERA_POS);
    controls.target.set(...DEFAULT_TARGET);
    controls.update();
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.part-item').forEach((el) => {
      const comp = COMPONENTS.find((c) => c.id === el.dataset.id);
      const match = !q || comp.name.toLowerCase().includes(q) || comp.info.function.toLowerCase().includes(q);
      el.style.display = match ? '' : 'none';
    });
  });
}


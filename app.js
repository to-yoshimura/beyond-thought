const canvas = document.querySelector('#space');
const ctx = canvas.getContext('2d', { alpha: false });
const form = document.querySelector('#generator');
const countInput = document.querySelector('#nodeCount');
const rangeInput = document.querySelector('#nodeRange');
const activeEl = document.querySelector('#activeNodes');
const synapseEl = document.querySelector('#synapses');
const coordsEl = document.querySelector('#coords');
const depthStateEl = document.querySelector('#depthState');
const soundButton = document.querySelector('#soundToggle');
const soundLabel = document.querySelector('#soundLabel');

const TAU = Math.PI * 2;
let width = 0;
let height = 0;
let dpr = 1;
let nodes = [];
let links = [];
let pulses = [];
let adjacency = [];
let waves = [];
let crystals = [];
let stars = [];
let rotation = { x: -0.12, y: 0.15 };
let targetRotation = { ...rotation };
let zoom = 1;
let targetZoom = 1;
let layerDepth = 0;
let targetLayerDepth = 0;
let dragging = false;
let pointer = { x: 0, y: 0, lastX: 0, lastY: 0, downX: 0, downY: 0, active: false, moved: false };
let lastTime = performance.now();
let displayCount = 480;
let audio = null;
let lastNeuralSound = 0;
let nextAutoWave = 0;

const LAYERS = [
  { name: 'SURFACE', line: [128, 211, 120], bright: [218, 255, 148], dim: [150, 213, 139], accent: [195, 255, 112] },
  { name: 'MEMORY', line: [92, 190, 176], bright: [158, 255, 226], dim: [100, 194, 172], accent: [125, 255, 220] },
  { name: 'SUBCONSCIOUS', line: [112, 105, 188], bright: [196, 181, 255], dim: [125, 116, 184], accent: [185, 158, 255] }
];
let palette = LAYERS[0];

function randomGaussian() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function mixColor(a, b, amount) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * amount));
}

function updatePalette() {
  const lower = Math.floor(layerDepth);
  const upper = Math.min(LAYERS.length - 1, lower + 1);
  const amount = layerDepth - lower;
  palette = {
    name: LAYERS[Math.round(layerDepth)].name,
    line: mixColor(LAYERS[lower].line, LAYERS[upper].line, amount),
    bright: mixColor(LAYERS[lower].bright, LAYERS[upper].bright, amount),
    dim: mixColor(LAYERS[lower].dim, LAYERS[upper].dim, amount),
    accent: mixColor(LAYERS[lower].accent, LAYERS[upper].accent, amount)
  };
}

function heapPush(heap, item) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].cost <= item.cost) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = item;
}

function heapPop(heap) {
  if (heap.length === 1) return heap.pop();
  const first = heap[0];
  const last = heap.pop();
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    let child = left;
    if (right < heap.length && heap[right].cost < heap[left].cost) child = right;
    if (heap[child].cost >= last.cost) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = last;
  return first;
}

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  createStars();
}

function createStars() {
  const amount = Math.min(260, Math.floor((width * height) / 6500));
  stars = Array.from({ length: amount }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 0.8 + 0.15,
    a: Math.random() * 0.22 + 0.04,
    phase: Math.random() * TAU
  }));
}

function generateNetwork(requested) {
  const count = Math.max(50, Math.min(2000, Number(requested) || 480));
  displayCount = count;
  nodes = [];
  links = [];
  pulses = [];
  adjacency = [];
  waves = [];
  crystals = [];

  for (let i = 0; i < count; i++) {
    const arm = i % 5;
    const t = Math.pow(Math.random(), 0.64);
    const angle = t * 10.5 + arm * (TAU / 5) + randomGaussian() * 0.42;
    const radius = 70 + t * 520 + randomGaussian() * (38 + t * 52);
    const coreBias = Math.random() < 0.13;
    const x = coreBias ? randomGaussian() * 75 : Math.cos(angle) * radius;
    const y = coreBias ? randomGaussian() * 58 : Math.sin(angle) * radius * 0.57 + randomGaussian() * 36;
    const z = coreBias ? randomGaussian() * 85 : Math.sin(angle * 0.62) * 210 + randomGaussian() * 125;
    nodes.push({
      x, y, z,
      ox: x, oy: y, oz: z,
      size: Math.random() < 0.07 ? 2.3 + Math.random() * 2.2 : 0.55 + Math.random() * 1.35,
      energy: Math.random(),
      memory: 0,
      focus: 0,
      wave: 0,
      crystal: 0,
      crystalCharge: 0,
      deepX: randomGaussian() * 24,
      deepY: randomGaussian() * 18,
      deepZ: randomGaussian() * 55,
      phase: Math.random() * TAU,
      speed: 0.32 + Math.random() * 0.7,
      projected: null
    });
  }

  const cellSize = 105;
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;
  nodes.forEach((node, index) => {
    const k = key(node.x, node.y, node.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(index);
  });

  nodes.forEach((node, i) => {
    const gx = Math.floor(node.x / cellSize);
    const gy = Math.floor(node.y / cellSize);
    const gz = Math.floor(node.z / cellSize);
    const candidates = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
      if (bucket) candidates.push(...bucket);
    }
    candidates
      .filter(j => j > i)
      .map(j => {
        const other = nodes[j];
        const d = Math.hypot(node.x - other.x, node.y - other.y, node.z - other.z);
        return { j, d };
      })
      .filter(item => item.d < 118)
      .sort((a, b) => a.d - b.d)
      .slice(0, node.energy > .82 ? 4 : 2)
      .forEach(({ j, d }) => links.push({ a: i, b: j, distance: d, energy: Math.random(), plasticity: 0 }));
  });

  adjacency = Array.from({ length: count }, () => []);
  links.forEach((link, linkIndex) => {
    adjacency[link.a].push({ node: link.b, link: linkIndex });
    adjacency[link.b].push({ node: link.a, link: linkIndex });
  });

  const pulseCount = Math.min(42, Math.max(12, Math.floor(links.length / 38)));
  for (let i = 0; i < pulseCount; i++) {
    pulses.push({
      link: Math.floor(Math.random() * links.length),
      t: Math.random(),
      speed: .07 + Math.random() * .15,
      tone: Math.random(),
      voice: Math.floor(Math.random() * 5)
    });
  }

  countInput.value = count;
  rangeInput.value = count;
  setRangeFill();
  activeEl.textContent = String(count).padStart(4, '0');
  synapseEl.textContent = String(links.length).padStart(4, '0');
  nextAutoWave = performance.now() * .001 + 7 + Math.random() * 4;
  flashGeneration();
}

function setRangeFill() {
  const pct = ((Number(rangeInput.value) - 50) / 1950) * 100;
  rangeInput.style.setProperty('--fill', `${pct}%`);
}

function flashGeneration() {
  canvas.animate(
    [{ filter: 'brightness(1.65)' }, { filter: 'brightness(1)' }],
    { duration: 720, easing: 'cubic-bezier(.16,1,.3,1)' }
  );
  playGenerationImpact();
}

function rotatePoint(node, time) {
  const breathe = Math.sin(time * node.speed + node.phase) * 2.2;
  const compression = 1 - layerDepth * .045;
  let x = node.ox * compression + node.deepX * layerDepth + Math.cos(node.phase) * breathe;
  let y = node.oy * compression + node.deepY * layerDepth + Math.sin(node.phase) * breathe;
  let z = node.oz + node.deepZ * layerDepth + Math.sin(node.phase * 1.7) * breathe;

  const cy = Math.cos(rotation.y), sy = Math.sin(rotation.y);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const cx = Math.cos(rotation.x), sx = Math.sin(rotation.x);
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;

  const cameraDepth = 920 + z2 / zoom;
  if (!Number.isFinite(cameraDepth) || cameraDepth <= 60) {
    return { x: 0, y: 0, z: z2, scale: 0, visible: false };
  }
  const perspective = 780 / cameraDepth;
  return {
    x: width * (width < 760 ? .62 : .67) + x1 * perspective * zoom,
    y: height * .5 + y1 * perspective * zoom,
    z: z2,
    scale: perspective * zoom,
    visible: true
  };
}

function drawBackground(time) {
  ctx.fillStyle = '#030706';
  ctx.fillRect(0, 0, width, height);

  const [lr, lg, lb] = palette.line;
  const [br, bg, bb] = palette.bright;
  const glow = ctx.createRadialGradient(width * .65, height * .48, 10, width * .65, height * .48, Math.max(width, height) * .68);
  glow.addColorStop(0, `rgba(${lr},${lg},${lb},${.08 + layerDepth * .012})`);
  glow.addColorStop(.36, `rgba(${lr},${lg},${lb},.025)`);
  glow.addColorStop(1, 'rgba(1, 3, 2, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    const twinkle = .72 + Math.sin(time * .4 + star.phase) * .28;
    ctx.fillStyle = `rgba(${br},${bg},${bb},${star.a * twinkle})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fill();
  }
}

function beginPropagation(origin, time = performance.now() * .001, automatic = false) {
  if (origin < 0 || !nodes[origin] || !adjacency[origin]?.length) return;
  const distances = new Float32Array(nodes.length);
  distances.fill(-1);
  const hopLimit = automatic ? 9 : 12;
  const heap = [];
  let maxHop = 0;
  distances[origin] = 0;
  heapPush(heap, { node: origin, cost: 0 });

  while (heap.length) {
    const current = heapPop(heap);
    if (current.cost > distances[current.node] + .0001 || current.cost > hopLimit) continue;
    maxHop = Math.max(maxHop, current.cost);
    for (const neighbor of adjacency[current.node]) {
      const link = links[neighbor.link];
      const edgeCost = 1.08 - link.plasticity * .58 + (1 - link.energy) * .06;
      const nextCost = current.cost + edgeCost;
      if (nextCost > hopLimit) continue;
      if (distances[neighbor.node] !== -1 && distances[neighbor.node] <= nextCost) continue;
      distances[neighbor.node] = nextCost;
      heapPush(heap, { node: neighbor.node, cost: nextCost });
    }
  }

  waves.push({ origin, distances, start: time, maxHop, automatic });
  if (waves.length > 4) waves.shift();
  nodes[origin].memory = Math.min(1, nodes[origin].memory + .5);
  if (!automatic) {
    nodes[origin].crystalCharge = Math.min(1.2, nodes[origin].crystalCharge + .34);
    for (const neighbor of adjacency[origin]) {
      nodes[neighbor.node].crystalCharge = Math.min(1, nodes[neighbor.node].crystalCharge + .075);
    }
    const charged = [origin, ...adjacency[origin].map(item => item.node)]
      .sort((a, b) => nodes[b].crystalCharge - nodes[a].crystalCharge)[0];
    if (nodes[charged].crystalCharge > .88) formCrystal(charged, time);
  }
  playPropagationBloom(origin, automatic);
}

function findNearestNode(x, y) {
  let nearest = -1;
  let nearestDistance = 210;
  nodes.forEach((node, index) => {
    const p = node.projected;
    if (!p?.visible) return;
    const distance = Math.hypot(p.x - x, p.y - y);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function formCrystal(origin, time) {
  if (crystals.some(crystal => crystal.memberSet.has(origin))) return;
  const members = [origin];
  const seen = new Set(members);
  const frontier = [origin];

  while (frontier.length && members.length < 11) {
    const current = frontier.shift();
    const neighbors = adjacency[current]
      .slice()
      .sort((a, b) => {
        const scoreA = links[a.link].plasticity * .7 + nodes[a.node].energy * .3;
        const scoreB = links[b.link].plasticity * .7 + nodes[b.node].energy * .3;
        return scoreB - scoreA;
      });
    for (const neighbor of neighbors) {
      if (seen.has(neighbor.node)) continue;
      seen.add(neighbor.node);
      members.push(neighbor.node);
      frontier.push(neighbor.node);
      if (members.length >= 11) break;
    }
  }

  if (members.length < 4) return;
  members.forEach(index => { nodes[index].crystalCharge = 0; });
  crystals.push({ origin, members, memberSet: new Set(members), start: time, duration: 8.5, intensity: 0 });
  if (crystals.length > 3) crystals.shift();
  playCrystallization(origin);
}

function updateConsciousField(seconds, dt) {
  waves = waves.filter(wave => seconds < wave.start + wave.maxHop * .075 + 1.15);
  crystals = crystals.filter(crystal => seconds < crystal.start + crystal.duration);
  crystals.forEach(crystal => {
    const age = seconds - crystal.start;
    const formation = Math.min(1, Math.max(0, age / 1.15));
    const dissolution = Math.min(1, Math.max(0, (crystal.duration - age) / 1.6));
    crystal.intensity = formation * formation * (3 - 2 * formation) * dissolution;
  });
  const memoryLifetime = 32 + Math.sin(layerDepth * Math.PI * .5) * 22 - Math.max(0, layerDepth - 1) * 10;

  nodes.forEach((node, index) => {
    const p = node.projected;
    node.memory *= Math.exp(-dt / memoryLifetime);
    node.crystalCharge *= Math.exp(-dt / 85);
    node.wave = 0;
    node.crystal = 0;

    let focus = 0;
    if (pointer.active && p?.visible) {
      const distance = Math.hypot(p.x - pointer.x, p.y - pointer.y);
      focus = Math.max(0, 1 - distance / 190);
      focus *= focus;
    }
    node.focus += (focus - node.focus) * Math.min(1, dt * 9);

    if (node.focus > .01 && p?.visible) {
      p.x += (pointer.x - p.x) * node.focus * .075;
      p.y += (pointer.y - p.y) * node.focus * .075;
      node.memory = Math.min(1, node.memory + dt * node.focus * (dragging ? .34 : .09));
    }

    for (const wave of waves) {
      const hop = wave.distances[index];
      if (hop < 0) continue;
      const phase = seconds - wave.start - hop * .075;
      if (phase < 0 || phase > .82) continue;
      const attack = Math.min(1, phase / .075);
      const intensity = Math.sin(attack * Math.PI * .5) * Math.exp(-phase * 3.35);
      node.wave = Math.max(node.wave, intensity);
      node.memory = Math.min(1, node.memory + dt * intensity * .85);
    }

    for (const crystal of crystals) {
      if (!crystal.memberSet.has(index)) continue;
      node.crystal = Math.max(node.crystal, crystal.intensity);
      node.memory = Math.max(node.memory, crystal.intensity * .76);
    }
  });

  const plasticityDecay = Math.exp(-dt / 240);
  for (const link of links) {
    link.plasticity *= plasticityDecay;
    const activity = Math.min(nodes[link.a].wave, nodes[link.b].wave);
    if (activity > .015) link.plasticity = Math.min(1, link.plasticity + dt * activity * .3);
  }
}

function drawFocusField(time) {
  if (!pointer.active) return;
  const radius = 115 + Math.sin(time * 1.7) * 5;
  const [r, g, b] = palette.accent;
  const field = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius);
  field.addColorStop(0, `rgba(${r},${g},${b},.045)`);
  field.addColorStop(.45, `rgba(${r},${g},${b},.018)`);
  field.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = field;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, radius, 0, TAU);
  ctx.fill();
}

function drawPropagationOrigins(seconds) {
  const [r, g, b] = palette.accent;
  for (const wave of waves) {
    const age = seconds - wave.start;
    const origin = nodes[wave.origin]?.projected;
    if (age < 0 || age > .9 || !origin?.visible) continue;
    ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - age / .9) * (wave.automatic ? .18 : .42)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 5 + age * 58, 0, TAU);
    ctx.stroke();
  }
}

function drawCrystals(seconds) {
  for (const crystal of crystals) {
    const points = crystal.members
      .map(index => nodes[index].projected)
      .filter(point => point?.visible);
    if (points.length < 4 || crystal.intensity <= 0) continue;
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    center.x /= points.length;
    center.y /= points.length;
    points.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
    const formation = Math.min(1, Math.max(0, (seconds - crystal.start) / 1.15));
    const shaped = points.map(point => ({
      x: center.x + (point.x - center.x) * formation,
      y: center.y + (point.y - center.y) * formation
    }));
    const [r, g, b] = palette.accent;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${r},${g},${b},${crystal.intensity * .34})`;
    ctx.fillStyle = `rgba(${r},${g},${b},${crystal.intensity * .022})`;
    ctx.lineWidth = .8;
    ctx.shadowColor = `rgba(${r},${g},${b},.5)`;
    ctx.shadowBlur = 9 * crystal.intensity;
    ctx.beginPath();
    shaped.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${r},${g},${b},${crystal.intensity * .15})`;
    for (let i = 0; i < shaped.length; i += 2) {
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(shaped[i].x, shaped[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function draw(time) {
  const seconds = time * .001;
  const dt = Math.min(.04, (time - lastTime) / 1000);
  lastTime = time;
  rotation.x += (targetRotation.x - rotation.x) * .06;
  rotation.y += (targetRotation.y - rotation.y) * .06;
  zoom += (targetZoom - zoom) * .07;
  layerDepth += (targetLayerDepth - layerDepth) * .045;
  updatePalette();
  depthStateEl.textContent = palette.name;
  depthStateEl.style.color = `rgb(${palette.accent.join(',')})`;
  if (audio?.context.state === 'running') {
    const cutoff = layerDepth <= 1 ? 420 + layerDepth * 180 : 600 - (layerDepth - 1) * 300;
    audio.ambientFilter.frequency.value = cutoff;
  }
  if (!dragging) targetRotation.y += dt * (.018 - layerDepth * .003);

  drawBackground(seconds);
  nodes.forEach(node => { node.projected = rotatePoint(node, seconds); });
  updateConsciousField(seconds, dt);
  drawFocusField(seconds);

  if (seconds >= nextAutoWave && nodes.length) {
    const candidates = nodes
      .map((node, index) => ({ node, index }))
      .filter(item => item.node.energy > .68 && item.node.projected?.visible && adjacency[item.index]?.length);
    if (candidates.length) beginPropagation(candidates[Math.floor(Math.random() * candidates.length)].index, seconds, true);
    nextAutoWave = seconds + Math.max(8, 14 - layerDepth * 2.5) + Math.random() * 9;
  }

  ctx.lineCap = 'round';
  for (const link of links) {
    const a = nodes[link.a].projected;
    const b = nodes[link.b].projected;
    if (!a?.visible || !b?.visible) continue;
    const depth = Math.max(.08, Math.min(1, 1 - (a.z + b.z + 500) / 1800));
    const flicker = .7 + Math.sin(seconds * 1.3 + link.energy * 18) * .3;
    const memory = (nodes[link.a].memory + nodes[link.b].memory) * .5;
    const wave = Math.max(nodes[link.a].wave, nodes[link.b].wave);
    const plasticity = link.plasticity;
    const alpha = Math.min(.86, depth * .13 * flicker + memory * .13 + wave * .5 + plasticity * .18);
    const color = wave > .1 || plasticity > .48 ? palette.accent : palette.line;
    ctx.strokeStyle = `rgba(${color.join(',')},${alpha})`;
    ctx.lineWidth = Math.max(.25, depth * .72 + memory * .42 + wave * 1.25 + plasticity * .65);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  drawPropagationOrigins(seconds);
  drawCrystals(seconds);

  for (const pulse of pulses) {
    const link = links[pulse.link];
    if (!link) continue;
    const previousT = pulse.t;
    pulse.t = (pulse.t + dt * pulse.speed) % 1;
    const a = nodes[link.a].projected;
    const b = nodes[link.b].projected;
    if (!a?.visible || !b?.visible) continue;
    if (pulse.t < previousT) playSynapticPulse(pulse, link);
    const x = a.x + (b.x - a.x) * pulse.t;
    const y = a.y + (b.y - a.y) * pulse.t;
    const radius = Math.max(.5, Math.min(48, 7 * ((a.scale + b.scale) * .5)));
    const [ar, ag, ab] = palette.accent;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(${ar},${ag},${ab},.9)`);
    g.addColorStop(.2, `rgba(${ar},${ag},${ab},.4)`);
    g.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }

  const sorted = nodes.filter(node => node.projected?.visible).sort((a, b) => b.projected.z - a.projected.z);
  for (const node of sorted) {
    const p = node.projected;
    const depth = Math.max(.13, Math.min(1.2, 1 - (p.z + 390) / 1400));
    const beat = .78 + Math.sin(seconds * (1 + node.speed) + node.phase) * .22;
    const activation = node.focus * .38 + node.memory * .24 + node.wave * .82 + node.crystal * .45;
    const r = Math.max(.2, Math.min(24, node.size * p.scale * (node.energy > .88 ? 1.3 : 1) * (1 + activation)));
    if (r > 1.2) {
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5.5);
      halo.addColorStop(0, `rgba(${palette.bright.join(',')},${Math.min(.9, .48 * beat * depth + node.wave * .28 + node.focus * .14 + node.crystal * .18)})`);
      halo.addColorStop(.2, `rgba(${palette.accent.join(',')},${Math.min(.48, .18 * beat * depth + node.memory * .11)})`);
      halo.addColorStop(1, `rgba(${palette.accent.join(',')},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 5.5, 0, TAU);
      ctx.fill();
    }
    const bright = node.wave > .08 || node.focus > .2 || node.memory > .5;
    ctx.fillStyle = `rgba(${(bright || node.energy > .72 ? palette.bright : palette.dim).join(',')},${Math.min(1, depth * beat + activation * .28)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(.3, r), 0, TAU);
    ctx.fill();
  }

  coordsEl.innerHTML = `X ${(rotation.y * 28).toFixed(2)}&nbsp;&nbsp;Y ${(rotation.x * 28).toFixed(2)}&nbsp;&nbsp;Z ∞`;
  requestAnimationFrame(draw);
}

function clampCount(value) { return Math.max(50, Math.min(2000, Math.round(Number(value) / 10) * 10)); }

form.addEventListener('submit', event => {
  event.preventDefault();
  generateNetwork(clampCount(countInput.value));
});

rangeInput.addEventListener('input', () => {
  countInput.value = rangeInput.value;
  setRangeFill();
});
rangeInput.addEventListener('change', () => generateNetwork(rangeInput.value));
countInput.addEventListener('change', () => {
  const value = clampCount(countInput.value);
  countInput.value = value;
  rangeInput.value = value;
  setRangeFill();
});

document.querySelectorAll('.stepper').forEach(button => {
  button.addEventListener('click', () => {
    const value = clampCount(Number(countInput.value) + Number(button.dataset.step));
    countInput.value = value;
    rangeInput.value = value;
    setRangeFill();
  });
});

canvas.addEventListener('pointerdown', event => {
  dragging = true;
  pointer.active = true;
  pointer.moved = false;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;
  pointer.downX = event.clientX;
  pointer.downY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (!dragging) return;
  if (Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY) > 7) pointer.moved = true;
  targetRotation.y += (event.clientX - pointer.lastX) * .004;
  targetRotation.x += (event.clientY - pointer.lastY) * .004;
  targetRotation.x = Math.max(-1.1, Math.min(1.1, targetRotation.x));
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;
});
canvas.addEventListener('pointerup', event => {
  if (!pointer.moved) {
    const origin = findNearestNode(event.clientX, event.clientY);
    if (origin !== -1) beginPropagation(origin);
  }
  dragging = false;
});
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('pointerenter', event => {
  pointer.active = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});
canvas.addEventListener('pointerleave', () => {
  if (!dragging) pointer.active = false;
});
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  targetLayerDepth = Math.max(0, Math.min(2, targetLayerDepth + event.deltaY * .00135));
  targetZoom = 1 + targetLayerDepth * .27;
}, { passive: false });

depthStateEl.addEventListener('click', () => {
  targetLayerDepth = (Math.round(targetLayerDepth) + 1) % LAYERS.length;
  targetZoom = 1 + targetLayerDepth * .27;
});

function soundIsOn() {
  return soundButton.getAttribute('aria-pressed') === 'true';
}

function ensureAudio() {
  if (audio) return audio;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  const context = new AudioContext();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const ambientGain = context.createGain();
  const ambientFilter = context.createBiquadFilter();
  const fxBus = context.createGain();
  const sparkBus = context.createGain();
  const neuralBus = context.createGain();
  const convolver = context.createConvolver();
  const reverbFilter = context.createBiquadFilter();
  const reverbGain = context.createGain();

  master.gain.value = .72;
  compressor.threshold.value = -18;
  compressor.knee.value = 14;
  compressor.ratio.value = 4;
  compressor.attack.value = .008;
  compressor.release.value = .3;
  ambientGain.gain.value = .028;
  ambientFilter.type = 'lowpass';
  ambientFilter.frequency.value = 420;
  fxBus.gain.value = .52;
  sparkBus.gain.value = .46;
  neuralBus.gain.value = .42;
  reverbFilter.type = 'lowpass';
  reverbFilter.frequency.value = 2600;
  reverbGain.gain.value = .15;

  ambientFilter.connect(ambientGain).connect(master);
  fxBus.connect(master);
  sparkBus.connect(master);
  sparkBus.connect(convolver).connect(reverbFilter).connect(reverbGain).connect(master);
  neuralBus.connect(master);
  master.connect(compressor).connect(context.destination);

  [55, 82.5, 110].forEach((frequency, index) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = index === 1 ? 'sine' : 'triangle';
    osc.frequency.value = frequency;
    gain.gain.value = index === 0 ? .5 : .18;
    osc.connect(gain).connect(ambientFilter);
    osc.start();
  });

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < noiseData.length; i++) {
    const white = Math.random() * 2 - 1;
    brown = brown * .965 + white * .035;
    noiseData[i] = Math.max(-1, Math.min(1, brown * 3.1));
  }

  const airBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const airData = airBuffer.getChannelData(0);
  let air = 0;
  for (let i = 0; i < airData.length; i++) {
    const white = Math.random() * 2 - 1;
    air = white * .72 + air * .28;
    airData[i] = air;
  }

  const reverbBuffer = context.createBuffer(2, context.sampleRate * 2.4, context.sampleRate);
  for (let channel = 0; channel < reverbBuffer.numberOfChannels; channel++) {
    const data = reverbBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const decay = Math.pow(1 - i / data.length, 3.4);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  convolver.buffer = reverbBuffer;

  audio = { context, master, ambientFilter, fxBus, sparkBus, neuralBus, noiseBuffer, airBuffer };
  return audio;
}

function playGenerationImpact() {
  if (!soundIsOn()) return;
  const system = audio;
  if (!system) return;
  const { context, fxBus, noiseBuffer } = system;
  if (context.state !== 'running') return;
  const now = context.currentTime;

  const sub = context.createOscillator();
  const subGain = context.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(72, now);
  sub.frequency.exponentialRampToValueAtTime(24, now + 1.65);
  subGain.gain.setValueAtTime(.0001, now);
  subGain.gain.exponentialRampToValueAtTime(.24, now + .025);
  subGain.gain.exponentialRampToValueAtTime(.0001, now + 1.75);
  sub.connect(subGain).connect(fxBus);
  sub.start(now);
  sub.stop(now + 1.8);

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = noiseBuffer;
  noiseFilter.type = 'lowpass';
  noiseFilter.Q.value = 1.4;
  noiseFilter.frequency.setValueAtTime(210, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(46, now + 1.1);
  noiseGain.gain.setValueAtTime(.11, now);
  noiseGain.gain.exponentialRampToValueAtTime(.0001, now + 1.25);
  noise.connect(noiseFilter).connect(noiseGain).connect(fxBus);
  noise.start(now);
  noise.stop(now + 1.3);
}

function playSynapticPulse(pulse, link) {
  if (!soundIsOn() || !audio || audio.context.state !== 'running') return;
  const { context, neuralBus, noiseBuffer } = audio;
  const now = context.currentTime;
  if (now - lastNeuralSound < .06) return;
  lastNeuralSound = now;

  const cutoffFrequency = 520 + pulse.tone * 760 + link.energy * 280;
  const duration = .19 + pulse.tone * .18;
  const eventBus = context.createGain();
  const destination = context.createStereoPanner ? context.createStereoPanner() : null;

  const discharge = context.createBufferSource();
  const lowFilter = context.createBiquadFilter();
  const highFilter = context.createBiquadFilter();
  const dischargeGain = context.createGain();
  discharge.buffer = noiseBuffer;
  highFilter.type = 'highpass';
  highFilter.frequency.value = 120 + pulse.tone * 90;
  highFilter.Q.value = .35;
  lowFilter.type = 'lowpass';
  lowFilter.Q.value = .45;
  lowFilter.frequency.setValueAtTime(cutoffFrequency * .74, now);
  lowFilter.frequency.exponentialRampToValueAtTime(cutoffFrequency, now + duration * .6);
  dischargeGain.gain.setValueAtTime(.0001, now);
  dischargeGain.gain.exponentialRampToValueAtTime(.027 + link.energy * .014, now + .032);
  dischargeGain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  discharge.connect(highFilter).connect(lowFilter).connect(dischargeGain).connect(eventBus);

  if (destination) {
    const a = nodes[link.a].projected;
    const b = nodes[link.b].projected;
    const x = a && b ? (a.x + b.x) * .5 : width * .5;
    destination.pan.value = Math.max(-.84, Math.min(.84, (x / width - .5) * 1.7));
    eventBus.connect(destination).connect(neuralBus);
  } else {
    eventBus.connect(neuralBus);
  }
  const offset = Math.random() * Math.max(.01, noiseBuffer.duration - duration - .02);
  discharge.start(now, offset, duration + .01);
  discharge.stop(now + duration + .02);
}

function playPropagationBloom(origin, automatic) {
  if (!soundIsOn() || !audio || audio.context.state !== 'running') return;
  const { context, sparkBus, airBuffer } = audio;
  const now = context.currentTime;
  const air = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const tremolo = context.createOscillator();
  const tremoloDepth = context.createGain();
  const destination = context.createStereoPanner ? context.createStereoPanner() : null;
  const duration = automatic ? .9 : 1.18;

  air.buffer = airBuffer;
  filter.type = 'bandpass';
  filter.Q.value = .72;
  filter.frequency.setValueAtTime(170, now);
  filter.frequency.exponentialRampToValueAtTime(automatic ? 1550 : 2350, now + duration * .76);
  filter.frequency.exponentialRampToValueAtTime(760, now + duration);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(automatic ? .017 : .031, now + .085);
  gain.gain.setValueAtTime(automatic ? .014 : .026, now + duration * .48);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  tremolo.type = 'sine';
  tremolo.frequency.value = automatic ? 11.5 : 14.5;
  tremoloDepth.gain.setValueAtTime(.0001, now);
  tremoloDepth.gain.exponentialRampToValueAtTime(automatic ? .0028 : .005, now + .09);
  tremoloDepth.gain.exponentialRampToValueAtTime(.0001, now + duration);
  tremolo.connect(tremoloDepth).connect(gain.gain);
  air.connect(filter).connect(gain);

  if (destination) {
    const projected = nodes[origin]?.projected;
    const startPan = projected ? Math.max(-.72, Math.min(.72, (projected.x / width - .5) * 1.5)) : 0;
    destination.pan.setValueAtTime(startPan, now);
    destination.pan.linearRampToValueAtTime(startPan * -.28, now + duration);
    gain.connect(destination).connect(sparkBus);
  } else {
    gain.connect(sparkBus);
  }
  const offset = Math.random() * Math.max(.01, airBuffer.duration - duration - .02);
  air.start(now, offset, duration + .01);
  air.stop(now + duration + .02);
  tremolo.start(now);
  tremolo.stop(now + duration);
}

function playCrystallization(origin) {
  if (!soundIsOn() || !audio || audio.context.state !== 'running') return;
  const { context, fxBus, sparkBus, airBuffer } = audio;
  const now = context.currentTime;
  const duration = 3.6;
  const air = context.createBufferSource();
  const airFilter = context.createBiquadFilter();
  const airGain = context.createGain();
  const sub = context.createOscillator();
  const subGain = context.createGain();
  const destination = context.createStereoPanner ? context.createStereoPanner() : null;

  air.buffer = airBuffer;
  airFilter.type = 'bandpass';
  airFilter.Q.value = .55;
  airFilter.frequency.setValueAtTime(240, now);
  airFilter.frequency.exponentialRampToValueAtTime(920, now + 1.4);
  airFilter.frequency.exponentialRampToValueAtTime(330, now + duration);
  airGain.gain.setValueAtTime(.0001, now);
  airGain.gain.exponentialRampToValueAtTime(.017, now + .35);
  airGain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  air.connect(airFilter).connect(airGain);

  if (destination) {
    const projected = nodes[origin]?.projected;
    destination.pan.value = projected ? Math.max(-.55, Math.min(.55, (projected.x / width - .5) * 1.15)) : 0;
    airGain.connect(destination).connect(sparkBus);
  } else {
    airGain.connect(sparkBus);
  }

  sub.type = 'sine';
  sub.frequency.setValueAtTime(46, now);
  sub.frequency.exponentialRampToValueAtTime(61, now + 1.2);
  sub.frequency.exponentialRampToValueAtTime(39, now + duration);
  subGain.gain.setValueAtTime(.0001, now);
  subGain.gain.exponentialRampToValueAtTime(.018, now + .22);
  subGain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  sub.connect(subGain).connect(fxBus);

  const offset = Math.random() * Math.max(.01, airBuffer.duration - 1.8);
  air.loop = true;
  air.start(now, offset);
  air.stop(now + duration + .02);
  sub.start(now);
  sub.stop(now + duration + .02);
}

function toggleSound() {
  const system = ensureAudio();
  if (!system) return;
  const on = soundButton.getAttribute('aria-pressed') !== 'true';
  soundButton.setAttribute('aria-pressed', String(on));
  soundLabel.textContent = on ? 'SOUND ON' : 'SOUND OFF';
  if (on) system.context.resume(); else system.context.suspend();
}

function activateDefaultSound(event) {
  if (!soundIsOn()) return;
  if (event?.target === soundButton || soundButton.contains(event?.target)) return;
  const system = ensureAudio();
  if (system) system.context.resume();
}

soundButton.addEventListener('click', toggleSound);
window.addEventListener('pointerdown', activateDefaultSound, { once: true, capture: true });
window.addEventListener('keydown', activateDefaultSound, { once: true, capture: true });
window.addEventListener('resize', resize);
resize();
generateNetwork(480);
requestAnimationFrame(draw);

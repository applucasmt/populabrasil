import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================
// REGIÕES (fallback)
// ============================================================
const REGIOES = {
  'Norte':        { lat: -4.0,  lon: -62.0, cor: 0x22c55e },
  'Nordeste':     { lat: -8.0,  lon: -40.0, cor: 0xf59e0b },
  'Centro-Oeste': { lat: -14.0, lon: -52.0, cor: 0xef4444 },
  'Sudeste':      { lat: -20.0, lon: -45.0, cor: 0x3b82f6 },
  'Sul':          { lat: -27.0, lon: -51.0, cor: 0xa855f7 }
};

// Mapeamento UF → Região
const UF_REGIAO = {
  AC:'Norte', AM:'Norte', AP:'Norte', PA:'Norte', RO:'Norte', RR:'Norte', TO:'Norte',
  AL:'Nordeste', BA:'Nordeste', CE:'Nordeste', MA:'Nordeste', PB:'Nordeste',
  PE:'Nordeste', PI:'Nordeste', RN:'Nordeste', SE:'Nordeste',
  DF:'Centro-Oeste', GO:'Centro-Oeste', MT:'Centro-Oeste', MS:'Centro-Oeste',
  ES:'Sudeste', MG:'Sudeste', RJ:'Sudeste', SP:'Sudeste',
  PR:'Sul', RS:'Sul', SC:'Sul'
};

// ============================================================
// CONVERSÃO LAT/LON → CENA
// ============================================================
const LAT_MIN = -34, LAT_MAX = 6;
const LON_MIN = -74, LON_MAX = -34;
const SCALE_X = 30 / (LON_MAX - LON_MIN);
const SCALE_Z = 30 / (LAT_MAX - LAT_MIN);

function latLonParaCena(lat, lon) {
  const x = (lon - LON_MIN) * SCALE_X - 15;
  const z = -(lat - LAT_MIN) * SCALE_Z + 15;
  return new THREE.Vector3(x, 1.5, z);
}

// ============================================================
// CENA
// ============================================================
const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e1a);
scene.fog = new THREE.Fog(0x0a0e1a, 45, 130);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 30, 45);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 12;
controls.maxDistance = 90;

// ============================================================
// LUZES
// ============================================================
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(25, 40, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x3b82f6, 0.4);
fill.position.set(-20, 15, -20);
scene.add(fill);

// ============================================================
// OCEANO
// ============================================================
const oceanGeo = new THREE.PlaneGeometry(200, 200, 80, 80);
const oceanMat = new THREE.MeshPhongMaterial({
  color: 0x1e3a8a, transparent: true, opacity: 0.9,
  shininess: 120, specular: 0x60a5fa
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.3;
ocean.receiveShadow = true;
scene.add(ocean);
const oceanOrig = Float32Array.from(oceanGeo.attributes.position.array);

// ============================================================
// PALETA DE CORES POR ESTADO
// ============================================================
const CORES_UF = {
  AC:0x2e8b57, AL:0xf59e0b, AM:0x16a34a, AP:0x22c55e, BA:0xca8a04,
  CE:0xea580c, DF:0xdc2626, ES:0x2563eb, GO:0xf97316, MA:0xfacc15,
  MG:0x3b82f6, MS:0xdc2626, MT:0xf97316, PA:0x15803d, PB:0xfbbf24,
  PE:0xef4444, PI:0xfde047, PR:0xa855f7, RJ:0x1d4ed8, RN:0xf59e0b,
  RO:0x166534, RR:0x22c55e, RS:0x7c3aed, SC:0x9333ea, SE:0xfacc15,
  SP:0x1e40af, TO:0xca8a04
};

// ============================================================
// CARREGAR E DESENHAR ESTADOS (GeoJSON REAL)
// ============================================================
async function carregarEstados() {
  const resp = await fetch('data/estados.geojson');
  const geojson = await resp.json();

  const grupo = new THREE.Group();

  for (const feature of geojson.features) {
    const props = feature.properties;
    const uf = (props.sigla || props.SIGLA || props.UF || props.abbrev || '').toUpperCase();
    const nome = props.name || props.NAME || props.nome || uf;
    if (!uf) continue;

    const cor = CORES_UF[uf] ?? 0x22c55e;

    try {
      const mesh = gerarMeshEstado(feature.geometry, cor);
      if (mesh) {
        mesh.userData = { uf, nome };
        grupo.add(mesh);
      }
    } catch (e) {
      console.warn('Erro no estado', uf, e);
    }
  }

  scene.add(grupo);

  // Fronteiras brancas por cima
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
  for (const feature of geojson.features) {
    const lines = gerarLinhasEstado(feature.geometry);
    lines.forEach(line => {
      line.material = lineMat;
      grupo.add(line);
    });
  }
}

function gerarMeshEstado(geometry, cor) {
  if (!geometry) return null;

  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates
    : [];

  const group = new THREE.Group();

  for (const polygon of polygons) {
    const outer = polygon[0];
    const buracos = polygon.slice(1);

    const shape = new THREE.Shape();
    outer.forEach(([lon, lat], i) => {
      const p = latLonParaCena(lat, lon);
      if (i === 0) shape.moveTo(p.x, -p.z);
      else shape.lineTo(p.x, -p.z);
    });

    for (const hole of buracos) {
      const path = new THREE.Path();
      hole.forEach(([lon, lat], i) => {
        const p = latLonParaCena(lat, lon);
        if (i === 0) path.moveTo(p.x, -p.z);
        else path.lineTo(p.x, -p.z);
      });
      shape.holes.push(path);
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.6, bevelEnabled: false
    });
    geo.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: cor, roughness: 0.7, metalness: 0.1
    }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

function gerarLinhasEstado(geometry) {
  const lines = [];
  const coords = geometry.type === 'Polygon' ? geometry.coordinates
    : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat()
    : [];

  for (const ring of coords) {
    const points = ring.map(([lon, lat]) => {
      const p = latLonParaCena(lat, lon);
      return new THREE.Vector3(p.x, 0.65, -p.z);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    lines.push(new THREE.Line(geo));
  }
  return lines;
}

// ============================================================
// CASA 3D
// ============================================================
function criarCasa(fotoURL, usuario, nome) {
  const grupo = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1, 1.3),
    new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.8 })
  );
  base.position.y = 0.5;
  base.castShadow = base.receiveShadow = true;
  grupo.add(base);

  const telhado = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, 0.9, 4),
    new THREE.MeshStandardMaterial({ color: 0xd97706 })
  );
  telhado.position.y = 1.45;
  telhado.rotation.y = Math.PI / 4;
  telhado.castShadow = true;
  grupo.add(telhado);

  const porta = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.6, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x78350f })
  );
  porta.position.set(0, 0.3, 0.66);
  grupo.add(porta);

  let placaMat;
  if (fotoURL) {
    placaMat = new THREE.MeshBasicMaterial({ transparent: true });
    placaMat.map = new THREE.TextureLoader().load(fotoURL);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((usuario[1] || '?').toUpperCase(), 64, 92);
    placaMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
  }

  const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), placaMat);
  placa.position.set(0, 1.05, 0.66);
  grupo.add(placa);

  const mastro = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x444 })
  );
  mastro.position.y = 2.3;
  grupo.add(mastro);

  const bandeira = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, side: THREE.DoubleSide })
  );
  bandeira.position.set(0.2, 2.6, 0);
  bandeira.userData.bandeira = true;
  grupo.add(bandeira);

  grupo.userData = { usuario, nome, fotoURL };
  return grupo;
}

// ============================================================
// BARCO
// ============================================================
function criarBarco() {
  const barco = new THREE.Group();

  const casco = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x8b4513 })
  );
  casco.position.y = 0.3;
  casco.castShadow = true;
  barco.add(casco);

  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POSSÍVEIS MORADORES', 256, 55);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('aguardando comentário...', 256, 90);

  const placa = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide })
  );
  placa.position.set(0, 1.6, 0);
  barco.add(placa);

  const mastro = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x333 })
  );
  mastro.position.set(-1.8, 0.8, 0);
  barco.add(mastro);

  barco.position.set(22, 0, 5);
  barco.userData = { passageiros: [] };
  return barco;
}

// ============================================================
// VOZ
// ============================================================
let vozAtivada = false;
let vozesDisponiveis = [];

function carregarVozes() { vozesDisponiveis = speechSynthesis.getVoices(); }
if ('speechSynthesis' in window) {
  carregarVozes();
  speechSynthesis.onvoiceschanged = carregarVozes;
}

const btnVoz = document.getElementById('btnVoz');
btnVoz.addEventListener('click', () => {
  vozAtivada = true;
  btnVoz.textContent = '🔊 Voz Ativada';
  btnVoz.classList.add('ativo');
  falar('Voz ativada! Bem-vindo ao Brasil 3D.');
});

function falar(texto) {
  if (!vozAtivada || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(texto);
  utt.lang = 'pt-BR';
  utt.rate = 1.0;
  utt.pitch = 1.1;
  const vozBR = vozesDisponiveis.find(v => v.lang === 'pt-BR')
              || vozesDisponiveis.find(v => v.lang.startsWith('pt'));
  if (vozBR) utt.voice = vozBR;
  speechSynthesis.speak(utt);
}

// ============================================================
// CÂMERA ANIMADA
// ============================================================
let camAnim = null;
function voarPara(alvo, duracao = 2000, offset = new THREE.Vector3(0, 9, 11)) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const destino = alvo.clone().add(offset);
  const inicio = performance.now();
  camAnim = () => {
    const t = Math.min((performance.now() - inicio) / duracao, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(startPos, destino, ease);
    controls.target.lerpVectors(startTarget, alvo, ease);
    controls.update();
    if (t >= 1) camAnim = null;
  };
}

// ============================================================
// MORADORES
// ============================================================
let barco;
const casas = [];

async function carregarMoradores() {
  barco = criarBarco();
  scene.add(barco);

  try {
    const resp = await fetch('data/moradores.json?t=' + Date.now());
    const data = await resp.json();
    for (const m of data.moradores || []) {
      if (m.comentou) adicionarCasa(m);
      else adicionarAoBarco(m);
    }
  } catch (e) {
    console.warn('Sem moradores ainda:', e);
  }
  atualizarStats();
}

function adicionarCasa(m) {
  const casa = criarCasa(m.foto, m.usuario, m.nome);

  let pos;
  if (m.lat && m.lon) {
    pos = latLonParaCena(m.lat, m.lon);
  } else if (m.uf && REGIOES[UF_REGIAO[m.uf]]) {
    pos = latLonParaCena(REGIOES[UF_REGIAO[m.uf]].lat, REGIOES[UF_REGIAO[m.uf]].lon);
  } else {
    pos = new THREE.Vector3(0, 1.5, 0);
  }

  casa.position.copy(pos);
  casa.position.y = 1.2;
  casa.position.x += (Math.random() - 0.5) * 1.5;
  casa.position.z += (Math.random() - 0.5) * 1.5;

  casa.position.y = 18;
  casa.scale.setScalar(0.01);
  scene.add(casa);
  casas.push(casa);

  const inicio = performance.now();
  const anim = () => {
    const t = Math.min((performance.now() - inicio) / 1000, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    casa.position.y = 18 + (1.2 - 18) * ease;
    casa.scale.setScalar(ease);
    if (t < 1) requestAnimationFrame(anim);
  };
  anim();
}

function adicionarAoBarco(m) {
  const idx = barco.userData.passageiros.length;
  const avatar = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x22c55e })
  );
  avatar.position.set(
    -1.2 + (idx % 5) * 0.6,
    0.95 + Math.floor(idx / 5) * 0.55,
    0.4
  );
  barco.add(avatar);

  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(4, 4, 248, 56);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(m.usuario, 128, 38);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), depthTest: false
  }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.copy(avatar.position).add(new THREE.Vector3(0, 0.55, 0));
  barco.add(sprite);

  barco.userData.passageiros.push(m);
}

function atualizarStats() {
  document.getElementById('totalCasas').textContent = `${casas.length} casas`;
  document.getElementById('totalBarco').textContent =
    `${barco?.userData.passageiros.length || 0} no barco`;
}

// ============================================================
// BOTÕES DE REGIÃO
// ============================================================
document.querySelectorAll('#legenda button').forEach(btn => {
  btn.addEventListener('click', () => {
    const regiao = btn.dataset.regiao;
    if (regiao === 'BRASIL') {
      voarPara(new THREE.Vector3(0, 1.5, 0), 1800, new THREE.Vector3(0, 22, 32));
      return;
    }
    const cfg = REGIOES[regiao];
    if (!cfg) return;
    voarPara(latLonParaCena(cfg.lat, cfg.lon), 1600);
    if (vozAtivada) setTimeout(() => falar(`Região ${regiao}!`), 200);
  });
});

// ============================================================
// TOOLTIP
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltipEl = document.createElement('div');
tooltipEl.className = 'tooltip';
tooltipEl.style.display = 'none';
document.body.appendChild(tooltipEl);

addEventListener('mousemove', e => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(casas, true);

  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && !obj.userData.usuario) obj = obj.parent;
    if (obj.userData.usuario) {
      tooltipEl.innerHTML = `<strong>${obj.userData.usuario}</strong> · ${obj.userData.nome}`;
      tooltipEl.style.left = e.clientX + 'px';
      tooltipEl.style.top = e.clientY + 'px';
      tooltipEl.style.display = 'block';
      return;
    }
  }
  tooltipEl.style.display = 'none';
});

// ============================================================
// LOOP
// ============================================================
const clock = new THREE.Clock();
function animar() {
  requestAnimationFrame(animar);
  const t = clock.getElapsedTime();

  const pos = ocean.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = oceanOrig[i * 3], y = oceanOrig[i * 3 + 1];
    pos.array[i * 3 + 2] = Math.sin(x * 0.25 + t) * 0.3 + Math.cos(y * 0.25 + t * 0.8) * 0.2;
  }
  pos.needsUpdate = true;
  ocean.geometry.computeVertexNormals();

  if (barco) {
    barco.position.y = Math.sin(t * 1.1) * 0.15;
    barco.rotation.z = Math.sin(t * 0.9) * 0.04;
  }

  casas.forEach(c => c.children.forEach(ch => {
    if (ch.userData.bandeira) ch.rotation.y = Math.sin(t * 3 + c.position.x) * 0.35;
  }));

  if (camAnim) camAnim();
  controls.update();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============================================================
// INIT
// ============================================================
(async () => {
  try {
    await carregarEstados();
  } catch (e) {
    console.error('Erro ao carregar estados:', e);
    alert('Erro ao carregar o mapa. Verifique se data/estados.geojson existe.');
  }
  await carregarMoradores();
  document.getElementById('loading').classList.add('hide');
  animar();

  camera.position.set(35, 30, 45);
  setTimeout(() => {
    voarPara(new THREE.Vector3(0, 1.5, 0), 2500, new THREE.Vector3(0, 22, 32));
  }, 200);
})();

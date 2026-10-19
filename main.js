import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================
// CONFIGURAÇÃO DAS REGIÕES
// ============================================================
const REGIOES = {
  'Norte':        { lat: -4.0,  lon: -62.0, cor: 0x22c55e },
  'Nordeste':     { lat: -8.0,  lon: -40.0, cor: 0xf59e0b },
  'Centro-Oeste': { lat: -14.0, lon: -52.0, cor: 0xef4444 },
  'Sudeste':      { lat: -20.0, lon: -45.0, cor: 0x3b82f6 },
  'Sul':          { lat: -27.0, lon: -51.0, cor: 0xa855f7 }
};

// Coordenadas de referência para conversão lat/lon → cena
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
// CENA / CÂMERA / RENDERER
// ============================================================
const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e1a);
scene.fog = new THREE.Fog(0x0a0e1a, 40, 110);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 30, 45);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 15;
controls.maxDistance = 80;
controls.target.set(0, 0, 0);

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
// OCEANO COM ONDAS
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
// MAPA REAL DO BRASIL (silhueta simplificada oficial)
// Pontos extraídos de um SVG do IBGE (simplificado)
// ============================================================
const BRASIL_PONTOS = [
  // Norte / Amazônia
  [-69.5, 0.5], [-69.0, -1.0], [-67.5, -2.5], [-65.0, -4.0],
  [-62.5, -5.0], [-60.0, -6.5], [-58.0, -7.5], [-56.0, -8.0],
  // Nordeste (litoral norte)
  [-53.0, -7.5], [-50.0, -6.0], [-48.0, -3.5], [-46.0, -2.5],
  [-44.0, -2.0], [-41.5, -2.8], [-39.0, -3.5], [-37.0, -5.0],
  [-35.5, -7.0], [-35.0, -9.0], [-36.0, -11.0], [-37.5, -12.5],
  // Litoral leste / Sudeste
  [-38.5, -14.0], [-39.0, -16.0], [-40.0, -18.0], [-40.5, -20.0],
  [-42.0, -22.0], [-44.0, -23.0], [-46.5, -24.0], [-48.0, -25.5],
  // Sul
  [-48.5, -27.0], [-49.0, -29.0], [-50.5, -30.5], [-52.0, -32.0],
  [-53.5, -33.5], [-54.5, -34.0],
  // Fronteira sul/oeste
  [-56.0, -33.0], [-57.5, -31.0], [-57.0, -29.0], [-55.0, -27.0],
  [-54.5, -25.5], [-54.0, -24.0], [-57.0, -22.5], [-58.0, -21.0],
  [-58.0, -19.5], [-58.5, -17.0], [-60.0, -15.0], [-62.5, -13.0],
  [-65.0, -11.0], [-67.0, -10.0], [-70.0, -9.5], [-71.5, -8.0],
  [-73.0, -7.5], [-73.5, -6.0], [-72.5, -4.0], [-71.0, -2.5],
  [-70.0, -1.0]
];

function criarMapaBrasil() {
  // Converte lat/lon → coordenadas da cena
  const pontos = BRASIL_PONTOS.map(([lon, lat]) => {
    const x = (lon - LON_MIN) * SCALE_X - 15;
    const z = -(lat - LAT_MIN) * SCALE_Z + 15;
    return [x, -z]; // Shape usa XY, depois rotacionamos
  });

  const shape = new THREE.Shape();
  pontos.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();

  const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.0,
    bevelEnabled: true,
    bevelSize: 0.15,
    bevelThickness: 0.15,
    bevelSegments: 2
  });
  extrudeGeo.rotateX(-Math.PI / 2);
  extrudeGeo.translate(0, 0.5, 0);

  // Base verde
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1f8a4c, roughness: 0.75, metalness: 0.05
  });
  const mapa = new THREE.Mesh(extrudeGeo, mat);
  mapa.castShadow = true;
  mapa.receiveShadow = true;
  scene.add(mapa);

  // Contorno brilhante
  const edges = new THREE.EdgesGeometry(extrudeGeo);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x4ade80, linewidth: 2 })
  );
  scene.add(line);

  // Marcadores de região (cilindros finos coloridos)
  Object.entries(REGIOES).forEach(([nome, cfg]) => {
    const pos = latLonParaCena(cfg.lat, cfg.lon);
    const marcador = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.15, 16),
      new THREE.MeshBasicMaterial({ color: cfg.cor, transparent: true, opacity: 0.8 })
    );
    marcador.position.copy(pos);
    marcador.position.y = 1.1;
    scene.add(marcador);

    // Anel pulsante
    const anel = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.45, 32),
      new THREE.MeshBasicMaterial({ color: cfg.cor, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    anel.rotation.x = -Math.PI / 2;
    anel.position.copy(pos);
    anel.position.y = 1.15;
    anel.userData.pulse = true;
    scene.add(anel);
  });
}

criarMapaBrasil();

// ============================================================
// CASA 3D
// ============================================================
function criarCasa(fotoURL, usuario, nome) {
  const grupo = new THREE.Group();

  // Base
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1, 1.3),
    new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.8 })
  );
  base.position.y = 0.5;
  base.castShadow = true;
  base.receiveShadow = true;
  grupo.add(base);

  // Telhado
  const telhado = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, 0.9, 4),
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 })
  );
  telhado.position.y = 1.45;
  telhado.rotation.y = Math.PI / 4;
  telhado.castShadow = true;
  grupo.add(telhado);

  // Porta
  const porta = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.6, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x78350f })
  );
  porta.position.set(0, 0.3, 0.66);
  grupo.add(porta);

  // Foto na fachada
  const textureLoader = new THREE.TextureLoader();
  let textura;
  try {
    textura = textureLoader.load(fotoURL);
  } catch (e) {
    textura = null;
  }

  const placaMat = new THREE.MeshBasicMaterial({ transparent: true });
  if (textura) {
    placaMat.map = textura;
  } else {
    // Fallback: inicial do usuário
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((usuario[1] || '?').toUpperCase(), 64, 92);
    placaMat.map = new THREE.CanvasTexture(canvas);
  }

  const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), placaMat);
  placa.position.set(0, 1.05, 0.66);
  grupo.add(placa);

  // Mastro com bandeira
  const mastro = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x444444 })
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
// BARCO "POSSÍVEIS MORADORES"
// ============================================================
function criarBarco() {
  const barco = new THREE.Group();

  const casco = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 })
  );
  casco.position.y = 0.3;
  casco.castShadow = true;
  barco.add(casco);

  const proa = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 0.6, 16, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x8b4513 })
  );
  proa.rotation.z = Math.PI / 2;
  proa.position.set(1.5, 0.3, 0);
  barco.add(proa);

  // Placa principal
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POSSÍVEIS MORADORES', 256, 55);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('aguardando comentário...', 256, 90);

  const textura = new THREE.CanvasTexture(canvas);
  const placa = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 1),
    new THREE.MeshBasicMaterial({ map: textura, side: THREE.DoubleSide })
  );
  placa.position.set(0, 1.6, 0);
  barco.add(placa);

  const mastro = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  mastro.position.set(-1.8, 0.8, 0);
  barco.add(mastro);

  // Posição inicial: no mar, à direita do Brasil
  barco.position.set(22, 0, 5);
  barco.userData = { passageiros: [] };
  return barco;
}

// ============================================================
// ANIMAÇÃO DE CÂMERA (voa até posição)
// ============================================================
let camAnim = null;

function voarPara(alvo, duracao = 2000, offset = new THREE.Vector3(0, 9, 11)) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const destinoCam = alvo.clone().add(offset);
  const inicio = performance.now();

  camAnim = () => {
    const t = Math.min((performance.now() - inicio) / duracao, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    camera.position.lerpVectors(startPos, destinoCam, ease);
    controls.target.lerpVectors(startTarget, alvo, ease);
    controls.update();

    if (t >= 1) camAnim = null;
  };
}

// ============================================================
// VOZ (TTS) — CORRIGIDO COM BOTÃO
// ============================================================
let vozAtivada = false;
let vozesDisponiveis = [];

function carregarVozes() {
  vozesDisponiveis = speechSynthesis.getVoices();
}

if ('speechSynthesis' in window) {
  carregarVozes();
  speechSynthesis.onvoiceschanged = carregarVozes;
}

const btnVoz = document.getElementById('btnVoz');
btnVoz.addEventListener('click', () => {
  vozAtivada = true;
  btnVoz.textContent = '🔊 Voz Ativada';
  btnVoz.classList.add('ativo');
  // Fala de teste (desbloqueia a síntese)
  falar('Voz ativada! Bem-vindo ao Brasil 3D.');
});

function falar(texto) {
  if (!vozAtivada) return;
  if (!('speechSynthesis' in window)) return;

  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(texto);
  utt.lang = 'pt-BR';
  utt.rate = 1.0;
  utt.pitch = 1.1;
  utt.volume = 1.0;

  const vozBR = vozesDisponiveis.find(v => v.lang === 'pt-BR')
              || vozesDisponiveis.find(v => v.lang.startsWith('pt'));
  if (vozBR) utt.voice = vozBR;

  speechSynthesis.speak(utt);
}

// ============================================================
// POPULAR O MUNDO
// ============================================================
let barco;
const casas = [];

async function carregarMoradores() {
  try {
    const resp = await fetch('data/moradores.json?t=' + Date.now());
    const data = await resp.json();

    barco = criarBarco();
    scene.add(barco);

    for (const m of data.moradores) {
      if (m.comentou) {
        adicionarCasa(m);
      } else {
        adicionarAoBarco(m);
      }
    }
    atualizarStats();
  } catch (err) {
    console.error('Erro ao carregar moradores:', err);
    // Mesmo com erro, cria o barco
    barco = criarBarco();
    scene.add(barco);
  }
}

function adicionarCasa(morador) {
  const casa = criarCasa(morador.foto, morador.usuario, morador.nome);
  const pos = latLonParaCena(
    REGIOES[morador.regiao].lat,
    REGIOES[morador.regiao].lon
  );
  casa.position.copy(pos);
  casa.position.y = 1.2;

  // Espalhamento para não sobrepor
  casa.position.x += (Math.random() - 0.5) * 3;
  casa.position.z += (Math.random() - 0.5) * 3;

  // Estado inicial: caindo do céu
  casa.position.y = 18;
  casa.scale.setScalar(0.01);
  scene.add(casa);
  casas.push(casa);

  // Animação de entrada
  const inicio = performance.now();
  const animEntrada = () => {
    const t = Math.min((performance.now() - inicio) / 1000, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    casa.position.y = 18 + (1.2 - 18) * ease;
    casa.scale.setScalar(ease);
    if (t < 1) requestAnimationFrame(animEntrada);
  };
  animEntrada();

  return casa;
}

function adicionarAoBarco(morador) {
  const idx = barco.userData.passageiros.length;

  // Avatar (esfera colorida)
  const avatar = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x22c55e })
  );
  avatar.position.set(
    -1.2 + (idx % 5) * 0.6,
    0.95 + Math.floor(idx / 5) * 0.55,
    0.4
  );
  avatar.castShadow = true;
  barco.add(avatar);

  // Balão com nome
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.beginPath();
  ctx.roundRect?.(4, 4, 248, 56, 12);
  ctx.fillRect(4, 4, 248, 56);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(morador.usuario, 128, 38);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false })
  );
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.copy(avatar.position).add(new THREE.Vector3(0, 0.55, 0));
  barco.add(sprite);

  barco.userData.passageiros.push(morador);
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
    const pos = latLonParaCena(cfg.lat, cfg.lon);
    voarPara(pos, 1600);

    // Fala ao clicar
    if (vozAtivada) {
      setTimeout(() => falar(`Região ${regiao}!`), 200);
    }
  });
});

// ============================================================
// RAYCASTER — Tooltip ao passar o mouse nas casas
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let tooltipEl = null;

function criarTooltip() {
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip';
  tooltipEl.style.display = 'none';
  document.body.appendChild(tooltipEl);
}
criarTooltip();

addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(casas, true);

  if (hits.length > 0) {
    // Encontra a casa raiz
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
// LOOP DE RENDERIZAÇÃO
// ============================================================
const clock = new THREE.Clock();

function animar() {
  requestAnimationFrame(animar);
  const t = clock.getElapsedTime();

  // Ondas do oceano
  const pos = ocean.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = oceanOrig[i * 3];
    const y = oceanOrig[i * 3 + 1];
    pos.array[i * 3 + 2] = Math.sin(x * 0.25 + t) * 0.3
                         + Math.cos(y * 0.25 + t * 0.8) * 0.2;
  }
  pos.needsUpdate = true;
  ocean.geometry.computeVertexNormals();

  // Balanço do barco
  if (barco) {
    barco.position.y = Math.sin(t * 1.1) * 0.15;
    barco.rotation.z = Math.sin(t * 0.9) * 0.04;
  }

  // Bandeiras animadas
  casas.forEach(c => {
    c.children.forEach(child => {
      if (child.userData.bandeira) {
        child.rotation.y = Math.sin(t * 3 + c.position.x) * 0.35;
      }
    });
  });

  // Pulsar dos anéis de região
  scene.traverse(obj => {
    if (obj.userData.pulse) {
      const s = 1 + Math.sin(t * 2) * 0.3;
      obj.scale.set(s, s, s);
      obj.material.opacity = 0.4 + Math.sin(t * 2) * 0.3;
    }
  });

  if (camAnim) camAnim();
  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// RESIZE + INIT
// ============================================================
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Inicialização
carregarMoradores().then(() => {
  document.getElementById('loading').classList.add('hide');
  animar();

  // Voo inicial: entra pelo mar e pousa no Brasil
  camera.position.set(35, 30, 45);
  setTimeout(() => {
    voarPara(new THREE.Vector3(0, 1.5, 0), 2500, new THREE.Vector3(0, 22, 32));
  }, 200);

  // Se já tem moradores, fala o primeiro
  setTimeout(() => {
    if (vozAtivada && casas.length > 0) {
      const primeiro = casas[0].userData;
      falar(`Obrigado por seguir ${primeiro.nome}, seja bem-vindo ao nosso Brasil!`);
    }
  }, 3000);
});

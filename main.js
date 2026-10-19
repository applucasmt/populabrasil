import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

// Correção PeerJS
const Peer = window.Peer;

// ============================================================
// REGIÕES E COORDENADAS
// ============================================================
const REGIOES = {
  'Norte':        { lat: -4.0,  lon: -62.0 },
  'Nordeste':     { lat: -8.0,  lon: -40.0 },
  'Centro-Oeste': { lat: -14.0, lon: -52.0 },
  'Sudeste':      { lat: -20.0, lon: -45.0 },
  'Sul':          { lat: -27.0, lon: -51.0 }
};

const LAT_MIN = -34, LAT_MAX = 6;
const LON_MIN = -74, LON_MAX = -34;
const SCALE_X = 30 / (LON_MAX - LON_MIN);
const SCALE_Z = 30 / (LAT_MAX - LAT_MIN);

function latLonParaCena(lat, lon) {
  const x = (lon - LON_MIN) * SCALE_X - 15;
  const z = -(lat - LAT_MIN) * SCALE_Z + 15;
  return new THREE.Vector3(x, 1.0, z);
}

const CORES_UF = {
  AC:0x2e8b57, AL:0xf59e0b, AM:0x16a34a, AP:0x22c55e, BA:0xca8a04,
  CE:0xea580c, DF:0xdc2626, ES:0x2563eb, GO:0xf97316, MA:0xfacc15,
  MG:0x3b82f6, MS:0xdc2626, MT:0xf97316, PA:0x15803d, PB:0xfbbf24,
  PE:0xef4444, PI:0xfde047, PR:0xa855f7, RJ:0x1d4ed8, RN:0xf59e0b,
  RO:0x166534, RR:0x22c55e, RS:0x7c3aed, SC:0x9333ea, SE:0xfacc15,
  SP:0x1e40af, TO:0xca8a04
};

// ============================================================
// CENA / CÂMERA / RENDERER
// ============================================================
const app = document.getElementById('app');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 30, 45);

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 10;
controls.maxDistance = 100;

// ============================================================
// CÉU E LUZES REALISTAS
// ============================================================
const sky = new Sky();
sky.scale.setScalar(45000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 10;
skyUniforms['rayleigh'].value = 2;
skyUniforms['mieCoefficient'].value = 0.005;
skyUniforms['mieDirectionalG'].value = 0.8;

const sunPos = new THREE.Vector3();
const phi = THREE.MathUtils.degToRad(90 - 15);
const theta = THREE.MathUtils.degToRad(180);
sunPos.setFromSphericalCoords(1, phi, theta);
skyUniforms['sunPosition'].value.copy(sunPos);

const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
sunLight.position.copy(sunPos).multiplyScalar(100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -40;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -40;
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// ============================================================
// OCEANO
// ============================================================
const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
const waterNormals = new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', (tex) => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
});

const water = new Water(waterGeometry, {
  textureWidth: 1024, textureHeight: 1024, waterNormals: waterNormals,
  sunDirection: new THREE.Vector3(), sunColor: 0xffffff, waterColor: 0x001e3a,
  distortionScale: 4.0, fog: scene.fog !== undefined
});
water.rotation.x = -Math.PI / 2;
water.position.y = -0.3;
scene.add(water);

// ============================================================
// MAPA DO BRASIL
// ============================================================
const grupoMapa = new THREE.Group();
const grupoBordas = new THREE.Group();
const estadosClique = []; 
scene.add(grupoMapa);
scene.add(grupoBordas);

async function carregarEstados() {
  const resp = await fetch('data/estados.geojson');
  const geojson = await resp.json();

  for (const feature of geojson.features) {
    const uf = (feature.properties.sigla || feature.properties.SIGLA || '').toUpperCase();
    if (!uf) continue;
    
    const cor = CORES_UF[uf] ?? 0x22c55e;
    const geo = feature.geometry;
    const polygons = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];

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
      
      const geoBase = new THREE.ShapeGeometry(shape);
      geoBase.rotateX(-Math.PI / 2);
      const meshBase = new THREE.Mesh(geoBase, new THREE.MeshStandardMaterial({
        color: new THREE.Color(cor).multiplyScalar(0.6), roughness: 0.8
      }));
      meshBase.position.y = 0.85;
      meshBase.receiveShadow = true;
      meshBase.userData = { uf, isEstado: true };
      grupoMapa.add(meshBase);

      const geoTela = new THREE.ShapeGeometry(shape);
      geoTela.rotateX(-Math.PI / 2);
      const meshTela = new THREE.Mesh(geoTela, new THREE.MeshStandardMaterial({
        color: cor, roughness: 0.5, metalness: 0.1
      }));
      meshTela.position.y = 1.0;
      meshTela.castShadow = true;
      meshTela.receiveShadow = true;
      meshTela.userData = { uf, isEstado: true };
      
      grupoMapa.add(meshTela);
      estadosClique.push(meshTela);

      const pos = geoTela.attributes.position;
      const points = [];
      for (let i = 0; i < pos.count; i++) {
        points.push(new THREE.Vector3(pos.getX(i), 1.01, pos.getZ(i)));
      }
      
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ 
        color: 0xffffff, transparent: true, opacity: 0.7 
      }));
      grupoBordas.add(line);
    }
  }
}

// ============================================================
// CASAS
// ============================================================
function criarCasa(fotoURL, usuario, nome) {
  const grupo = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 1.3), new THREE.MeshStandardMaterial({ color: 0xf5f5dc }));
  base.position.y = 0.5; base.castShadow = true; base.receiveShadow = true;
  grupo.add(base);

  const telhado = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0xd97706 }));
  telhado.position.y = 1.45; telhado.rotation.y = Math.PI / 4; telhado.castShadow = true;
  grupo.add(telhado);

  let placaMat;
  if (fotoURL) {
    placaMat = new THREE.MeshBasicMaterial({ transparent: true });
    placaMat.map = new THREE.TextureLoader().load(fotoURL);
  } else {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#22c55e'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText((usuario[1] || '?').toUpperCase(), 64, 92);
    placaMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
  }

  const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), placaMat);
  placa.position.set(0, 1.05, 0.66);
  grupo.add(placa);

  const bandeira = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), new THREE.MeshStandardMaterial({ color: 0x22c55e, side: THREE.DoubleSide }));
  bandeira.position.set(0.2, 2.6, 0); bandeira.userData.bandeira = true;
  grupo.add(bandeira);

  grupo.userData = { usuario, nome, fotoURL };
  return grupo;
}

// ============================================================
// BARCO
// ============================================================
let barco;
const shipHitbox = new THREE.Mesh(new THREE.BoxGeometry(15, 10, 15), new THREE.MeshBasicMaterial({ visible: false }));

async function criarBarco() {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load('assets/barco.glb', (gltf) => {
      barco = gltf.scene;
      barco.scale.set(2, 2, 2); 
      barco.position.set(24, 0.2, 5);
      barco.rotation.y = -0.8;
      barco.traverse(c => { if(c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      
      adicionarItensAoBarco();
      barco.add(shipHitbox);
      resolve(barco);
    }, undefined, () => {
      barco = new THREE.Group();
      const matMad = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
      const matVel = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, side: THREE.DoubleSide });
      const casco = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 1.4), matMad);
      casco.position.y = 0.3; casco.castShadow = true; barco.add(casco);
      const proa = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.5, 4), matMad);
      proa.rotation.z = -Math.PI / 2; proa.rotation.y = Math.PI / 4;
      proa.position.set(1.8, 0.3, 0); barco.add(proa);
      const cabine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9), matMad);
      cabine.position.set(-0.8, 0.9, 0); barco.add(cabine);
      const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3), matMad);
      mastro.position.set(0.5, 1.8, 0); barco.add(mastro);
      const vela = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), matVel);
      vela.position.set(0.5, 2.0, 0); vela.rotation.y = Math.PI / 2; barco.add(vela);
      barco.position.set(24, 0.2, 5);
      barco.rotation.y = -0.8;
      adicionarItensAoBarco();
      barco.add(shipHitbox);
      resolve(barco);
    });
  });
}

function adicionarItensAoBarco() {
  barco.userData = { passageiros: [] };
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#22c55e'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('POSSÍVEIS MORADORES', 256, 55);
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#94a3b8';
  ctx.fillText('aguardando comentário...', 256, 90);
  
  const placa = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 0.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide })
  );
  placa.position.set(0, 1.8, 0.5);
  barco.add(placa);
}

// ============================================================
// MORADORES
// ============================================================
const casas = [];
async function carregarMoradores() {
  barco = await criarBarco();
  scene.add(barco);

  try {
    const resp = await fetch('data/moradores.json?t=' + Date.now());
    const data = await resp.json();
    for (const m of data.moradores || []) {
      if (m.comentou && m.lat && m.lon) adicionarCasa(m);
      else adicionarAoBarco(m);
    }
  } catch (e) { console.warn('Sem moradores ainda:', e); }
  atualizarStats();
}

function adicionarCasa(m) {
  const casa = criarCasa(m.foto, m.usuario, m.nome);
  const pos = latLonParaCena(m.lat, m.lon);
  casa.position.copy(pos);
  casa.position.y = 1.5;
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
    casa.position.y = 18 + (1.5 - 18) * ease;
    casa.scale.setScalar(ease);
    if (t < 1) requestAnimationFrame(anim);
  };
  anim();
}

function adicionarAoBarco(m) {
  const idx = barco.userData.passageiros.length;
  const avatar = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: 0x22c55e }));
  avatar.position.set(-1.0 + (idx % 4) * 0.6, 1.0 + Math.floor(idx / 4) * 0.45, 0.2);
  barco.add(avatar);

  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(4, 4, 248, 56);
  ctx.fillStyle = '#4ade80'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(m.usuario, 128, 38);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.copy(avatar.position).add(new THREE.Vector3(0, 0.45, 0));
  barco.add(sprite);

  barco.userData.passageiros.push(m);
}

function atualizarStats() {
  document.getElementById('totalCasas').textContent = `${casas.length} casas`;
  document.getElementById('totalBarco').textContent = `${barco?.userData.passageiros.length || 0} no barco`;
}

// ============================================================
// VOZ (TTS)
// ============================================================
let vozAtivada = false;
let vozesDisponiveis = [];
if ('speechSynthesis' in window) {
  vozesDisponiveis = speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => vozesDisponiveis = speechSynthesis.getVoices();
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
  utt.lang = 'pt-BR'; utt.rate = 1.0; utt.pitch = 1.1;
  const vozBR = vozesDisponiveis.find(v => v.lang === 'pt-BR') || vozesDisponiveis.find(v => v.lang.startsWith('pt'));
  if (vozBR) utt.voice = vozBR;
  speechSynthesis.speak(utt);
}

// ============================================================
// CÂMERA, CLIQUE, FPS E PINTURA COM SPRAY
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

document.querySelectorAll('#legenda button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (modoPrimeiraPessoa) return; // Não deixa navegar no mapa se estiver no barco
    const regiao = btn.dataset.regiao;
    if (regiao === 'BRASIL') {
      voarPara(new THREE.Vector3(0, 1.5, 0), 1800, new THREE.Vector3(0, 25, 35));
      return;
    }
    const cfg = REGIOES[regiao];
    if (!cfg) return;
    voarPara(latLonParaCena(cfg.lat, cfg.lon), 1600);
    if (vozAtivada) setTimeout(() => falar(`Região ${regiao}!`), 200);
  });
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltipEl = document.createElement('div');
tooltipEl.className = 'tooltip';
tooltipEl.style.display = 'none';
document.body.appendChild(tooltipEl);

function getIntersects(e, objects) {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObjects(objects, true);
}

// Variáveis de Estado
let modoPrimeiraPessoa = false;
let modoSpray = false;
let corSpray = '#ff0000';
let estaPintando = false;

// Setup do controle de movimentação WASD
const keys = { w: false, a: false, s: false, d: false };
let yaw = 0, pitch = 0;

addEventListener('keydown', (e) => {
  if (!modoPrimeiraPessoa) return;
  switch(e.key.toLowerCase()) {
    case 'w': keys.w = true; break;
    case 'a': keys.a = true; break;
    case 's': keys.s = true; break;
    case 'd': keys.d = true; break;
  }
});
addEventListener('keyup', (e) => {
  switch(e.key.toLowerCase()) {
    case 'w': keys.w = false; break;
    case 'a': keys.a = false; break;
    case 's': keys.s = false; break;
    case 'd': keys.d = false; break;
  }
});

// Mouse Look (Olhar ao redor) dentro do navio
addEventListener('mousemove', e => {
  if (modoPrimeiraPessoa) {
    if (modoSpray && estaPintando) {
      // Se estiver pintando, não gira a câmera, aplica o spray!
      const hits = getIntersects(e, [barco]);
      if (hits.length > 0 && hits[0].object.isMesh) {
        const mesh = hits[0].object;
        const point = hits[0].point;
        
        // Cria um pequeno círculo de tinta no ponto exato
        const splatGeo = new THREE.CircleGeometry(0.15, 8);
        const splatMat = new THREE.MeshBasicMaterial({ color: corSpray, side: THREE.DoubleSide });
        const splat = new THREE.Mesh(splatGeo, splatMat);
        
        // Posiciona a tinta no local e alinha com a normal da parede
        splat.position.copy(point);
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        const normal = hits[0].face.normal.clone().applyMatrix3(normalMatrix).normalize();
        splat.lookAt(point.clone().add(normal));
        splat.position.add(normal.multiplyScalar(0.01)); // Empurra um pouquinho pra não bugar
        
        scene.add(splat);
      }
    } else {
      // Movimento normal da câmera
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, pitch));
    }
  } else {
    // Hover do mapa e barco
    const hitsBarco = getIntersects(e, [shipHitbox]);
    if (hitsBarco.length > 0) {
      tooltipEl.innerHTML = `<strong>Navio Interativo</strong> · Clique para entrar (1ª Pessoa)`;
      tooltipEl.style.left = e.clientX + 'px'; tooltipEl.style.top = e.clientY + 'px';
      tooltipEl.style.display = 'block';
      document.body.style.cursor = 'pointer';
      return;
    }

    const hits = getIntersects(e, casas);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj.parent && !obj.userData.usuario) obj = obj.parent;
      if (obj.userData.usuario) {
        tooltipEl.innerHTML = `<strong>${obj.userData.usuario}</strong> · ${obj.userData.nome}`;
        tooltipEl.style.left = e.clientX + 'px'; tooltipEl.style.top = e.clientY + 'px';
        tooltipEl.style.display = 'block';
        document.body.style.cursor = 'pointer';
        return;
      }
    }
    
    const hitsEstado = getIntersects(e, estadosClique);
    if (hitsEstado.length > 0) {
      const uf = hitsEstado[0].object.userData.uf;
      tooltipEl.innerHTML = `<strong>${uf}</strong> · Clique para explorar`;
      tooltipEl.style.left = e.clientX + 'px'; tooltipEl.style.top = e.clientY + 'px';
      tooltipEl.style.display = 'block';
      document.body.style.cursor = 'pointer';
    } else {
      tooltipEl.style.display = 'none';
      document.body.style.cursor = 'default';
    }
  }
});

addEventListener('mousedown', (e) => {
  if (modoPrimeiraPessoa && modoSpray) estaPintando = true;
});

addEventListener('mouseup', () => {
  estaPintando = false;
});

addEventListener('click', e => {
  if (modoPrimeiraPessoa) return; // Ignora clique se estiver dentro do navio

  const hitsBarco = getIntersects(e, [shipHitbox]);
  if (hitsBarco.length > 0) {
    modoPrimeiraPessoa = true;
    controls.enabled = false; // Desativa o OrbitControls
    document.getElementById('ship-ui').classList.add('active');
    document.getElementById('customize-panel').classList.add('active');
    
    // Posiciona a câmera no convés
    camera.position.set(barco.position.x, barco.position.y + 2.5, barco.position.z + 2);
    yaw = barco.rotation.y; pitch = 0;
    
    if (vozAtivada) falar("Bem-vindo ao navio! Use W, A, S, D para andar.");
    return;
  }

  const hitsEstado = getIntersects(e, estadosClique);
  if (hitsEstado.length > 0) {
    const meshClicado = hitsEstado[0].object;
    meshClicado.geometry.computeBoundingBox();
    const centro = new THREE.Vector3();
    meshClicado.geometry.boundingBox.getCenter(centro);
    
    const posGlobal = meshClicado.localToWorld(centro);
    posGlobal.y = 1.0;
    
    voarPara(posGlobal, 1500, new THREE.Vector3(0, 8, 10));
    if (vozAtivada) setTimeout(() => falar(`Explorando o estado ${meshClicado.userData.uf}`), 200);
  }
});

function fecharNavio() {
  document.getElementById('ship-ui').classList.remove('active');
  modoPrimeiraPessoa = false;
  modoSpray = false;
  controls.enabled = true;
  voarPara(new THREE.Vector3(0, 1.5, 0), 1800, new THREE.Vector3(0, 25, 35)); // Volta pra visão geral
}
window.fecharNavio = fecharNavio; // Torna global pro HTML

// ============================================================
// PEERJS: CHAT GLOBAL E CUSTOMIZAÇÃO
// ============================================================
const ROOM_ID = 'brasil3d-sala-global-v3';
let peer, connections = [];

if (Peer) {
  peer = new Peer(ROOM_ID); 
  peer.on('open', (id) => console.log('Conectado à sala:', id));
  peer.on('connection', (conn) => {
    connections.push(conn);
    conn.on('data', (data) => {
      if (data.type === 'chat') addChatMessage(data.user, data.text);
    });
  });
}

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

document.getElementById('chat-send').addEventListener('click', () => {
  const text = chatInput.value.trim();
  const user = prompt("Seu nome no chat:", "Visitante") || "Visitante";
  if (text) {
    addChatMessage(user, text);
    connections.forEach(conn => { if (conn.open) conn.send({ type: 'chat', user, text }); });
    chatInput.value = '';
  }
});

function addChatMessage(user, text) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<strong>${user}:</strong> ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById('save-custom').addEventListener('click', () => {
  document.getElementById('customize-panel').classList.remove('active');
});

// BOTÃO DE SPRAY
const btnSpray = document.createElement('button');
btnSpray.textContent = 'Ativar Spray (Pintar)';
btnSpray.style.cssText = 'width:100%; background:#eab308; color:#000; font-weight:bold; border:none; padding:8px; border-radius:6px; cursor:pointer; margin-bottom:8px;';
btnSpray.onclick = () => {
  if (!modoSpray) {
    const cor = prompt("Digite a cor HEX do spray (ex: #ff0000):", corSpray);
    if (cor) corSpray = cor;
    modoSpray = true;
    btnSpray.textContent = '🛑 Parar Spray';
    btnSpray.style.background = '#ef4444';
    btnSpray.style.color = '#fff';
    falar("Modo spray ativado. Clique e arraste no navio para pintar.");
  } else {
    modoSpray = false;
    btnSpray.textContent = 'Ativar Spray (Pintar)';
    btnSpray.style.background = '#eab308';
    btnSpray.style.color = '#000';
  }
};
document.querySelector('#ship-ui div:last-child').insertBefore(btnSpray, document.getElementById('btn-cartaz'));

// BOTÃO DE CARTAZ (Mantido)
document.getElementById('btn-cartaz').addEventListener('click', () => {
  const url = prompt("Cole a URL da imagem do cartaz:");
  if (url) {
    new THREE.TextureLoader().load(url, (tex) => {
      const cartaz = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), new THREE.MeshBasicMaterial({ map: tex }));
      cartaz.position.set(barco.position.x, barco.position.y + 4, barco.position.z + 3);
      scene.add(cartaz);
    });
  }
});

// ============================================================
// LOOP DE ANIMAÇÃO
// ============================================================
const clock = new THREE.Clock();
function animar() {
  requestAnimationFrame(animar);
  const t = clock.getElapsedTime();

  water.material.uniforms['time'].value += 0.5 / 60.0;

  if (barco) {
    barco.position.y = Math.sin(t * 1.5) * 0.15;
    barco.rotation.z = Math.sin(t * 1.0) * 0.05;
    barco.rotation.x = Math.cos(t * 0.8) * 0.03;
    shipHitbox.position.copy(barco.position);
    
    if (modoPrimeiraPessoa) {
      // 1. Movimentação FPS (WASD)
      const speed = 0.1;
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
      const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, yaw, 0));
      
      if (keys.w) camera.position.add(forward.clone().multiplyScalar(speed));
      if (keys.s) camera.position.add(forward.clone().multiplyScalar(-speed));
      if (keys.a) camera.position.add(right.clone().multiplyScalar(-speed));
      if (keys.d) camera.position.add(right.clone().multiplyScalar(speed));
      
      // 2. A câmera acompanha o balanço do barco
      camera.position.y = barco.position.y + 2.5;
      
      // 3. Aplica o mouse look na câmera
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }

    barco.children.forEach(ch => {
      if (ch.userData.bandeira) ch.rotation.y = Math.sin(t * 3) * 0.3;
    });
  }

  casas.forEach(c => c.children.forEach(ch => {
    if (ch.userData.bandeira) ch.rotation.y = Math.sin(t * 3 + c.position.x) * 0.35;
  }));

  if (camAnim) camAnim();
  if (!modoPrimeiraPessoa) controls.update();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

(async () => {
  try { await carregarEstados(); } catch (e) { console.error(e); }
  await carregarMoradores();
  document.getElementById('loading').classList.add('hide');
  animar();

  camera.position.set(35, 30, 45);
  setTimeout(() => { voarPara(new THREE.Vector3(0, 1.0, 0), 2500, new THREE.Vector3(0, 25, 35)); }, 200);
})();

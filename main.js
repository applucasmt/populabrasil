import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

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
// CÉU E LUZES
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
// MAPA
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
let collidersBarco = [];

async function criarBarco() {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load('assets/barco.glb', (gltf) => {
      barco = gltf.scene;
      barco.scale.set(2, 2, 2); 
      barco.position.set(24, 0.2, 5);
      barco.rotation.y = -0.8;
      
      barco.traverse(c => { 
        if(c.isMesh) { 
          c.castShadow = true; 
          c.receiveShadow = true; 
          c.userData.isBarco = true; 
          collidersBarco.push(c); 
        } 
      });
      
      adicionarItensAoBarco();
      resolve(barco);
    }, undefined, () => {
      barco = new THREE.Group();
      const matMad = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
      const casco = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 1.4), matMad);
      casco.position.y = 0.3; casco.castShadow = true; casco.userData.isBarco = true; barco.add(casco);
      collidersBarco.push(casco);
      barco.position.set(24, 0.2, 5);
      barco.rotation.y = -0.8;
      adicionarItensAoBarco();
      resolve(barco);
    });
  });
}

function adicionarItensAoBarco() {
  barco.userData = { passageiros: [] };
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
// VOZ
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
// CÂMERA E FPS
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
    if (modoPrimeiraPessoa) return; 
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

let modoPrimeiraPessoa = false;
let modoSpray = false;
let estaPintando = false;
let alturaCamera = 0; 
let corSpray = "#ff0000";
let velocidadeY = 0; 
let noChao = false;

const keys = { w: false, a: false, s: false, d: false, space: false };
let yaw = 0, pitch = 0;

// ============================================================
// MODELO DE SPRAY NA MÃO
// ============================================================
let maoSpray;
const particulasTinta = [];

function criarMaoSpray() {
  maoSpray = new THREE.Group();
  
  // Lata de Spray
  const lataGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.25, 16);
  const lataMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
  const lata = new THREE.Mesh(lataGeo, lataMat);
  lata.position.set(0.3, -0.3, -0.6); 
  maoSpray.add(lata);

  // Bico do Spray
  const bico = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  bico.position.set(0.3, -0.18, -0.6); 
  bico.rotation.x = Math.PI / 2;
  maoSpray.add(bico);

  // Braço (Apenas um cilindro bege)
  const braco = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xffcc99 }));
  braco.position.set(0.3, -0.5, -0.4);
  braco.rotation.x = -Math.PI / 4;
  maoSpray.add(braco);

  camera.add(maoSpray);
  scene.add(camera);
  maoSpray.visible = false; // Esconde por padrão
}

function atirarTinta() {
  if (!modoSpray || !estaPintando) return;
  
  // Cria uma partícula
  const pGeo = new THREE.SphereGeometry(0.02, 4, 4);
  const pMat = new THREE.MeshBasicMaterial({ color: corSpray });
  const particula = new THREE.Mesh(pGeo, pMat);
  
  // Pega a posição do bico do spray no mundo
  const posBico = new THREE.Vector3();
  const bicoObj = maoSpray.children[1]; // O cone do bico
  bicoObj.getWorldPosition(posBico);
  particula.position.copy(posBico);
  
  // Direção: para onde a câmera está olhando
  const direcao = new THREE.Vector3();
  camera.getWorldDirection(direcao);
  
  // Adiciona um pouco de aleatoriedade (spray)
  direcao.x += (Math.random() - 0.5) * 0.05;
  direcao.y += (Math.random() - 0.5) * 0.05;
  direcao.z += (Math.random() - 0.5) * 0.05;
  
  scene.add(particula);
  particulasTinta.push({
    mesh: particula,
    vel: direcao.multiplyScalar(0.3),
    vida: 0.5
  });
}

// ============================================================
// ATALHOS E CONTROLES
// ============================================================
addEventListener('keydown', (e) => {
  if (!modoPrimeiraPessoa) return;
  
  switch(e.key.toLowerCase()) {
    case 'w': keys.w = true; break;
    case 'a': keys.a = true; break;
    case 's': keys.s = true; break;
    case 'd': keys.d = true; break;
    case ' ':
      if (noChao) {
        velocidadeY = 0.15; // Pulo
        noChao = false;
      }
      break;
    case 't': 
      e.preventDefault();
      document.exitPointerLock();
      document.getElementById('chat-input').focus();
      break;
    case 'p':
      toggleSpray();
      break;
    case 'i':
      document.getElementById('file-cartaz').click();
      // Não chama exitPointerLock, o file picker já tira o foco
      break;
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

addEventListener('mousemove', e => {
  if (modoPrimeiraPessoa) {
    if (modoSpray && estaPintando) {
      const hits = getIntersects(e, collidersBarco); 
      if (hits.length > 0 && hits[0].object.isMesh) {
        const mesh = hits[0].object;
        const point = hits[0].point;
        
        const splatGeo = new THREE.CircleGeometry(0.15, 8);
        const splatMat = new THREE.MeshBasicMaterial({ color: corSpray, side: THREE.DoubleSide });
        const splat = new THREE.Mesh(splatGeo, splatMat);
        
        barco.attach(splat);
        splat.position.copy(point);
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        const normal = hits[0].face.normal.clone().applyMatrix3(normalMatrix).normalize();
        splat.lookAt(point.clone().add(normal));
        splat.position.add(normal.multiplyScalar(0.01)); 
      }
    } else {
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, pitch));
    }
  } else {
    const hitsBarco = getIntersects(e, [barco]);
    if (hitsBarco.length > 0) {
      tooltipEl.innerHTML = `<strong>Navio Interativo</strong> · Clique para entrar`;
      tooltipEl.style.left = e.clientX + 'px'; tooltipEl.style.top = e.clientY + 'px';
      tooltipEl.style.display = 'block';
      document.body.style.cursor = 'pointer';
      return;
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
  if (modoPrimeiraPessoa) return; 

  const hitsBarco = getIntersects(e, [barco]);
  if (hitsBarco.length > 0) {
    modoPrimeiraPessoa = true;
    controls.enabled = false;
    document.getElementById('ship-ui').classList.add('active');
    
    renderer.domElement.requestPointerLock();
    camera.fov = 75;
    camera.updateProjectionMatrix();
    
    const startPos = barco.position.clone();
    startPos.y += 1.8; 
    startPos.z += 3;   
    camera.position.copy(startPos);
    
    yaw = barco.rotation.y; pitch = 0;
    
    if (vozAtivada) falar("Bem-vindo ao navio! [T] Chat, [P] Spray, [I] Imagem.");
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

// SAIR DO NAVIO
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && modoPrimeiraPessoa) {
    // Se o file picker estiver aberto, não fecha!
    if (document.activeElement && document.activeElement.id === 'file-cartaz') return;
    fecharNavio();
  }
});

function fecharNavio() {
  if (!modoPrimeiraPessoa) return;
  modoPrimeiraPessoa = false;
  modoSpray = false;
  estaPintando = false;
  controls.enabled = true;
  document.getElementById('ship-ui').classList.remove('active');
  camera.fov = 45;
  camera.updateProjectionMatrix();
  if (maoSpray) maoSpray.visible = false;
  voarPara(new THREE.Vector3(0, 1.5, 0), 1800, new THREE.Vector3(0, 25, 35));
}
window.fecharNavio = fecharNavio;

// ============================================================
// PEERJS E UI
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
    if (modoPrimeiraPessoa) renderer.domElement.requestPointerLock();
  }
});

function addChatMessage(user, text) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<strong>${user}:</strong> ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

const btnSpray = document.getElementById('btn-pixar');
const colorPicker = document.getElementById('color-picker');

colorPicker.addEventListener('input', (e) => {
  corSpray = e.target.value;
});

function toggleSpray() {
  if (!modoSpray) {
    modoSpray = true;
    btnSpray.textContent = '🛑 Parar Spray';
    btnSpray.style.background = '#ef4444';
    btnSpray.style.color = '#fff';
    if (maoSpray) maoSpray.visible = true;
    falar("Spray ativado.");
  } else {
    modoSpray = false;
    estaPintando = false;
    btnSpray.textContent = '🎨 Ativar Spray';
    btnSpray.style.background = '#eab308';
    btnSpray.style.color = '#000';
    if (maoSpray) maoSpray.visible = false;
  }
}

btnSpray.addEventListener('click', () => {
  toggleSpray();
  if (modoPrimeiraPessoa) setTimeout(() => renderer.domElement.requestPointerLock(), 100);
});

// ENVIAR CARTAZ (Ajustado para colar na parede)
const btnCartaz = document.getElementById('btn-cartaz');
const fileInput = document.getElementById('file-cartaz');

btnCartaz.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const tex = new THREE.TextureLoader().load(event.target.result);
    const cartaz = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    
    // Faz um Raycast do centro da tela para achar a parede
    const raycasterCentro = new THREE.Raycaster();
    raycasterCentro.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycasterCentro.intersectObjects(collidersBarco, false);

    if (hits.length > 0) {
      const mesh = hits[0].object;
      const point = hits[0].point;
      
      // Cola o cartaz no barco, no ponto exato e na inclinação da parede
      barco.attach(cartaz);
      cartaz.position.copy(point);
      
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const normal = hits[0].face.normal.clone().applyMatrix3(normalMatrix).normalize();
      
      // Olha na direção contrária à parede (para a imagem ficar de frente)
      const lookAtPoint = point.clone().sub(normal);
      cartaz.lookAt(lookAtPoint);
      
      cartaz.position.add(normal.multiplyScalar(0.02)); // Empurra um pouquinho pra não bugar
    } else {
      // Se não tiver mirando na parede, coloca na frente da câmera
      cartaz.position.copy(camera.position);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      cartaz.position.add(dir.multiplyScalar(2));
      scene.add(cartaz);
    }

    fileInput.value = ''; 
    if (modoPrimeiraPessoa) renderer.domElement.requestPointerLock(); 
  };
  reader.readAsDataURL(file);
});

// ============================================================
// LOOP DE ANIMAÇÃO E FÍSICA
// ============================================================
const clock = new THREE.Clock();
const raycasterChao = new THREE.Raycaster();
const raycasterParede = new THREE.Raycaster();

function animar() {
  requestAnimationFrame(animar);
  const t = clock.getElapsedTime();

  water.material.uniforms['time'].value += 0.5 / 60.0;

  // Partículas de tinta
  for (let i = particulasTinta.length - 1; i >= 0; i--) {
    const p = particulasTinta[i];
    p.mesh.position.add(p.vel);
    p.vida -= 0.05;
    p.mesh.material.opacity = p.vida / 0.5;
    p.mesh.material.transparent = true;
    if (p.vida <= 0) {
      scene.remove(p.mesh);
      particulasTinta.splice(i, 1);
    }
  }

  if (barco) {
    barco.position.y = Math.sin(t * 1.5) * 0.15;
    barco.rotation.z = Math.sin(t * 1.0) * 0.05;
    barco.rotation.x = Math.cos(t * 0.8) * 0.03;
    
    if (modoPrimeiraPessoa) {
      const speed = 0.12;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      
      let moveDir = new THREE.Vector3();
      if (keys.w) moveDir.add(forward);
      if (keys.s) moveDir.sub(forward);
      if (keys.d) moveDir.add(right);
      if (keys.a) moveDir.sub(right);
      
      if (moveDir.length() > 0) {
        moveDir.normalize();
        const raioParedeOrigem = camera.position.clone();
        raioParedeOrigem.y += 0.5;
        raycasterParede.set(raioParedeOrigem, moveDir);
        raycasterParede.far = 0.8;
        const hitsParede = raycasterParede.intersectObjects(collidersBarco, false);
        
        if (hitsParede.length === 0) {
          camera.position.add(moveDir.multiplyScalar(speed));
        }
      }

      // Física de altura/queda/pulo
      const origin = camera.position.clone();
      origin.y += 0.5; 
      raycasterChao.set(origin, new THREE.Vector3(0, -1, 0));
      raycasterChao.far = 5;
      const hits = raycasterChao.intersectObjects(collidersBarco, false);
      
      if (hits.length > 0) {
        const alturaChao = hits[0].point.y;
        alturaCamera = alturaChao + 1.6; 
        // Se estiver no chão, aplica o pulo
        if (noChao && keys.space) {
           // feito no keydown
        }
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, alturaCamera, 0.3);
        noChao = true;
        velocidadeY = 0; 
      } else {
        // Gravidade
        velocidadeY -= 0.01;
        camera.position.y += velocidadeY;
        noChao = false;
        
        if (camera.position.y < -1) {
          camera.position.set(barco.position.x, barco.position.y + 2, barco.position.z + 2);
          velocidadeY = 0;
        }
      }

      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      
      // Efeito de balanço do spray
      if (modoSpray && maoSpray) {
        maoSpray.position.y = Math.sin(t * 10) * 0.01;
        if (estaPintando) atirarTinta();
      }
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
  criarMaoSpray(); // Inicializa o spray
  document.getElementById('loading').classList.add('hide');
  animar();

  camera.position.set(35, 30, 45);
  setTimeout(() => { voarPara(new THREE.Vector3(0, 1.0, 0), 2500, new THREE.Vector3(0, 25, 35)); }, 200);
})();

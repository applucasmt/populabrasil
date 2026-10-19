import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Correção: PeerJS carregado via CDN no HTML, acessível pelo window
const Peer = window.Peer; 

// ============================================================
// CONFIGURAÇÕES BASE E MAPA
// ============================================================
const LAT_MIN = -34, LAT_MAX = 6, LON_MIN = -74, LON_MAX = -34;
const SCALE_X = 30 / (LON_MAX - LON_MIN), SCALE_Z = 30 / (LAT_MAX - LAT_MIN);
const COR_VERDE = 0x2e7d32;

function latLonParaCena(lat, lon) {
  const x = (lon - LON_MIN) * SCALE_X - 15;
  const z = -(lat - LAT_MIN) * SCALE_Z + 15;
  return new THREE.Vector3(x, 1.0, z);
}

const REGIOES = {
  'Norte': { lat: -4.0,  lon: -62.0 }, 'Nordeste': { lat: -8.0,  lon: -40.0 },
  'Centro-Oeste': { lat: -14.0, lon: -52.0 }, 'Sudeste': { lat: -20.0, lon: -45.0 },
  'Sul': { lat: -27.0, lon: -51.0 }
};

// ============================================================
// CENA E RENDERER
// ============================================================
const app = document.getElementById('app');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 30, 45);

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2.05;

// Céu e Luzes
const sky = new Sky(); sky.scale.setScalar(45000); scene.add(sky);
sky.material.uniforms['turbidity'].value = 10;
sky.material.uniforms['rayleigh'].value = 2;
const sunPos = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 15), THREE.MathUtils.degToRad(180));
sky.material.uniforms['sunPosition'].value.copy(sunPos);
const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
sunLight.position.copy(sunPos).multiplyScalar(100);
sunLight.castShadow = true; scene.add(sunLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

// Água
const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
  textureWidth: 512, textureHeight: 512,
  waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; }),
  sunDirection: new THREE.Vector3(), sunColor: 0xffffff, waterColor: 0x001e3a, distortionScale: 3.7
});
water.rotation.x = -Math.PI / 2; water.position.y = -0.3; scene.add(water);

// ============================================================
// MAPA CORRIGIDO (Fronteiras sem cortar)
// ============================================================
const estadosClique = [];
async function carregarEstados() {
  const resp = await fetch('data/estados.geojson');
  const geojson = await resp.json();

  for (const feature of geojson.features) {
    const geo = feature.geometry;
    const polygons = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];

    for (const polygon of polygons) {
      const outer = polygon[0];
      const shape = new THREE.Shape();
      
      outer.forEach(([lon, lat], i) => {
        const p = latLonParaCena(lat, lon);
        if (i === 0) shape.moveTo(p.x, -p.z);
        else shape.lineTo(p.x, -p.z);
      });

      const geoBase = new THREE.ShapeGeometry(shape);
      geoBase.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geoBase, new THREE.MeshStandardMaterial({ color: COR_VERDE, roughness: 0.6 }));
      mesh.position.y = 1.0;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { uf: feature.properties.sigla || 'BR', isEstado: true };
      scene.add(mesh);
      estadosClique.push(mesh);

      const pontosContorno = outer.map(([lon, lat]) => {
        const p = latLonParaCena(lat, lon);
        return new THREE.Vector3(p.x, 1.02, -p.z);
      });
      
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pontosContorno);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true }));
      scene.add(line);
    }
  }
}

// ============================================================
// NAVIO E AVATAR (ROBLOX STYLE)
// ============================================================
let barco, meuAvatar;
const shipHitbox = new THREE.Mesh(new THREE.BoxGeometry(15, 10, 15), new THREE.MeshBasicMaterial({ visible: false }));

async function criarBarco() {
  return new Promise((resolve) => {
    new GLTFLoader().load('assets/barco.glb', (gltf) => {
      barco = gltf.scene;
      barco.scale.set(1.2, 1.2, 1.2); 
      barco.position.set(22, -0.5, 8);
      barco.rotation.y = -0.6;
      barco.traverse(c => { if(c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      
      barco.traverse(c => {
        if (c.isMesh && c.material) {
          const canvas = document.createElement('canvas');
          canvas.width = 512; canvas.height = 512;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#5c3a21'; ctx.fillRect(0, 0, 512, 512);
          c.material.map = new THREE.CanvasTexture(canvas);
          c.material.needsUpdate = true;
        }
      });

      barco.add(shipHitbox);
      resolve(barco);
    }, undefined, () => {
      barco = new THREE.Group();
      const casco = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2), new THREE.MeshStandardMaterial({color: 0x5c3a21}));
      barco.add(casco); barco.position.set(22, 0, 8); barco.add(shipHitbox);
      resolve(barco);
    });
  });
}

function criarAvatar(corCamisa = '#3b82f6', corPele = '#ffcc99') {
  if (meuAvatar) scene.remove(meuAvatar);
  
  meuAvatar = new THREE.Group();
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshStandardMaterial({color: corCamisa}));
  corpo.position.y = 0.5; corpo.castShadow = true; meuAvatar.add(corpo);
  
  const cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({color: corPele}));
  cabeca.position.y = 1.2; cabeca.castShadow = true; meuAvatar.add(cabeca);

  const div = document.createElement('div'); div.textContent = 'Você'; div.style.color = '#fff'; div.style.fontWeight = 'bold'; div.style.textShadow = '1px 1px 2px #000';
  const label = new CSS2DObject(div); label.position.set(0, 1.7, 0); meuAvatar.add(label);

  meuAvatar.position.set(22, 1.5, 8);
  scene.add(meuAvatar);
}

// ============================================================
// PEERJS: CHAT GLOBAL (SALA ÚNICA)
// ============================================================
const ROOM_ID = 'brasil3d-sala-global-v2';
let peer;
const connections = [];

if (Peer) {
  peer = new Peer(ROOM_ID); 
  
  peer.on('open', (id) => console.log('Conectado à sala:', id));
  peer.on('connection', (conn) => {
    connections.push(conn);
    conn.on('data', (data) => {
      if (data.type === 'chat') addChatMessage(data.user, data.text);
    });
  });
} else {
  console.error("PeerJS não carregou corretamente.");
}

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

document.getElementById('chat-send').addEventListener('click', () => {
  const text = chatInput.value.trim();
  const user = prompt("Seu nome no chat:", "Visitante") || "Visitante";
  if (text) {
    addChatMessage(user, text);
    connections.forEach(conn => {
      if (conn.open) conn.send({ type: 'chat', user, text });
    });
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

// ============================================================
// INTERAÇÃO: NAVIO E CUSTOMIZAÇÃO
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltipEl = document.createElement('div'); tooltipEl.className = 'tooltip'; tooltipEl.style.display = 'none'; document.body.appendChild(tooltipEl);

function getIntersects(e, objects) {
  mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObjects(objects, true);
}

addEventListener('mousemove', e => {
  const hits = getIntersects(e, [shipHitbox]);
  if (hits.length > 0) {
    tooltipEl.innerHTML = `<strong>Navio Interativo</strong> · Clique para entrar`;
    tooltipEl.style.left = e.clientX + 'px'; tooltipEl.style.top = e.clientY + 'px'; tooltipEl.style.display = 'block';
    document.body.style.cursor = 'pointer';
  } else {
    tooltipEl.style.display = 'none'; document.body.style.cursor = 'default';
  }
});

addEventListener('click', e => {
  const hits = getIntersects(e, [shipHitbox]);
  if (hits.length > 0) {
    document.getElementById('ship-ui').classList.add('active');
    document.getElementById('customize-panel').classList.add('active');
    voarPara(barco.position.clone(), 1500, new THREE.Vector3(0, 6, 12));
  }
});

document.getElementById('save-custom').addEventListener('click', () => {
  const corCamisa = document.getElementById('color-shirt').value;
  const corPele = document.getElementById('color-skin').value;
  criarAvatar(corCamisa, corPele);
  document.getElementById('customize-panel').classList.remove('active');
});

document.getElementById('btn-pixar').addEventListener('click', () => {
  const novaCor = prompt("Digite a cor HEX para pintar o navio (ex: #ff0000):", "#ff0000");
  if (novaCor) {
    barco.traverse(c => {
      if (c.isMesh && c.material && c.material.map) {
        const canvas = c.material.map.image;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = novaCor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        c.material.map.needsUpdate = true;
      }
    });
  }
});

document.getElementById('btn-cartaz').addEventListener('click', () => {
  const url = prompt("Cole a URL da imagem do cartaz:");
  if (url) {
    new THREE.TextureLoader().load(url, (tex) => {
      const cartaz = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), new THREE.MeshBasicMaterial({ map: tex }));
      cartaz.position.set(22, 2.5, 8.5);
      scene.add(cartaz);
    });
  }
});

// ============================================================
// CÂMERA E LOOP
// ============================================================
let camAnim = null;
function voarPara(alvo, duracao = 2000, offset = new THREE.Vector3(0, 9, 11)) {
  const startPos = camera.position.clone(); const startTarget = controls.target.clone();
  const destino = alvo.clone().add(offset); const inicio = performance.now();
  camAnim = () => {
    const t = Math.min((performance.now() - inicio) / duracao, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(startPos, destino, ease); controls.target.lerpVectors(startTarget, alvo, ease); controls.update();
    if (t >= 1) camAnim = null;
  };
}

const clock = new THREE.Clock();
function animar() {
  requestAnimationFrame(animar);
  const t = clock.getElapsedTime();
  water.material.uniforms['time'].value += 0.5 / 60.0;

  if (barco) {
    barco.position.y = -0.5 + Math.sin(t * 1.0) * 0.15;
    barco.rotation.z = Math.sin(t * 0.8) * 0.03;
    shipHitbox.position.copy(barco.position);
  }
  if (meuAvatar) meuAvatar.position.y = 1.5 + Math.sin(t * 2) * 0.05;

  if (camAnim) camAnim();
  controls.update(); renderer.render(scene, camera); labelRenderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
});

(async () => {
  await carregarEstados();
  barco = await criarBarco(); scene.add(barco);
  criarAvatar();
  document.getElementById('loading').classList.add('hide');
  animar();
  camera.position.set(35, 30, 45);
  setTimeout(() => voarPara(new THREE.Vector3(0, 1.0, 0), 2500, new THREE.Vector3(0, 25, 35)), 200);
})();

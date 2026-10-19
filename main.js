import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ============================================================
// CONFIGURAÇÕES BASE
// ============================================================
const LAT_MIN = -34, LAT_MAX = 6;
const LON_MIN = -74, LON_MAX = -34;
const SCALE_X = 30 / (LON_MAX - LON_MIN);
const SCALE_Z = 30 / (LAT_MAX - LAT_MIN);

function latLonParaCena(lat, lon) {
  const x = (lon - LON_MIN) * SCALE_X - 15;
  const z = -(lat - LAT_MIN) * SCALE_Z + 15;
  return new THREE.Vector3(x, 1.0, z);
}

// ============================================================
// CENA, CÂMERA, RENDERER E WEBRTC (PEERJS)
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

// Renderer CSS2D para Nomes flutuantes
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

const sunPos = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 15), THREE.MathUtils.degToRad(180));
skyUniforms['sunPosition'].value.copy(sunPos);

const sunLight = new THREE.DirectionalLight(0xffffff, 3.0); // Luz mais forte para o navio
sunLight.position.copy(sunPos).multiplyScalar(100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -40;
sunLight.shadow.camera.right = 40;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -40;
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

// ============================================================
// OCEANO
// ============================================================
const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
const waterNormals = new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', (tex) => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
});
const water = new Water(waterGeometry, {
  textureWidth: 512, textureHeight: 512, waterNormals: waterNormals,
  sunDirection: new THREE.Vector3(), sunColor: 0xffffff, waterColor: 0x001e3a,
  distortionScale: 3.7, fog: scene.fog !== undefined
});
water.rotation.x = -Math.PI / 2;
water.position.y = -0.3;
scene.add(water);

// ============================================================
// MAPA CORRIGIDO (Sem linhas cortando)
// ============================================================
const grupoMapa = new THREE.Group();
const grupoBordas = new THREE.Group();
const estadosClique = []; 
scene.add(grupoMapa);
scene.add(grupoBordas);

async function carregarEstados() {
  const resp = await fetch('data/estados.geojson');
  const geojson = await resp.json();
  const corUnica = 0x1f8a4c; // COR ÚNICA DO BRASIL

  for (const feature of geojson.features) {
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

      // CORREÇÃO: Desenha o estado sem estourar as bordas
      const geoBase = new THREE.ShapeGeometry(shape);
      geoBase.rotateX(-Math.PI / 2);
      const meshBase = new THREE.Mesh(geoBase, new THREE.MeshStandardMaterial({
        color: new THREE.Color(corUnica).multiplyScalar(0.7), roughness: 0.8
      }));
      meshBase.position.y = 0.85;
      meshBase.receiveShadow = true;
      meshBase.userData = { uf: feature.properties.sigla || 'BR', isEstado: true };
      grupoMapa.add(meshBase);

      // Camada de cima (Verde unificado)
      const geoTela = new THREE.ShapeGeometry(shape);
      geoTela.rotateX(-Math.PI / 2);
      const meshTela = new THREE.Mesh(geoTela, new THREE.MeshStandardMaterial({
        color: corUnica, roughness: 0.5, metalness: 0.1
      }));
      meshTela.position.y = 1.0;
      meshTela.castShadow = true;
      meshTela.receiveShadow = true;
      meshTela.userData = { uf: feature.properties.sigla || 'BR', isEstado: true };
      
      grupoMapa.add(meshTela);
      estadosClique.push(meshTela);

      // CORREÇÃO DAS LINHAS: Pega o contorno do Shape (outer) para evitar linhas cruzadas
      const pontosContorno = outer.map(([lon, lat]) => {
        const p = latLonParaCena(lat, lon);
        return new THREE.Vector3(p.x, 1.02, -p.z);
      });
      
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pontosContorno);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ 
        color: 0xffffff, transparent: true, opacity: 0.5 
      }));
      grupoBordas.add(line);
    }
  }
}

// ============================================================
// CASAS
// ============================================================
const casas = [];
function criarCasa(fotoURL, usuario, nome) {
  const grupo = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 1.3), new THREE.MeshStandardMaterial({ color: 0xf5f5dc }));
  base.position.y = 0.5; base.castShadow = true; base.receiveShadow = true;
  grupo.add(base);

  const telhado = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0xd97706 }));
  telhado.position.y = 1.45; telhado.rotation.y = Math.PI / 4; telhado.castShadow = true;
  grupo.add(telhado);

  if (fotoURL) {
    const placaMat = new THREE.MeshBasicMaterial({ transparent: true });
    placaMat.map = new THREE.TextureLoader().load(fotoURL);
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), placaMat);
    placa.position.set(0, 1.05, 0.66);
    grupo.add(placa);
  }

  grupo.userData = { usuario, nome, fotoURL };
  return grupo;
}

// ============================================================
// NAVIO REALISTA E INTERATIVO
// ============================================================
let barco;
const shipHitbox = new THREE.Mesh(new THREE.BoxGeometry(15, 10, 15), new THREE.MeshBasicMaterial({ visible: false }));

async function criarBarco() {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load('assets/barco.glb', (gltf) => {
      barco = gltf.scene;
      barco.scale.set(0.8, 0.8, 0.8); 
      barco.position.set(20, -0.5, 10); // Ajustado para não flutuar muito
      barco.rotation.y = -0.5;
      
      // AJUSTE DE TEXTURA: Se o navio estiver preto, isso garante que a luz bata nele
      barco.traverse(c => { 
        if(c.isMesh) { 
          c.castShadow = true; 
          c.receiveShadow = true; 
          if(c.material) c.material.envMapIntensity = 1.5;
        } 
      });

      barco.add(shipHitbox); // Adiciona área de clique
      resolve(barco);
    }, undefined, () => {
      // Fallback super simples
      barco = new THREE.Group();
      const casco = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2), new THREE.MeshStandardMaterial({color: 0x5c3a21}));
      barco.add(casco);
      barco.position.set(20, 0, 10);
      barco.add(shipHitbox);
      resolve(barco);
    });
  });
}

// ============================================================
// SISTEMA DE CHAT E VOZ (PEERJS)
// ============================================================
// Inicializa PeerJS (Servidor público gratuito)
const peer = new Peer(); 
let connections = [];
let localStream = null;

peer.on('open', (id) => {
  console.log('Meu ID de conexão:', id);
});

// Recebe conexão de outro jogador
peer.on('connection', (conn) => {
  connections.push(conn);
  setupConnection(conn);
});

// Conecta a um jogador existente
function conectarAoJogador(peerId) {
  const conn = peer.connect(peerId);
  connections.push(conn);
  setupConnection(conn);
}

function setupConnection(conn) {
  conn.on('data', (data) => {
    if (data.type === 'chat') {
      addChatMessage(data.user, data.text);
    }
  });
}

// UI do Chat
const shipUI = document.getElementById('ship-ui');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

// UI de Customização
const customPanel = document.getElementById('customize-panel');
const colorPicker = document.getElementById('color-picker');
const saveCustom = document.getElementById('save-custom');

// Função para abrir o navio
function abrirNavio() {
  shipUI.classList.add('active');
  customPanel.classList.add('active');
  // Desativa controles de câmera para não bugar o mouse no chat
  controls.enabled = false;
}

// Fechar Customização
saveCustom.addEventListener('click', () => {
  customPanel.classList.remove('active');
  // Aqui você aplicaria a cor no seu avatar 3D
  const cor = colorPicker.value;
  if(avatar) avatar.material.color.set(cor);
});

// Enviar mensagem no chat
chatSend.addEventListener('click', () => {
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
// AVATAR (ROBLOX STYLE)
// ============================================================
let avatar;
function criarAvatar() {
  avatar = new THREE.Group();
  // Corpo
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshStandardMaterial({color: 0x3b82f6}));
  corpo.position.y = 0.5;
  avatar.add(corpo);
  // Cabeça
  const cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({color: 0xffcc99}));
  cabeca.position.y = 1.2;
  avatar.add(cabeca);
  
  // Nome flutuante
  const div = document.createElement('div');
  div.textContent = 'Você';
  div.style.color = '#fff';
  div.style.fontWeight = 'bold';
  div.style.textShadow = '1px 1px 2px #000';
  const label = new CSS2DObject(div);
  label.position.set(0, 1.7, 0);
  avatar.add(label);

  avatar.position.set(20, 1.5, 10); // Em cima do navio
  scene.add(avatar);
}

// ============================================================
// INTERAÇÃO E CLIQUE
// ============================================================
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

addEventListener('mousemove', e => {
  const hitsBarco = getIntersects(e, [shipHitbox]);
  if (hitsBarco.length > 0) {
    tooltipEl.innerHTML = `<strong>Navio Pirata</strong> · Clique para interagir`;
    tooltipEl.style.left = e.clientX + 'px';
    tooltipEl.style.top = e.clientY + 'px';
    tooltipEl.style.display = 'block';
    document.body.style.cursor = 'pointer';
    return;
  }

  const hitsCasas = getIntersects(e, casas);
  if (hitsCasas.length > 0) {
    tooltipEl.style.display = 'block';
    document.body.style.cursor = 'pointer';
  } else {
    tooltipEl.style.display = 'none';
    document.body.style.cursor = 'default';
  }
});

addEventListener('click', e => {
  // Clicou no Navio
  const hitsBarco = getIntersects(e, [shipHitbox]);
  if (hitsBarco.length > 0) {
    abrirNavio();
    // Voa câmera para o navio
    voarPara(barco.position.clone(), 1500, new THREE.Vector3(0, 8, 15));
    return;
  }
  
  // Fechar painéis se clicar fora
  if (shipUI.classList.contains('active')) {
    // Se o clique não foi no painel, fecha (opcional)
  }
});

// ============================================================
// CÂMERA E MOVIMENTO
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
// LOOP
// ============================================================
const clock = new THREE.Clock();
function animar() {
  requestAnimationFrame(animar);
  const t = clock.getElapsedTime();

  water.material.uniforms['time'].value += 0.5 / 60.0;

  if (barco) {
    barco.position.y = -0.5 + Math.sin(t * 1.0) * 0.15;
    barco.rotation.z = Math.sin(t * 0.8) * 0.03;
    barco.rotation.x = Math.cos(t * 0.5) * 0.02;
    
    // Atualiza a hitbox invisível junto com o barco
    shipHitbox.position.copy(barco.position);
  }

  if (avatar) {
    // Faz o avatar "respirar" levemente
    avatar.position.y = 1.5 + Math.sin(t * 2) * 0.05; 
  }

  if (camAnim) camAnim();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

(async () => {
  await carregarEstados();
  barco = await criarBarco();
  scene.add(barco);
  criarAvatar();
  
  // Carrega moradores
  try {
    const resp = await fetch('data/moradores.json?t=' + Date.now());
    const data = await resp.json();
    for (const m of data.moradores || []) {
      if (m.comentou && m.lat && m.lon) {
         const casa = criarCasa(m.foto, m.usuario, m.nome);
         casa.position.copy(latLonParaCena(m.lat, m.lon));
         casa.position.y = 1.5;
         scene.add(casa);
         casas.push(casa);
      }
    }
  } catch(e) {}

  document.getElementById('loading').classList.add('hide');
  animar();

  camera.position.set(35, 30, 45);
  setTimeout(() => { voarPara(new THREE.Vector3(0, 1.0, 0), 2500, new THREE.Vector3(0, 25, 35)); }, 200);
})();

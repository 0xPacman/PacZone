import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCityWorld } from './city-world.js';
import { createCityLife } from './city-life.js';

const $ = id => document.getElementById(id);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  $('fallback').hidden = false;
  throw error;
}
const scene = new THREE.Scene();
scene.background = new THREE.Color('#10172c');
scene.fog = new THREE.FogExp2('#10172c', .0105);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('scene').appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Explore PacZone. Drag or use WASD and arrow keys to travel. Scroll to zoom.');

const camera = new THREE.OrthographicCamera(-40,40,30,-30,.2,500);
const homeOffset = new THREE.Vector3(55,57,66);
camera.position.copy(homeOffset);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = .11;
controls.screenSpacePanning = false; // pan on the city ground, never into the sky
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.touches.ONE = THREE.TOUCH.PAN;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
controls.minZoom = .6;
controls.maxZoom = 3.4;
controls.minPolarAngle = .2;
controls.maxPolarAngle = Math.PI * .43;
controls.zoomSpeed = .7;
controls.panSpeed = 1;
controls.update();
scene.add(new THREE.HemisphereLight(0x9caeff, 0x343150, 2.4));
const moon = new THREE.DirectionalLight(0xb9d5ff, 2.6);
moon.position.set(-30,60,35);
moon.castShadow = true;
moon.shadow.mapSize.set(2048,2048);
Object.assign(moon.shadow.camera, {left:-70,right:70,top:70,bottom:-70,near:1,far:180});
moon.shadow.bias = -.0005;
moon.shadow.normalBias = .05;
scene.add(moon, moon.target);
const rim = new THREE.DirectionalLight(0xeb64cc, 1.5);
rim.position.set(25,25,-50);
scene.add(rim);
const fill = new THREE.DirectionalLight(0x59cdd9, .6);
fill.position.set(40,10,45);
scene.add(fill);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), .38, .55, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let seed = 2418, density = .72, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
const world = createCityWorld(scene, {seed, density});
const life = createCityLife(scene, {seed});
let droneCount = 8;
life.setDroneCount(droneCount);

// A continuous ground plane removes the old diorama's hard edges.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000,1000), new THREE.MeshStandardMaterial({color:0x101822,roughness:.4,metalness:.45}));
ground.rotation.x = -Math.PI/2;
ground.position.y = -.07;
ground.receiveShadow = true;
scene.add(ground);

// Very subtle drifting particles keep the air alive without hiding the city.
const positions = new Float32Array(250*3);
for(let i=0;i<250;i++){positions[i*3]=(Math.random()-.5)*160;positions[i*3+1]=Math.random()*45;positions[i*3+2]=(Math.random()-.5)*160}
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
const motes = new THREE.Points(particleGeometry, new THREE.PointsMaterial({color:0x92d4ea,size:.055,transparent:true,opacity:.28,depthWrite:false}));
scene.add(motes);
const held = new Set(), up = new THREE.Vector3(0,1,0), right = new THREE.Vector3(), forward = new THREE.Vector3(), movement = new THREE.Vector3();
let last = performance.now(), simulationTime = 0, lastUI = 0, frames = 0, fps = 0, fpsStart = last;
let travel = 0, previousX = 0, previousZ = 0;
function resize(){
  const halfHeight = innerWidth < 700 ? 34 : 30;
  const aspect = innerWidth/innerHeight;
  Object.assign(camera,{left:-halfHeight*aspect,right:halfHeight*aspect,top:halfHeight,bottom:-halfHeight});
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  composer.setSize(innerWidth,innerHeight);
}
addEventListener('resize',resize); resize();
const coordinate = value => `${value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toString().padStart(4,'0')}`;
function updateUI(now){
  const x=controls.target.x,z=controls.target.z;
  $('coords').textContent=`X ${coordinate(x)}  /  Z ${coordinate(z)}`;
  $('zoom').textContent=Math.round(camera.zoom*100)+'%';
  $('travel').textContent = `${Math.round(travel)} m explored`;
  $('district').textContent=`SECTOR ${Math.floor(x/72)} · ${Math.floor(z/72)}`;
  $('performance').textContent=`${fps} FPS · INFINITE CITY`;
  $('population').textContent=`Pac-Mans & ghosts · ${droneCount} drones`;
  const stats=world.getStats();
  $('scene').dataset.chunks = String(stats.chunks ?? stats.chunkCount ?? '');
  $('scene').dataset.x = x.toFixed(2);
  $('scene').dataset.z = z.toFixed(2);
  $('scene').dataset.drawCalls = String(renderer.info.render.calls);
  $('scene').dataset.geometries = String(renderer.info.memory.geometries);
  lastUI = now;
}
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min((now-last)/1000,.05); last=now;
  if(document.hidden) return;
  if(!paused)simulationTime+=dt;
  let vx=0,vz=0;
  if(held.has('a')||held.has('arrowleft'))vx--;
  if(held.has('d')||held.has('arrowright'))vx++;
  if(held.has('w')||held.has('arrowup'))vz++;
  if(held.has('s')||held.has('arrowdown'))vz--;
  if(vx||vz){
    camera.getWorldDirection(forward);forward.y=0;forward.normalize();
    right.crossVectors(forward,up).normalize();
    movement.copy(right).multiplyScalar(vx).addScaledVector(forward,vz).normalize().multiplyScalar(dt*(held.has('shift')?30:14)/Math.sqrt(camera.zoom));
    camera.position.add(movement);controls.target.add(movement);
  }
  controls.update();
  const x=controls.target.x,z=controls.target.z;
  travel+=Math.hypot(x-previousX,z-previousZ);previousX=x;previousZ=z;
  world.update(x,z);
  life.update(simulationTime,paused?0:dt,x,z);
  ground.position.x=x;ground.position.z=z;
  motes.position.set(x,Math.sin(simulationTime*.1)*2,z);
  moon.position.set(x-30,60,z+35);moon.target.position.set(x,0,z);
  renderer.info.reset();
  composer.render();
  frames++;if(now-fpsStart>1000){fps=Math.round(frames*1000/(now-fpsStart));frames=0;fpsStart=now}
  if(now-lastUI>150)updateUI(now);
}
world.update(0,0);
requestAnimationFrame(animate);
$('loading').hidden=true;
function setMode(mode){
  const exploring=mode==='explore';
  controls.mouseButtons.LEFT=exploring?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
  controls.touches.ONE=exploring?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
  $('pan').classList.toggle('active',exploring);$('orbit').classList.toggle('active',!exploring);
  $('pan').setAttribute('aria-pressed',String(exploring));$('orbit').setAttribute('aria-pressed',String(!exploring));
  $('scene').classList.toggle('orbiting',!exploring);
  $('hint').textContent=exploring?'DRAG TO TRAVEL · WASD / ARROWS · SCROLL TO ZOOM':'DRAG TO ORBIT · WASD / ARROWS TO TRAVEL';
}
$('pan').onclick=()=>setMode('explore');$('orbit').onclick=()=>setMode('orbit');setMode('explore');
function zoom(f){camera.zoom=THREE.MathUtils.clamp(camera.zoom*f,controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix()}
$('in').onclick=()=>zoom(1.2);$('out').onclick=()=>zoom(1/1.2);
function home(){
  held.clear();controls.reset();camera.position.copy(homeOffset);controls.target.set(0,0,0);camera.zoom=1;camera.updateProjectionMatrix();controls.update();previousX=previousZ=0;setMode('explore');
}
$('reset').onclick=home;
$('new').onclick=()=>{seed=Math.floor(Math.random()*99999);home();world.regenerate(seed,density);life.regenerate(seed);life.setDroneCount(droneCount);travel=0;$('seed').textContent=String(seed).padStart(5,'0')};
function pauseUI(){$('pause').innerHTML=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'Resume city life':'Pause city life');$('pause').setAttribute('aria-pressed',String(paused));$('statusLabel').textContent=paused?'City life paused':'City systems online'}
$('pause').onclick=()=>{paused=!paused;pauseUI()};pauseUI();
for(const [button,panel]of [['settings','panel'],['help','helpPanel']]){$(button).onclick=()=>{$(panel).hidden=!$(panel).hidden;$(button).setAttribute('aria-expanded',String(!$(panel).hidden))}}
$('close').onclick=()=>{$('helpPanel').hidden=true;$('help').setAttribute('aria-expanded','false')};
$('density').oninput=e=>{$('densityValue').textContent=e.target.value+'%'};
$('density').onchange=e=>{density=+e.target.value/100;world.regenerate(seed,density)};
$('neon').oninput=e=>{const value=+e.target.value/80;world.setNeon(value);bloom.strength=.38*value;$('neonValue').textContent=e.target.value+'%'};
$('drones').oninput=e=>{droneCount=+e.target.value;$('droneValue').textContent=droneCount;life.setDroneCount(droneCount)};
addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;const key=e.key.toLowerCase();if(['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d','shift'].includes(key)){e.preventDefault();held.add(key)}if(key==='+'||key==='=')zoom(1.15);if(key==='-')zoom(1/1.15);if(key==='escape'){$('panel').hidden=true;$('helpPanel').hidden=true}});
addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));addEventListener('blur',()=>held.clear());
for(const el of document.querySelectorAll('[data-move]')){el.onpointerdown=e=>{e.preventDefault();el.setPointerCapture(e.pointerId);held.add(el.dataset.move)};el.onpointerup=()=>held.delete(el.dataset.move);el.onpointercancel=()=>held.delete(el.dataset.move)}
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('fallback').hidden=false;$('fallback').textContent='The graphics connection was interrupted. Reload to return to the city.'});

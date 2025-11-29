import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

import { generateSinusPath, createPathFromPoints, updateLineMesh, computeRight } from './pathUtils.js';
import { createCloudsForPath, removeClouds } from './cloudManager.js';
import { createSky, updateSky } from './sky.js';
import { add3DText } from './text3d.js';

import configDefault from './config.js';

// ---- Сцена ----
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0025);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---- Камера ----
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 10);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;

// свет
const ambient = new THREE.AmbientLight(0xffffff, 0.6); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(5, 10, 7); scene.add(sun);

// sky: создаём со стандартным радиусом из конфига (НЕ будем масштабировать)
let currentConfig = configDefault;
const skyRadius = Math.max(currentConfig.sky?.radius ?? 600, currentConfig.sky?.minRadius ?? 600);
const { mesh: skyMesh, uniforms: skyUniforms } = createSky(skyRadius);
skyMesh.frustumCulled = false;
scene.add(skyMesh);
// цвета в шейдере как запасной clearColor
if (skyUniforms && skyUniforms.bottomColor && skyUniforms.bottomColor.value) {
  renderer.setClearColor(skyUniforms.bottomColor.value);
}

// line placeholder / объекты
let line = null;
let currentPath = null;
let currentCloudInst = null;

// debug helpers: визуальные маркеры для отладки позиции на пути и позиции камеры
const debugPathMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
debugPathMarker.visible = true;
scene.add(debugPathMarker);
const debugCamMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.18, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0x00ff00 })
);
debugCamMarker.visible = true;
scene.add(debugCamMarker);
const debugLineMat = new THREE.LineBasicMaterial({ color: 0xffff00 });
let debugLine = null;

// troika text
const titleFixed = add3DText(scene, { text: 'flying‑carpet', position: new THREE.Vector3(0, 6, -10), fontSize: 1.6 });
const titleOnPath = add3DText(scene, { text: 'you reached the cloud', position: new THREE.Vector3(0, 4, -30), fontSize: 1.2 });
titleOnPath.visible = false;

// target/current progress
let targetT = 0;
let currentT = 0;

// mouse
let mouseX = 0, mouseY = 0;
window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

// wheel/touch (мягкий)
function wheelAdjust(deltaY) {
  const sensitivity = currentConfig.visual?.wheelSensitivity ?? 0.0009;
  const step = deltaY * sensitivity;
  targetT = THREE.MathUtils.clamp(targetT + step, 0, 1);
}
window.addEventListener('wheel', (e) => wheelAdjust(e.deltaY), { passive: true });

let lastTouchY = null;
window.addEventListener('touchstart', (e) => { if (e.touches && e.touches[0]) lastTouchY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!lastTouchY) { if (e.touches && e.touches[0]) lastTouchY = e.touches[0].clientY; return; }
  const currentY = e.touches[0].clientY;
  const delta = lastTouchY - currentY;
  const step = delta * (currentConfig.visual?.touchSensitivity ?? 0.0012);
  targetT = THREE.MathUtils.clamp(targetT + step, 0, 1);
  lastTouchY = currentY;
}, { passive: true });
window.addEventListener('touchend', () => { lastTouchY = null; }, { passive: true });

function onScroll() {
  const scrollTop = window.scrollY || window.pageYOffset;
  const scrollHeight = document.body.scrollHeight - window.innerHeight;
  if (scrollHeight > 0) targetT = THREE.MathUtils.clamp(scrollTop / scrollHeight, 0, 1);
}
window.addEventListener('scroll', onScroll, { passive: true });

// ---- build path / apply config ----
function buildPathFromConfig(cfg) {
  if (cfg.path && cfg.path.useGenerate) {
    const pts = generateSinusPath({
      length: cfg.path.length,
      segments: cfg.path.segments,
      lateralAmplitude: cfg.path.lateralAmplitude,
      verticalAmplitude: cfg.path.verticalAmplitude,
      seed: cfg.path.seed ?? 0
    });
    return createPathFromPoints(pts);
  } else if (cfg.path && Array.isArray(cfg.path.points) && cfg.path.points.length > 0) {
    const pts = cfg.path.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    return createPathFromPoints(pts);
  } else {
    const pts = generateSinusPath({ length: 140, segments: 7, lateralAmplitude: 12, verticalAmplitude: 6 });
    return createPathFromPoints(pts);
  }
}

async function applyConfig(cfg) {
  // удаляем старые облака/линию
  if (currentCloudInst) { removeClouds(scene, currentCloudInst); currentCloudInst = null; }
  if (line) { scene.remove(line); try { line.geometry.dispose(); } catch{}; try { line.material.dispose(); } catch{}; line = null; }

  currentPath = buildPathFromConfig(cfg);
  line = updateLineMesh(line, currentPath, cfg.visual?.lineSegments ?? 200);
  scene.add(line);

  // НЕ масштабируем skyMesh. Вместо этого адаптируем camera.far и ограничиваем radius логикой конфигурации
  try {
    const curveLength = currentPath.getLength ? currentPath.getLength() : (cfg.path?.length ?? 600);
    // нужная "дальность видимости" пропорциональна длине пути, но ограничим верхом
    const neededFar = Math.max(1000, Math.min(cfg.sky?.maxRadius ?? 2000, curveLength * 1.8));
    if (camera.far < neededFar) { camera.far = neededFar; camera.updateProjectionMatrix(); }

    // Если авто-позиционирование включено — оставим фиксированный радиус (cfg.sky.radius) и будем центровать сферу на камере
    // (никакого масштабирования!) — это предотвращает артефакты при больших значениях.
    const desiredRadius = Math.max(cfg.sky?.minRadius ?? 600, Math.min(cfg.sky?.radius ?? 600, cfg.sky?.maxRadius ?? 2000));
    // если надо, можно пересоздать геометрию вместо масштабирования — но обычно достаточно фиксированного radius
    // Обновляем clearColor для запасного фона
    if (skyUniforms && skyUniforms.bottomColor && skyUniforms.bottomColor.value) {
      renderer.setClearColor(skyUniforms.bottomColor.value);
    }
  } catch (e) {
    console.warn('applyConfig: sky adjustments failed', e);
  }

  // создаём облака
  try {
    currentCloudInst = await createCloudsForPath(scene, currentPath, {
      cloudCount: cfg.clouds?.cloudCount ?? 80,
      particlesPerCloud: cfg.clouds?.particlesPerCloud ?? 8,
      width: cfg.clouds?.width ?? 12,
      bias: cfg.clouds?.bias ?? 0,
      modelUrl: cfg.clouds?.modelUrl ?? '/assets/models/cloud.glb'
    });
  } catch (e) {
    console.warn('applyConfig: createCloudsForPath failed', e);
  }

  // clamp targets
  targetT = THREE.MathUtils.clamp(targetT, 0, 1);
  currentT = THREE.MathUtils.clamp(currentT, 0, 1);
}

// инициируем
applyConfig(currentConfig).catch(console.error);

// HMR
if (import.meta.hot) {
  import.meta.hot.accept('./config.js', ({ default: newConfig }) => {
    currentConfig = newConfig;
    applyConfig(newConfig).catch(console.error);
  });
}

// ---- render loop ----
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  currentT = THREE.MathUtils.lerp(currentT, targetT, Math.min(1, dt * 6));
  const pos = currentPath.getPointAt(currentT);
  const lookAheadT = THREE.MathUtils.clamp(currentT + 0.02, 0, 1);
  const lookPos = currentPath.getPointAt(lookAheadT);

  // position camera strictly relative to the path tangent so it follows turns
  const cameraFollowDistance = (currentConfig.visual?.cameraFollowDistance ?? 6);
  const cameraHeightOffset = (currentConfig.visual?.cameraHeightOffset ?? 1.6);

  // tangent points forward along the path; we place camera behind along -tangent
  const tangent = currentPath.getTangentAt(currentT).clone().normalize();
  const right = computeRight(tangent);
  const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

  // place camera exactly on the path (optionally with small vertical offset)
  camera.position.copy(pos).addScaledVector(up, cameraHeightOffset);

  // compute look target a bit ahead on the path
  const lookAheadT2 = THREE.MathUtils.clamp(currentT + (currentConfig.visual?.lookAheadT ?? 0.02), 0, 1);
  const lookAheadPos = currentPath.getPointAt(lookAheadT2);

  // allow small mouse-based look offset (does NOT change camera position)
  const lookOffsetX = mouseX * (currentConfig.visual?.mouseLookStrength ?? 0.6) * 0.2;
  const lookOffsetY = mouseY * (currentConfig.visual?.mouseLookStrength ?? 0.6) * 0.2;
  const offsetTarget = new THREE.Vector3()
    .addScaledVector(right, lookOffsetX)
    .addScaledVector(up, lookOffsetY);
  const lookTarget = new THREE.Vector3(lookAheadPos.x, lookAheadPos.y, lookAheadPos.z).add(offsetTarget);

  camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);

  // --- debug visuals: update markers and connecting line ---
  try {
    debugPathMarker.position.copy(pos);
    debugCamMarker.position.copy(camera.position);
    if (debugLine) {
      scene.remove(debugLine);
      debugLine.geometry.dispose();
      debugLine = null;
    }
    const pts = [pos.clone(), camera.position.clone()];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    debugLine = new THREE.Line(geom, debugLineMat);
    scene.add(debugLine);
  } catch (e) {
    // ignore debug errors
  }

  // центрируем небо на камеру, чтобы не было артефактов при больших дистанциях
  if (currentConfig.sky?.autoFollowCamera) {
    skyMesh.position.copy(camera.position);
  }

  // анимация облаков (как раньше)
  if (currentCloudInst && currentCloudInst.userData) {
    const { particlesPerCloud, cloudCount, centers, baseOffsets } = currentCloudInst.userData;
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let c = 0; c < cloudCount; c++) {
      const center = centers[c];
      const groupWobbleY = Math.sin(t * 0.6 + c) * 0.14;
      const groupWobbleX = Math.cos(t * 0.3 + c * 1.3) * 0.08;
      for (let p = 0; p < particlesPerCloud; p++) {
        const off = baseOffsets[c * particlesPerCloud + p] || new THREE.Vector3();
        const px = center.x + off.x + groupWobbleX;
        const py = center.y + off.y + groupWobbleY;
        const pz = center.z + off.z;
        dummy.position.set(px, py, pz);
        const s = 0.6 + 0.5 * Math.abs(Math.sin(t * 0.6 + c * 0.3 + p));
        dummy.scale.setScalar(s);
        dummy.rotation.set(0, Math.sin(t * 0.2 + idx * 0.13) * 0.4, 0);
        dummy.updateMatrix();
        currentCloudInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    currentCloudInst.instanceMatrix.needsUpdate = true;
  }

  // текст по пути
  titleOnPath.visible = (currentT > 0.18 && currentT < 0.28) || (currentT > 0.52 && currentT < 0.62);

  // обновляем sky shader
  updateSky(skyUniforms, t);

  // troika
  if (titleFixed && titleFixed.sync) titleFixed.sync();
  if (titleOnPath && titleOnPath.sync) titleOnPath.sync();

  renderer.render(scene, camera);
}
animate();

// ресайз
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
// простой sky shader — большая внутренняя сфера с градиентом
import * as THREE from 'three';

export function createSky(radius = 400) {
  const uniforms = {
    // верх — тёмно-синий, низ — очень светло-голубой
    // верх оставляем как есть
    // верх — возвращаем оригинальный голубой/тёмно-синий
    topColor: { value: new THREE.Color(0x00193a) },
    // низ — оранжевый
    bottomColor: { value: new THREE.Color(0xff8c00) },
    // смещение и экспонента управляют высотой перехода и его резкостью
    // смещение и экспонента управляют высотой перехода и его резкостью
    // используем радиус сферы, чтобы вычислять высоту по модельной позиции
    radius: { value: radius },
    offset: { value: -0.08 },
    exponent: { value: 0.85 },
    // debug: 0 = normal, 1 = show t as grayscale, 2 = show bottom/top map
    debugMode: { value: 1 },
    // время оставляем, но не используем (вдруг понадобится позже)
    time: { value: 0.0 }
  };

  const vs = /* glsl */`
    // передаём модельную позицию вершины (локальные координаты) в фрагментный шейдер
    varying vec3 vModelPos;
    void main() {
      vModelPos = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fs = /* glsl */`
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    uniform float time;
    varying vec3 vModelPos;
    uniform float radius;
    uniform float debugMode;
    void main() {
      // используем модельную Y-позицию вершины, нормализованную по радиусу
      float ny = vModelPos.y / radius; // in [-1..1]
      float h = (ny * 0.5 + 0.5) + offset; // remap to [0..1] and apply offset
      float t = pow(clamp(h, 0.0, 1.0), exponent);
      if (debugMode >= 1.0) {
        gl_FragColor = vec4(vec3(t), 1.0);
        return;
      }
      // статичный плавный градиент: низ (оранжевый) -> верх (тёмно-голубой)
      vec3 col = mix(bottomColor, topColor, t);
      if (debugMode >= 2.0) {
        vec3 debugCol = mix(vec3(1.0,0.0,0.0), vec3(0.0,0.0,1.0), t);
        gl_FragColor = vec4(debugCol, 1.0);
        return;
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vs,
    fragmentShader: fs,
    side: THREE.BackSide,
    depthWrite: false
  });

  const geo = new THREE.SphereGeometry(radius, 60, 20);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function updateSky(uniforms, t) {
  uniforms.time.value = t;
  // можно смело анимировать offset/exponent при необходимости
}

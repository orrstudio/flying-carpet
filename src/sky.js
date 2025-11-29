// простой sky shader — большая внутренняя сфера с градиентом
import * as THREE from 'three';

export function createSky(radius = 400) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x0f2a5a) },     // смените цвета по вкусу
    bottomColor: { value: new THREE.Color(0xffcf7f) },
    offset: { value: 0.0 },
    exponent: { value: 0.6 },
    time: { value: 0.0 }
  };

  const vs = /* glsl */`
    varying vec3 vWorldPos;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fs = /* glsl */`
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    uniform float time;
    varying vec3 vWorldPos;
    void main() {
      float h = normalize(vWorldPos).y + offset;
      float t = pow(max(h, 0.0), exponent);
      // небольшая анимация по времени (мягкая)
      float flicker = 0.02 * sin(time * 0.2 + vWorldPos.x * 0.01);
      vec3 col = mix(bottomColor, topColor, t) + flicker;
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

  const geo = new THREE.SphereGeometry(radius, 32, 15);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function updateSky(uniforms, t) {
  uniforms.time.value = t;
  // можно смело анимировать offset/exponent при необходимости
}

// Central config file — редактируй числовые значения здесь.
export default {
  path: {
    useGenerate: true,
    length: 240,
    segments: 9,
    lateralAmplitude: 28,
    verticalAmplitude: 12,
    seed: 0,
    points: []
  },

  clouds: {
    cloudCount: 100,
    particlesPerCloud: 8,
    width: 18,
    bias: 0,
    modelUrl: '/assets/models/cloud.glb'
  },

  visual: {
    lineSegments: 300,
    wheelSensitivity: 0.0009,
    touchSensitivity: 0.0012,
    mouseLookStrength: 0.6,
    cameraLerp: 0.15
  },

  // Параметры неба/фонa
  sky: {
    autoFollowCamera: true,   // если true — сфера неба всегда центрируется на камере
    radius: 600,              // фиксированный радиус сферы неба (не масштабируется)
    minRadius: 600,           // минимальный "приемлемый" радиус
    maxRadius: 2000           // максимум который будет учитываться при расчётах (без масштабирования)
  }
};

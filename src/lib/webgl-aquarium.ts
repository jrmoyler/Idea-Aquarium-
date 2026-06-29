import { animate, type JSAnimation } from "animejs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Organism } from "./simulation";
import { clamp, hashString, mulberry32 } from "./utils";

interface AquariumRenderState {
  now: number;
  selectedId: string | null;
  hoverId: string | null;
  mergeCandidateId: string | null;
  draggedId: string | null;
  matching: Set<string>;
  filtersActive: boolean;
}

interface CreatureVisual {
  group: THREE.Group;
  silhouette: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  accent: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  aura: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  orbit: THREE.Group;
  appendages: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  baseColor: string;
  variant: number;
  phase: number;
  zOffset: number;
}

interface PlantBlade {
  mesh: THREE.Mesh;
  phase: number;
  flutter: number;
  baseRotZ: number;
}

interface PlantVisual {
  group: THREE.Group;
  blades: PlantBlade[];
  swayAmplitude: number;
  swaySpeed: number;
  phase: number;
  anchor: number;
  heightFactor: number;
}

interface BubbleState {
  speed: number;
  wobble: number;
  phase: number;
}

const FLOOR_HEIGHT = 84;
const BUBBLE_COUNT = 120;
const PLANT_COUNT = 20;
const PLANT_STEM_HEIGHT = 124;

export class WebGLAquariumRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly lightState = { key: 1.1, fill: 0.8, hue: 0.52 };
  private readonly lightAnimations: JSAnimation[] = [];
  private readonly creatures = new Map<string, CreatureVisual>();
  private readonly plants: PlantVisual[] = [];
  private readonly gltfLoader = new GLTFLoader();

  private readonly ambientLight = new THREE.AmbientLight("#c8fbff", 1);
  private readonly hemiLight = new THREE.HemisphereLight("#8be9ff", "#8ef8a3", 1.2);
  private readonly keyLight = new THREE.DirectionalLight("#fff9da", 1.6);
  private readonly rimLight = new THREE.PointLight("#7f8cff", 1.2, 1200, 2);
  private readonly warmLight = new THREE.PointLight("#ff9bbd", 0.9, 1000, 2);

  private readonly bubbleGeometry = new THREE.BufferGeometry();
  private readonly bubbleTexture = WebGLAquariumRenderer.createBubbleTexture();
  private readonly bubbleMaterial = new THREE.PointsMaterial({
    color: "#e8ffff",
    map: this.bubbleTexture,
    alphaMap: this.bubbleTexture,
    transparent: true,
    opacity: 0.55,
    size: 9,
    sizeAttenuation: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly bubbles: THREE.Points;
  private readonly bubbleValues = new Float32Array(BUBBLE_COUNT * 3);
  private readonly bubbleStates: BubbleState[] = [];

  private readonly backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly floorCaustics: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Single tone-map ownership: HDR scene → ACES filmic → sRGB output. Materials
    // stay scene-referred; we never stack a second tone map in post.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.backdrop = this.createBackdrop();
    this.scene.add(this.backdrop);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, FLOOR_HEIGHT),
      new THREE.MeshStandardMaterial({
        color: "#1d6f57",
        roughness: 1,
        metalness: 0,
        emissive: "#10402f",
        emissiveIntensity: 0.18,
      }),
    );
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    // A caustic net of light cast onto the substrate, additively blended so it
    // brightens the floor without flattening its shading.
    this.floorCaustics = this.createFloorCaustics();
    this.scene.add(this.floorCaustics);

    this.scene.add(
      this.ambientLight,
      this.hemiLight,
      this.keyLight,
      this.rimLight,
      this.warmLight,
    );
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.radius = 4;
    this.keyLight.shadow.bias = -0.0004;

    this.bubbleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.bubbleValues, 3),
    );
    this.bubbles = new THREE.Points(this.bubbleGeometry, this.bubbleMaterial);
    this.bubbles.position.z = 45;
    this.scene.add(this.bubbles);

    this.seedPlants();
    this.seedBubbles();
    this.startLightAnimation();
    void this.tryLoadBlenderPlants();
    this.resize(width, height, window.devicePixelRatio || 1);
  }

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);

    this.renderer.setPixelRatio(Math.min(2, dpr));
    this.renderer.setSize(this.width, this.height, false);

    this.camera.left = -this.width / 2;
    this.camera.right = this.width / 2;
    this.camera.top = this.height / 2;
    this.camera.bottom = -this.height / 2;
    this.camera.near = 1;
    this.camera.far = 2200;
    this.camera.position.set(0, 0, 780);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.backdrop.geometry.dispose();
    this.backdrop.geometry = new THREE.PlaneGeometry(this.width, this.height);
    this.backdrop.position.set(0, 0, -480);
    this.backdrop.material.uniforms.uResolution.value.set(this.width, this.height);

    this.floor.geometry.dispose();
    this.floor.geometry = new THREE.PlaneGeometry(this.width * 1.25, FLOOR_HEIGHT);
    this.floor.position.set(0, -this.height / 2 + FLOOR_HEIGHT * 0.5, -60);

    this.floorCaustics.geometry.dispose();
    this.floorCaustics.geometry = new THREE.PlaneGeometry(this.width * 1.25, FLOOR_HEIGHT * 1.6);
    this.floorCaustics.position.set(
      0,
      -this.height / 2 + FLOOR_HEIGHT * 0.7,
      -58,
    );

    this.layoutPlants();
  }

  render(organisms: Organism[], state: AquariumRenderState) {
    this.backdrop.material.uniforms.uTime.value = state.now * 0.001;
    this.floorCaustics.material.uniforms.uTime.value = state.now * 0.001;

    this.keyLight.intensity = 1.1 * this.lightState.key;
    this.hemiLight.intensity = 0.9 + this.lightState.fill * 0.7;
    this.rimLight.intensity = 0.8 + this.lightState.fill * 0.8;
    this.warmLight.intensity = 0.7 + (1 - this.lightState.fill) * 0.7;

    this.keyLight.color.setHSL(0.13, 0.52, 0.78 + this.lightState.fill * 0.08);
    this.rimLight.color.setHSL(this.lightState.hue, 0.75, 0.6);
    this.warmLight.color.setHSL(
      (this.lightState.hue + 0.18) % 1,
      0.7,
      0.64,
    );
    this.keyLight.position.set(
      -this.width * 0.3 + Math.sin(state.now * 0.00022) * 90,
      this.height * 0.4,
      430,
    );
    this.rimLight.position.set(
      this.width * 0.36 + Math.sin(state.now * 0.0005) * 100,
      this.height * 0.12,
      240,
    );
    this.warmLight.position.set(
      -this.width * 0.28 + Math.cos(state.now * 0.0004) * 120,
      -this.height * 0.1,
      260,
    );

    this.updatePlants(state.now);
    this.updateBubbles(state.now);
    this.syncCreatures(organisms, state);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const animation of this.lightAnimations) animation.pause();
    this.lightAnimations.length = 0;

    for (const visual of this.creatures.values()) {
      this.disposeCreature(visual);
    }
    this.creatures.clear();

    for (const plant of this.plants) {
      this.disposeObject(plant.group);
    }
    this.plants.length = 0;

    this.bubbleGeometry.dispose();
    this.bubbleMaterial.dispose();
    this.bubbleTexture.dispose();
    this.backdrop.geometry.dispose();
    this.backdrop.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.floorCaustics.geometry.dispose();
    this.floorCaustics.material.dispose();
    this.renderer.dispose();
  }

  private startLightAnimation() {
    this.lightAnimations.push(
      animate(this.lightState, {
        key: [0.9, 1.45],
        duration: 4200,
        ease: "inOutSine",
        alternate: true,
        loop: true,
      }),
      animate(this.lightState, {
        fill: [0.3, 1.05],
        duration: 6200,
        ease: "inOutQuad",
        alternate: true,
        loop: true,
      }),
      animate(this.lightState, {
        hue: [0.46, 0.64],
        duration: 7600,
        ease: "inOutSine",
        alternate: true,
        loop: true,
      }),
    );
  }

  private createBackdrop() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uResolution;

        // --- Value noise / fbm for caustic + shaft coherence ---------------
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            v += amp * noise(p);
            p *= 2.0;
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = vUv;
          // Depth runs from surface (top, uv.y = 1) to floor (bottom, uv.y = 0).
          float depth = 1.0 - uv.y;

          // Beer-Lambert style absorption: warm wavelengths die off fastest with
          // depth, so the column shifts from bright aqua near the surface toward
          // a deep teal-blue at the floor.
          vec3 surfaceTint = vec3(0.49, 0.93, 0.97);
          vec3 deepTint    = vec3(0.03, 0.20, 0.34);
          vec3 absorb = vec3(0.35, 0.10, 0.04); // per-channel extinction
          vec3 transmit = exp(-absorb * depth * 4.5);
          vec3 base = mix(deepTint, surfaceTint, transmit.b);
          base = mix(base, surfaceTint, smoothstep(0.55, 1.0, uv.y) * 0.35);

          // Volumetric god-ray shafts angled from the surface. Several drifting
          // bands share one coherent noise field so they read as light, not
          // stripes, and fade with depth as the water scatters them out.
          float shaftCoord = uv.x * 2.4 + uv.y * 0.5;
          float shafts = 0.0;
          shafts += smoothstep(0.78, 1.0, sin(shaftCoord * 3.1 + uTime * 0.10) * 0.5 + 0.5);
          shafts += smoothstep(0.82, 1.0, sin(shaftCoord * 5.7 - uTime * 0.07) * 0.5 + 0.5) * 0.6;
          shafts *= fbm(vec2(uv.x * 3.0 + uTime * 0.05, uv.y * 1.2));
          shafts *= smoothstep(0.0, 0.65, uv.y); // brightest up high, gone by the floor
          base += vec3(0.55, 0.78, 0.85) * shafts * 0.18;

          // Caustic shimmer: two animated cellular layers beaten together cast a
          // moving net of light that strengthens toward the floor.
          vec2 cp = uv * vec2(7.0, 5.0);
          float c1 = fbm(cp + vec2(uTime * 0.12, uTime * 0.08));
          float c2 = fbm(cp * 1.7 - vec2(uTime * 0.09, uTime * 0.11));
          float caustic = pow(1.0 - abs(c1 - c2), 6.0);
          caustic *= smoothstep(0.95, 0.2, uv.y);
          base += vec3(0.45, 0.85, 0.80) * caustic * 0.22;

          // Tank glass: soft corner vignette + a faint top surface highlight.
          vec2 d = uv - 0.5;
          float vignette = smoothstep(0.95, 0.35, length(d * vec2(1.05, 1.25)));
          base *= mix(0.78, 1.0, vignette);
          base += vec3(0.6, 0.9, 1.0) * smoothstep(0.93, 1.0, uv.y) * 0.25;

          gl_FragColor = vec4(base, 1.0);
        }
      `,
      depthWrite: false,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  }

  /**
   * A soft round bubble sprite: a bright rim with a hollow centre and a small
   * highlight, so points read as little gas spheres rather than hard squares.
   */
  private static createBubbleTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    const ring = ctx.createRadialGradient(c, c, size * 0.18, c, c, size * 0.5);
    ring.addColorStop(0, "rgba(255,255,255,0.05)");
    ring.addColorStop(0.72, "rgba(220,250,255,0.35)");
    ring.addColorStop(0.9, "rgba(255,255,255,0.85)");
    ring.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    // Specular highlight off to one side.
    const hi = ctx.createRadialGradient(
      size * 0.36,
      size * 0.34,
      0,
      size * 0.36,
      size * 0.34,
      size * 0.18,
    );
    hi.addColorStop(0, "rgba(255,255,255,0.9)");
    hi.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(size * 0.36, size * 0.34, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createFloorCaustics() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, amp = 0.5;
          for (int i = 0; i < 4; i++) { v += amp * noise(p); p *= 2.0; amp *= 0.5; }
          return v;
        }

        void main() {
          vec2 uv = vUv;
          vec2 cp = uv * vec2(11.0, 4.0);
          float a = fbm(cp + vec2(uTime * 0.13, uTime * 0.06));
          float b = fbm(cp * 1.6 - vec2(uTime * 0.10, uTime * 0.09));
          float caustic = pow(1.0 - abs(a - b), 7.0);
          // Fade in toward the top edge of the substrate where light pools, and
          // taper at the horizontal edges so it never hard-cuts.
          float band = smoothstep(0.0, 0.5, uv.y) * smoothstep(1.0, 0.7, uv.y);
          float edge = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
          vec3 col = vec3(0.40, 0.85, 0.78) * caustic * (0.6 + band) * edge;
          gl_FragColor = vec4(col, caustic * edge);
        }
      `,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  }

  /**
   * Build one curved, tapered seagrass blade anchored at its base (y = 0) and
   * growing upward, bowing gently in x. Returns geometry ready for translucent
   * double-sided rendering.
   */
  private createBladeGeometry(
    height: number,
    width: number,
    curve: number,
    segments: number,
  ) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * height;
      // Taper to a soft point; bow the blade along x with an ease-in curve.
      const halfW = (width * 0.5) * Math.pow(1 - t, 0.65) + 0.4;
      const bow = curve * t * t;
      positions.push(bow - halfW, y, 0, bow + halfW, y, 0);
      uvs.push(0, t, 1, t);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  private seedPlants() {
    for (let i = 0; i < PLANT_COUNT; i++) {
      const rng = mulberry32(0x91a4_3f + i * 37);
      const group = new THREE.Group();
      const blades: PlantBlade[] = [];

      // Each clump shares a hue so seeds read as distinct species rather than
      // random noise, with per-blade lightness scatter for depth.
      const hue = 0.27 + rng() * 0.14;
      const bladeCount = 6 + Math.floor(rng() * 5);
      for (let b = 0; b < bladeCount; b++) {
        const f = b / Math.max(1, bladeCount - 1);
        const height = PLANT_STEM_HEIGHT * (0.55 + rng() * 0.7);
        const width = 7 + rng() * 6;
        const curveDir = rng() > 0.5 ? 1 : -1;
        const curve = curveDir * (14 + rng() * 26);
        const color = new THREE.Color().setHSL(
          hue + (rng() - 0.5) * 0.05,
          0.55 + rng() * 0.2,
          0.32 + rng() * 0.18,
        );
        const material = new THREE.MeshPhysicalMaterial({
          color,
          // Backlit translucency: god-rays and caustics glow through the blade.
          transmission: 0.55,
          thickness: 6,
          ior: 1.4,
          roughness: 0.55,
          metalness: 0,
          emissive: color.clone().multiplyScalar(0.25),
          emissiveIntensity: 0.35,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.96,
        });
        const mesh = new THREE.Mesh(
          this.createBladeGeometry(height, width, curve, 14),
          material,
        );
        // Fan the blades around the base and lean them outward a touch.
        const spread = (f - 0.5) * 2;
        mesh.position.set(spread * (8 + rng() * 10), 0, (rng() - 0.5) * 14);
        mesh.rotation.y = spread * (0.5 + rng() * 0.6);
        const baseRotZ = spread * (0.12 + rng() * 0.16);
        mesh.rotation.z = baseRotZ;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        blades.push({
          mesh,
          phase: rng() * Math.PI * 2,
          flutter: 0.04 + rng() * 0.06,
          baseRotZ,
        });
      }

      this.scene.add(group);
      this.plants.push({
        group,
        blades,
        anchor: i / Math.max(1, PLANT_COUNT - 1),
        heightFactor: 0.7 + rng() * 1.7,
        phase: rng() * Math.PI * 2,
        swayAmplitude: 0.04 + rng() * 0.07,
        swaySpeed: 0.3 + rng() * 0.7,
      });
    }
  }

  private layoutPlants() {
    for (let i = 0; i < this.plants.length; i++) {
      const plant = this.plants[i];
      const edgePush = i % 2 === 0 ? 0.12 : -0.12;
      const centered = plant.anchor + edgePush;
      const x = (centered - 0.5) * this.width;
      const y = -this.height / 2 + FLOOR_HEIGHT * 0.1;
      plant.group.position.set(x, y, -110 + (i % 5) * 6);
      const scale = plant.heightFactor * (this.height / 780);
      plant.group.scale.setScalar(scale);
    }
  }

  private updatePlants(now: number) {
    const t = now * 0.001;
    for (const plant of this.plants) {
      // Rooted wind: the whole clump bows from its anchored base.
      const gust = Math.sin(t * plant.swaySpeed + plant.phase);
      plant.group.rotation.z = gust * plant.swayAmplitude;
      plant.group.rotation.y =
        Math.cos(t * (plant.swaySpeed * 0.55) + plant.phase) * 0.1;
      // Per-blade flutter layered on top so tips ripple out of phase with the
      // gust instead of moving as one rigid card.
      for (const blade of plant.blades) {
        blade.mesh.rotation.z =
          blade.baseRotZ +
          Math.sin(t * (plant.swaySpeed * 1.8) + blade.phase) * blade.flutter +
          gust * 0.05;
      }
    }
  }

  private seedBubbles() {
    const rng = mulberry32(0x2f4e_9b11);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      this.bubbleValues[i * 3 + 0] = (rng() - 0.5) * this.width;
      this.bubbleValues[i * 3 + 1] = (rng() - 0.5) * this.height;
      this.bubbleValues[i * 3 + 2] = -30 + rng() * 90;
      this.bubbleStates.push({
        speed: 25 + rng() * 40,
        wobble: 4 + rng() * 12,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  private updateBubbles(now: number) {
    const t = now * 0.001;
    const floorY = -this.height / 2 + FLOOR_HEIGHT * 0.65;
    const topY = this.height * 0.5 - 34;
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const idx = i * 3;
      const state = this.bubbleStates[i];
      this.bubbleValues[idx + 1] += state.speed * 0.014;
      this.bubbleValues[idx] +=
        Math.sin(t * 1.6 + state.phase + i * 0.1) * state.wobble * 0.012;
      if (this.bubbleValues[idx + 1] > topY) {
        this.bubbleValues[idx + 1] = floorY;
        this.bubbleValues[idx] = (Math.random() - 0.5) * this.width * 0.9;
        this.bubbleValues[idx + 2] = -30 + Math.random() * 90;
      }
    }
    const attr = this.bubbleGeometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  private syncCreatures(organisms: Organism[], state: AquariumRenderState) {
    const keep = new Set<string>();

    for (const organism of organisms) {
      keep.add(organism.idea.id);
      let visual = this.creatures.get(organism.idea.id);
      if (!visual) {
        visual = this.createCreature(organism);
        this.creatures.set(organism.idea.id, visual);
        this.scene.add(visual.group);
      }
      this.updateCreature(visual, organism, state);
    }

    for (const [id, visual] of this.creatures) {
      if (keep.has(id)) continue;
      this.scene.remove(visual.group);
      this.disposeCreature(visual);
      this.creatures.delete(id);
    }
  }

  private createCreature(organism: Organism): CreatureVisual {
    const seed = hashString(organism.idea.id);
    const rng = mulberry32(seed ^ 0x7f4a_129d);
    const group = new THREE.Group();
    const baseColor = new THREE.Color(organism.baseColor);
    baseColor.offsetHSL((rng() - 0.5) * 0.22, 0.2 + rng() * 0.25, rng() * 0.12);

    const silhouette = new THREE.Mesh(
      new THREE.CircleGeometry(1.18, 48),
      new THREE.MeshBasicMaterial({
        color: "#0c2f47",
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    silhouette.position.z = -0.85;
    silhouette.renderOrder = 1;
    group.add(silhouette);

    const bodyGeometry = this.createBodyGeometry(organism.archetype, rng);
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      emissive: baseColor.clone().multiplyScalar(0.22),
      emissiveIntensity: 0.55,
      roughness: 0.32 + rng() * 0.22,
      metalness: 0.04 + rng() * 0.08,
      // A wet, gel-like sheen reads as a translucent aquatic body.
      clearcoat: 0.7,
      clearcoatRoughness: 0.35,
      transmission: 0.18,
      thickness: 0.9,
      ior: 1.33,
      transparent: true,
      opacity: 1,
      depthWrite: true,
      flatShading: false,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.renderOrder = 3;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const accentColor = baseColor.clone().offsetHSL(0.16 + rng() * 0.3, 0.18, 0.18);
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor.clone().multiplyScalar(0.35),
      emissiveIntensity: 1,
      roughness: 0.24,
      metalness: 0.18,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const accent = new THREE.Mesh(this.createAccentGeometry(rng), accentMaterial);
    accent.scale.setScalar(0.85 + rng() * 0.55);
    accent.renderOrder = 4;
    accent.castShadow = true;
    group.add(accent);

    const orbit = new THREE.Group();
    group.add(orbit);

    const appendages: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
    const appendageCount = 3 + Math.floor(clamp(organism.profile.tendrils.length, 0, 8));
    for (let i = 0; i < appendageCount; i++) {
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.08 + rng() * 0.17, 0.8 + rng() * 0.95, 7),
        new THREE.MeshStandardMaterial({
          color: accentColor.clone().offsetHSL((rng() - 0.5) * 0.08, 0.1, -0.1),
          emissive: accentColor.clone().multiplyScalar(0.16),
          emissiveIntensity: 0.8,
          roughness: 0.45,
          metalness: 0.1,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        }),
      );
      const angle = (i / appendageCount) * Math.PI * 2 + rng() * 0.4;
      const spread = 0.95 + rng() * 0.25;
      tip.position.set(Math.cos(angle) * spread, Math.sin(angle) * spread, -0.18);
      tip.lookAt(new THREE.Vector3(tip.position.x * 2, tip.position.y * 2, -0.7));
      orbit.add(tip);
      appendages.push(tip);
    }

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.65, 48),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    aura.position.z = -0.55;
    aura.renderOrder = 2;
    group.add(aura);

    if (rng() > 0.4) {
      const satellites = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < satellites; i++) {
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.08 + rng() * 0.09, 12, 12),
          new THREE.MeshStandardMaterial({
            color: accentColor.clone().offsetHSL((rng() - 0.5) * 0.15, 0.05, 0.1),
            emissive: accentColor.clone().multiplyScalar(0.32),
            emissiveIntensity: 1.1,
            roughness: 0.2,
            metalness: 0.12,
          }),
        );
        const ang = (i / satellites) * Math.PI * 2;
        orb.position.set(Math.cos(ang) * 1.55, Math.sin(ang) * 1.55, 0);
        orbit.add(orb);
      }
    }

    return {
      group,
      silhouette,
      body,
      accent,
      aura,
      orbit,
      appendages,
      baseColor: organism.baseColor,
      variant: Math.floor(rng() * 4),
      phase: rng() * Math.PI * 2,
      zOffset: -20 + rng() * 95,
    };
  }

  private updateCreature(
    visual: CreatureVisual,
    organism: Organism,
    state: AquariumRenderState,
  ) {
    const isHover = state.hoverId === organism.idea.id;
    const isSelected = state.selectedId === organism.idea.id;
    const isDragged = state.draggedId === organism.idea.id;
    const isMerge = state.mergeCandidateId === organism.idea.id;
    const dimmed =
      state.filtersActive &&
      state.matching.size > 0 &&
      !state.matching.has(organism.idea.id);
    const emphasis = Math.max(
      isHover ? 0.65 : 0,
      isSelected ? 1 : 0,
      isMerge ? 0.75 : 0,
      isDragged ? 0.95 : 0,
    );
    const pulse = 1 + Math.sin(organism.pulsePhase + visual.phase) * 0.08;
    // Body geometries are authored at ~1 world-unit radius and the orthographic
    // camera maps 1 world unit → 1 px, so the group must scale to the organism's
    // real pixel radius to fill its hit area (simulation uses radius + 10). The
    // old `radius / 20` factor rendered every creature as a 1–2 px speck.
    const scale = organism.radius * pulse;
    const brightness = 0.8 + emphasis * 1.45 + organism.resonance * 1.1;

    if (organism.baseColor !== visual.baseColor) {
      visual.baseColor = organism.baseColor;
      const next = new THREE.Color(organism.baseColor);
      visual.body.material.color.copy(next);
      visual.body.material.emissive.copy(next.clone().multiplyScalar(0.33));
    }

    visual.group.position.set(
      organism.x - this.width / 2,
      this.height / 2 - organism.y + Math.sin(state.now * 0.0015 + visual.phase) * 7,
      visual.zOffset,
    );
    visual.group.rotation.set(
      Math.sin(state.now * 0.0011 + visual.phase) * 0.16,
      Math.cos(state.now * 0.0012 + visual.phase) * 0.22,
      -organism.heading,
    );
    visual.group.scale.setScalar(scale * (1 + emphasis * 0.18));

    visual.silhouette.material.opacity = dimmed ? 0.05 : 0.1 + emphasis * 0.18;
    visual.silhouette.scale.setScalar(1.02 + emphasis * 0.2 + organism.hover * 0.12);
    visual.body.material.emissiveIntensity = brightness;
    visual.body.material.opacity = dimmed ? 0.3 : 1;
    visual.body.material.roughness = clamp(0.25 + (1 - organism.idea.joy / 100) * 0.55, 0.2, 0.95);

    visual.accent.rotation.x = state.now * 0.0005 + visual.phase;
    visual.accent.rotation.y = state.now * 0.00065 + visual.variant;
    visual.accent.material.opacity = dimmed ? 0.16 : 0.7 + emphasis * 0.2;
    visual.accent.material.emissiveIntensity = 0.7 + emphasis * 1.2;

    visual.orbit.rotation.z = state.now * 0.0008 + visual.phase;
    visual.orbit.rotation.x = state.now * 0.00045 + organism.idea.synergy * 0.01;
    for (let i = 0; i < visual.appendages.length; i++) {
      const part = visual.appendages[i];
      part.scale.y = 0.7 + Math.sin(state.now * 0.002 + i + visual.phase) * 0.2;
      part.material.opacity = dimmed ? 0.14 : 0.72;
      part.material.emissiveIntensity = 0.55 + emphasis * 0.5;
    }

    visual.aura.material.opacity = dimmed ? 0 : emphasis * 0.45;
    visual.aura.scale.setScalar(1 + emphasis * 0.55 + organism.hover * 0.35);
  }

  private createBodyGeometry(archetype: Organism["archetype"], rng: () => number) {
    switch (archetype) {
      case "drifter":
        return new THREE.SphereGeometry(1, 48, 36);
      case "swarmer":
        return new THREE.OctahedronGeometry(1, 3);
      case "floater":
        return new THREE.DodecahedronGeometry(1, 2);
      case "hunter":
        return new THREE.CapsuleGeometry(0.64 + rng() * 0.14, 1.3 + rng() * 0.5, 16, 32);
      default: {
        const _never: never = archetype;
        return _never;
      }
    }
  }

  private createAccentGeometry(rng: () => number) {
    const variant = Math.floor(rng() * 4);
    switch (variant) {
      case 0:
        return new THREE.TorusGeometry(0.95, 0.14, 20, 64);
      case 1:
        return new THREE.TorusKnotGeometry(0.42, 0.12, 80, 12, 2, 3);
      case 2:
        return new THREE.IcosahedronGeometry(0.7, 0);
      case 3:
        return new THREE.CylinderGeometry(0.34, 0.64, 1.1, 7, 1, true);
      default:
        return new THREE.TorusGeometry(0.8, 0.1, 14, 48);
    }
  }

  private async tryLoadBlenderPlants() {
    try {
      const gltf = await this.gltfLoader.loadAsync("/assets/blender/plants.glb");
      const group = gltf.scene;
      group.position.set(0, -this.height / 2 + FLOOR_HEIGHT * 0.1, -220);
      group.scale.set(76, 76, 76);
      // Some exports arrive in an upside-down orientation; normalize to upright.
      group.rotation.x = Math.PI;
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
      });
      this.scene.add(group);
    } catch {
      // Optional Blender assets are not required in local runs.
    }
  }

  private disposeCreature(visual: CreatureVisual) {
    this.disposeObject(visual.group);
  }

  private disposeObject(root: THREE.Object3D) {
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      if (Array.isArray(node.material)) {
        for (const m of node.material) m.dispose();
      } else {
        node.material.dispose();
      }
    });
  }
}

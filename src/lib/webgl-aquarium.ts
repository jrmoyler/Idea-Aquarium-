import { animate, type JSAnimation } from "animejs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Organism } from "./simulation";
import type { RenderProfile, Tendril } from "./organism-profile";
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

/** A single rendered tendril/arm/fin strand built as a tapered ribbon. */
interface StrandVisual {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  spec: Tendril;
  // Cached authoring data so we can re-deform the ribbon each frame cheaply.
  segs: number;
  basePos: THREE.Vector3; // root attachment point in body-local space
  dir: THREE.Vector2; // outward direction along the strand
  halfWidths: Float32Array; // per-segment half width (taper)
  positions: Float32Array; // live position buffer (2 verts per segment ring)
}

interface GlowSprite {
  sprite: THREE.Sprite;
  phase: number;
  baseScale: number;
  warm: boolean;
}

interface CreatureVisual {
  group: THREE.Group;
  swimTilt: THREE.Group; // holds body + strands, leans with banking
  silhouette: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  membrane: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> | null;
  strands: StrandVisual[];
  fins: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  glows: GlowSprite[];
  aura: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  profile: RenderProfile;
  baseColor: string;
  phase: number;
  zOffset: number;
  archetype: Organism["archetype"];
}

interface PlantBlade {
  mesh: THREE.Mesh;
  phase: number;
  flutter: number;
  baseRotZ: number;
  heightFrac: number;
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

// Shared soft glow sprite for internal bioluminescence — reused across all
// creatures so we never allocate per-organism textures.
let SHARED_GLOW_TEXTURE: THREE.CanvasTexture | null = null;

export class WebGLAquariumRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly renderer: THREE.WebGLRenderer;
  // Light state animates within a *narrow, slow* band so the scene breathes
  // imperceptibly rather than strobing. Values are normalized 0..1 here and
  // mapped to small intensity deltas in render().
  private readonly lightState = { key: 0.5, fill: 0.5, hue: 0.54 };
  private readonly lightAnimations: JSAnimation[] = [];
  private readonly creatures = new Map<string, CreatureVisual>();
  private readonly plants: PlantVisual[] = [];
  private readonly gltfLoader = new GLTFLoader();

  private readonly ambientLight = new THREE.AmbientLight("#bdf3ff", 0.85);
  private readonly hemiLight = new THREE.HemisphereLight("#8be9ff", "#7fd6a0", 0.95);
  private readonly keyLight = new THREE.DirectionalLight("#fff6d8", 1.35);
  private readonly rimLight = new THREE.PointLight("#7f9cff", 0.9, 1400, 2);
  private readonly warmLight = new THREE.PointLight("#ffb38f", 0.55, 1100, 2);

  private readonly glowSpriteTexture = WebGLAquariumRenderer.getGlowTexture();

  private readonly bubbleGeometry = new THREE.BufferGeometry();
  private readonly bubbleTexture = WebGLAquariumRenderer.createBubbleTexture();
  private readonly bubbleMaterial = new THREE.PointsMaterial({
    color: "#dffcff",
    map: this.bubbleTexture,
    alphaMap: this.bubbleTexture,
    transparent: true,
    opacity: 0.5,
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
    // Single tone-map ownership: HDR scene → ACES filmic → sRGB output. We keep
    // exposure modest so soft internal glow never blooms/strobes.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
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
        emissiveIntensity: 0.16,
      }),
    );
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

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
    const t = state.now * 0.001;
    this.backdrop.material.uniforms.uTime.value = t;
    this.floorCaustics.material.uniforms.uTime.value = t;

    // Gentle "breathing" lighting. The animated state is normalized 0..1 and we
    // map it to a tight band around safe baselines — at most a few % of swing,
    // so there is no perceptible strobe. All intensities are clamped.
    const keyMix = this.lightState.key; // 0..1
    const fillMix = this.lightState.fill; // 0..1
    this.keyLight.intensity = clamp(1.28 + keyMix * 0.14, 1.2, 1.45);
    this.hemiLight.intensity = clamp(0.9 + fillMix * 0.12, 0.85, 1.05);
    this.rimLight.intensity = clamp(0.82 + fillMix * 0.16, 0.78, 1.0);
    this.warmLight.intensity = clamp(0.5 + (1 - fillMix) * 0.14, 0.48, 0.66);

    // Hue barely moves — a slow drift between cool blue and faint cyan.
    this.keyLight.color.setHSL(0.13, 0.5, 0.78);
    this.rimLight.color.setHSL(this.lightState.hue, 0.6, 0.62);
    this.warmLight.color.setHSL(0.07, 0.6, 0.62);

    this.keyLight.position.set(
      -this.width * 0.3 + Math.sin(t * 0.18) * 70,
      this.height * 0.42,
      430,
    );
    this.rimLight.position.set(
      this.width * 0.36 + Math.sin(t * 0.22) * 80,
      this.height * 0.12,
      240,
    );
    this.warmLight.position.set(
      -this.width * 0.28 + Math.cos(t * 0.16) * 90,
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
    this.glowSpriteTexture.dispose();
    this.backdrop.geometry.dispose();
    this.backdrop.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.floorCaustics.geometry.dispose();
    this.floorCaustics.material.dispose();
    this.renderer.dispose();
  }

  private startLightAnimation() {
    // Slow, narrow drifts. Endpoints are close together so light only "breathes"
    // by a few percent. Durations are long to keep motion sub-perceptual.
    this.lightAnimations.push(
      animate(this.lightState, {
        key: [0.4, 0.6],
        duration: 9000,
        ease: "inOutSine",
        alternate: true,
        loop: true,
      }),
      animate(this.lightState, {
        fill: [0.4, 0.6],
        duration: 12000,
        ease: "inOutSine",
        alternate: true,
        loop: true,
      }),
      animate(this.lightState, {
        hue: [0.52, 0.57],
        duration: 16000,
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
          float depth = 1.0 - uv.y;

          // Beer-Lambert absorption: column shifts from bright aqua at the
          // surface to deep teal-blue at the floor.
          vec3 surfaceTint = vec3(0.42, 0.86, 0.93);
          vec3 deepTint    = vec3(0.02, 0.15, 0.28);
          vec3 absorb = vec3(0.35, 0.10, 0.04);
          vec3 transmit = exp(-absorb * depth * 4.5);
          vec3 base = mix(deepTint, surfaceTint, transmit.b);
          base = mix(base, surfaceTint, smoothstep(0.55, 1.0, uv.y) * 0.32);

          // Volumetric god-ray shafts. Time multipliers are slow so light drifts
          // calmly with no flicker.
          float shaftCoord = uv.x * 2.4 + uv.y * 0.5;
          float shafts = 0.0;
          shafts += smoothstep(0.80, 1.0, sin(shaftCoord * 3.1 + uTime * 0.06) * 0.5 + 0.5);
          shafts += smoothstep(0.84, 1.0, sin(shaftCoord * 5.7 - uTime * 0.04) * 0.5 + 0.5) * 0.55;
          shafts *= fbm(vec2(uv.x * 3.0 + uTime * 0.03, uv.y * 1.2));
          shafts *= smoothstep(0.0, 0.65, uv.y);
          base += vec3(0.5, 0.74, 0.82) * shafts * 0.15;

          // Caustic shimmer, strengthening toward the floor. Slow advection.
          vec2 cp = uv * vec2(7.0, 5.0);
          float c1 = fbm(cp + vec2(uTime * 0.06, uTime * 0.04));
          float c2 = fbm(cp * 1.7 - vec2(uTime * 0.05, uTime * 0.055));
          float caustic = pow(1.0 - abs(c1 - c2), 6.0);
          caustic *= smoothstep(0.95, 0.2, uv.y);
          base += vec3(0.40, 0.80, 0.76) * caustic * 0.18;

          // Tank glass vignette + faint surface highlight.
          vec2 d = uv - 0.5;
          float vignette = smoothstep(0.95, 0.35, length(d * vec2(1.05, 1.25)));
          base *= mix(0.76, 1.0, vignette);
          base += vec3(0.55, 0.86, 0.98) * smoothstep(0.93, 1.0, uv.y) * 0.22;

          gl_FragColor = vec4(base, 1.0);
        }
      `,
      depthWrite: false,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  }

  private static createBubbleTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    const ring = ctx.createRadialGradient(c, c, size * 0.18, c, c, size * 0.5);
    ring.addColorStop(0, "rgba(255,255,255,0.05)");
    ring.addColorStop(0.72, "rgba(220,250,255,0.32)");
    ring.addColorStop(0.9, "rgba(255,255,255,0.8)");
    ring.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
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

  /** A soft circular glow used for internal bioluminescent pockets/eyes. A
   * smooth radial falloff so additive sprites never show a hard edge. */
  private static getGlowTexture() {
    if (SHARED_GLOW_TEXTURE) return SHARED_GLOW_TEXTURE;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(0.7, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    SHARED_GLOW_TEXTURE = tex;
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
          float a = fbm(cp + vec2(uTime * 0.07, uTime * 0.03));
          float b = fbm(cp * 1.6 - vec2(uTime * 0.05, uTime * 0.05));
          float caustic = pow(1.0 - abs(a - b), 7.0);
          float band = smoothstep(0.0, 0.5, uv.y) * smoothstep(1.0, 0.7, uv.y);
          float edge = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
          vec3 col = vec3(0.36, 0.80, 0.74) * caustic * (0.55 + band) * edge;
          gl_FragColor = vec4(col, caustic * edge * 0.85);
        }
      `,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  }

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

      const hue = 0.28 + rng() * 0.12;
      const bladeCount = 6 + Math.floor(rng() * 5);
      for (let b = 0; b < bladeCount; b++) {
        const f = b / Math.max(1, bladeCount - 1);
        const height = PLANT_STEM_HEIGHT * (0.55 + rng() * 0.7);
        const width = 7 + rng() * 6;
        const curveDir = rng() > 0.5 ? 1 : -1;
        const curve = curveDir * (14 + rng() * 26);
        const color = new THREE.Color().setHSL(
          hue + (rng() - 0.5) * 0.05,
          0.5 + rng() * 0.2,
          0.3 + rng() * 0.16,
        );
        const material = new THREE.MeshPhysicalMaterial({
          color,
          transmission: 0.5,
          thickness: 6,
          ior: 1.4,
          roughness: 0.55,
          metalness: 0,
          emissive: color.clone().multiplyScalar(0.22),
          emissiveIntensity: 0.3,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.96,
        });
        const mesh = new THREE.Mesh(
          this.createBladeGeometry(height, width, curve, 16),
          material,
        );
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
          heightFrac: 0.55 + rng() * 0.7,
        });
      }

      this.scene.add(group);
      this.plants.push({
        group,
        blades,
        anchor: i / Math.max(1, PLANT_COUNT - 1),
        heightFactor: 0.7 + rng() * 1.7,
        phase: rng() * Math.PI * 2,
        swayAmplitude: 0.035 + rng() * 0.06,
        swaySpeed: 0.25 + rng() * 0.5,
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
      // Rooted wind: the whole clump bows gently from its anchored base.
      const gust = Math.sin(t * plant.swaySpeed + plant.phase);
      plant.group.rotation.z = gust * plant.swayAmplitude;
      plant.group.rotation.y =
        Math.cos(t * (plant.swaySpeed * 0.55) + plant.phase) * 0.08;
      for (const blade of plant.blades) {
        // Taller blades flutter a touch more at the tip.
        blade.mesh.rotation.z =
          blade.baseRotZ +
          Math.sin(t * (plant.swaySpeed * 1.7) + blade.phase) *
            blade.flutter *
            blade.heightFrac +
          gust * 0.04;
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
        speed: 22 + rng() * 34,
        wobble: 4 + rng() * 10,
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
        Math.sin(t * 1.4 + state.phase + i * 0.1) * state.wobble * 0.012;
      if (this.bubbleValues[idx + 1] > topY) {
        // Respawn at the floor with a fresh column. Random reposition is fine —
        // it happens off-screen above the top edge, never as a visible jump.
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

  // ----------------------------------------------------------------------- //
  //  ORGANIC CREATURE CONSTRUCTION                                          //
  // ----------------------------------------------------------------------- //

  /**
   * Build a smooth, deformed body from a high-resolution sphere. The profile's
   * lobe parameters perturb each vertex radially so no body is a clean primitive,
   * while `aspect` stretches the form along the heading axis (x). High segment
   * counts keep silhouettes smooth — never faceted, never flat-shaded.
   */
  private buildBodyGeometry(profile: RenderProfile): THREE.BufferGeometry {
    const archetype = profile.archetype;
    // Generous tessellation for smooth silhouettes.
    const geo = new THREE.SphereGeometry(1, 64, 48);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();

    // Archetype-specific silhouette shaping applied on top of lobe noise.
    const aspect = profile.aspect;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const nx = v.x;
      const ny = v.y;
      const nz = v.z;
      // Spherical angles for radial lobe perturbation.
      const theta = Math.atan2(nz, nx); // around the body
      const phi = Math.asin(clamp(ny, -1, 1)); // up/down

      // Smooth multi-frequency radial deformation (the "lumpiness").
      let r = 1;
      r += profile.lobeAmp *
        Math.sin(theta * profile.lobeFreqA + profile.lobePhaseA) *
        Math.cos(phi * 1.5);
      r += profile.lobeAmp * 0.6 *
        Math.sin(theta * profile.lobeFreqB + profile.lobePhaseB);
      // Directional asymmetry: one flank is fuller.
      r += profile.asym * 0.25 * nx;

      let sx = nx;
      let sy = ny;
      let sz = nz;

      if (archetype === "drifter") {
        // Medusa bell: a rounded dome on top, gathered/open underneath. Flatten
        // the lower hemisphere inward and tuck the margin so it reads as a bell
        // with a ruffled rim rather than a full sphere.
        const bell = ny; // -1 bottom .. 1 top
        sy = ny * (0.78 + 0.22 * Math.max(0, bell));
        // Pull the underside inward to hollow the bell.
        if (bell < 0) {
          const tuck = Math.min(1, -bell);
          sx *= 1 - tuck * 0.32;
          sz *= 1 - tuck * 0.32;
          sy = ny * 0.6;
        }
        // Ruffled margin near the equator.
        const ruffle = Math.exp(-Math.pow((phi) * 3.0, 2));
        r += ruffle * 0.06 * Math.sin(theta * (profile.lobeFreqB + 4));
        r *= 1.04;
      } else if (archetype === "swarmer") {
        // Larva/fish: smooth tapered spindle along x. Pinch the tail (-x) end.
        const tailPinch = sx < 0 ? 1 - Math.pow(-sx, 1.4) * 0.55 : 1;
        sy *= tailPinch;
        sz *= tailPinch;
        sx *= aspect;
        // Slightly deeper belly than back.
        if (sy < 0) sy *= 1.12;
      } else if (archetype === "hunter") {
        // Cephalopod mantle: a smooth tapered torpedo, fuller at the head (+x),
        // drawn to a soft point at the mantle tip (-x).
        const taper = sx < 0 ? 1 - Math.pow(-sx, 1.5) * 0.5 : 1 - Math.pow(sx, 2) * 0.12;
        sy *= taper;
        sz *= taper;
        sx *= aspect;
      } else {
        // floater: gently lumpy near-round sac.
        sx *= aspect;
        r += profile.lobeAmp * 0.4 * Math.sin(phi * 3 + profile.lobePhaseA);
      }

      v.set(sx * r, sy * r, sz * r);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * A translucent ruffled bell membrane that sits just outside the drifter's
   * solid dome, giving a jellyfish its soft, glassy silhouette and a wavy
   * margin. Built from a deformed hemisphere skirt.
   */
  private buildBellMembrane(profile: RenderProfile): THREE.BufferGeometry {
    const geo = new THREE.SphereGeometry(1.06, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const theta = Math.atan2(v.z, v.x);
      // Ruffle the open margin (low y) so the skirt waves.
      const marginT = clamp(1 - v.y, 0, 1);
      const ruffle = 1 + marginT * 0.08 * Math.sin(theta * (profile.lobeFreqB + 5));
      v.x *= ruffle;
      v.z *= ruffle;
      v.y = v.y * 0.82 - 0.1; // flatten + drop to drape over the body
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Build a tapered ribbon strand (tentacle/arm/tail/fin filament). Two vertices
   * per segment ring form a flat ribbon that we re-deform each frame to undulate.
   * Returns geometry plus the authoring data needed to animate it live.
   */
  private buildStrand(spec: Tendril): {
    geo: THREE.BufferGeometry;
    segs: number;
    basePos: THREE.Vector3;
    dir: THREE.Vector2;
    halfWidths: Float32Array;
    positions: Float32Array;
  } {
    const segs = 14;
    const dirX = Math.cos(spec.base);
    const dirY = Math.sin(spec.base);
    const dir = new THREE.Vector2(dirX, dirY);
    // Root attaches at the body margin in that direction.
    const basePos = new THREE.Vector3(dirX * 0.78, dirY * 0.78, 0);

    const halfWidths = new Float32Array(segs + 1);
    const positions = new Float32Array((segs + 1) * 2 * 3);
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // Taper from base width to a fine point.
      halfWidths[i] = (spec.width * (1 - t * 0.85) + 0.012) * 0.5;
      uvs.push(0, t, 1, t);
      if (i < segs) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    // Initial straight pose; deformStrand fills real positions immediately.
    this.deformStrand({ positions, halfWidths, segs, basePos, dir } as Pick<
      StrandVisual,
      "positions" | "halfWidths" | "segs" | "basePos" | "dir"
    >, spec, 0, 0, 0);
    geo.computeVertexNormals();
    return { geo, segs, basePos, dir, halfWidths, positions };
  }

  /**
   * Re-pose a ribbon strand so it curves and undulates. The strand sweeps out
   * from its root along its outward direction while a travelling sine wave runs
   * down its length (driven by swayPhase) so it trails and reaches organically.
   */
  private deformStrand(
    strand: Pick<StrandVisual, "positions" | "halfWidths" | "segs" | "basePos" | "dir">,
    spec: Tendril,
    swayPhase: number,
    contraction: number,
    flow: number,
  ) {
    const { positions, halfWidths, segs, basePos, dir } = strand;
    // Perpendicular (in-plane) for ribbon width + lateral undulation.
    const perpX = -dir.y;
    const perpY = dir.x;
    let px = basePos.x;
    let py = basePos.y;
    let pz = basePos.z;
    // Step direction starts along the outward dir, then bends with curl + wave.
    let angle = Math.atan2(dir.y, dir.x);
    const stepLen = spec.length / segs;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // Travelling undulation: more motion toward the tip.
      const wave =
        Math.sin(swayPhase * spec.swaySpeed + spec.phase + t * 4.2) *
        spec.swayAmp *
        (0.3 + t * 1.2);
      // Resting curl + contraction draw-up (strands recoil a touch when the
      // body contracts) + the wave bends the heading along the strand.
      angle += spec.curl * 0.16 + wave + flow * 0.02 * (0.4 + t);
      const reach = 1 - contraction * 0.18 * t;
      px += Math.cos(angle) * stepLen * reach;
      py += Math.sin(angle) * stepLen * reach;
      pz += -0.02 * t; // drift slightly behind the body plane
      const hw = halfWidths[i];
      const o = i * 6;
      positions[o + 0] = px + perpX * hw;
      positions[o + 1] = py + perpY * hw;
      positions[o + 2] = pz;
      positions[o + 3] = px - perpX * hw;
      positions[o + 4] = py - perpY * hw;
      positions[o + 5] = pz;
    }
  }

  /** A smooth, undulating side fin built as a tapered ribbon along the body. */
  private buildFinGeometry(span: number, length: number, sign: number) {
    const segs = 16;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // Fin runs from head(+x) to tail(-x); membrane billows out in z.
      const x = (0.5 - t) * length;
      const billow = Math.sin(t * Math.PI) * span * sign;
      positions.push(x, 0, 0, x, 0, billow);
      uvs.push(t, 0, t, 1);
      if (i < segs) {
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

  private createCreature(organism: Organism): CreatureVisual {
    const seed = hashString(organism.idea.id);
    const rng = mulberry32(seed ^ 0x7f4a_129d);
    const profile = organism.profile;
    const group = new THREE.Group();
    const swimTilt = new THREE.Group();
    group.add(swimTilt);

    const baseColor = new THREE.Color(organism.baseColor);
    baseColor.offsetHSL((rng() - 0.5) * 0.12, 0.12 + rng() * 0.16, rng() * 0.06);
    const accentColor = baseColor.clone().offsetHSL(0.08 + rng() * 0.14, 0.12, 0.12);
    const warmColor = new THREE.Color().setHSL(0.09, 0.85, 0.6);

    // Soft contact shadow / silhouette on the back plane.
    const silhouette = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 40),
      new THREE.MeshBasicMaterial({
        color: "#08263b",
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    silhouette.position.z = -0.9;
    silhouette.renderOrder = 0;
    group.add(silhouette);

    // --- Soft-bodied translucent body -------------------------------------
    const bodyGeometry = this.buildBodyGeometry(profile);
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      emissive: baseColor.clone().multiplyScalar(0.18),
      emissiveIntensity: 0.5,
      roughness: 0.34,
      metalness: 0.02,
      clearcoat: 0.6,
      clearcoatRoughness: 0.4,
      transmission: 0.28,
      thickness: 1.1,
      ior: 1.34,
      transparent: true,
      opacity: 0.94,
      depthWrite: true,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.renderOrder = 3;
    body.castShadow = true;
    body.receiveShadow = true;
    swimTilt.add(body);

    // --- Translucent bell membrane for drifters ---------------------------
    let membrane: CreatureVisual["membrane"] = null;
    if (profile.archetype === "drifter") {
      const membraneGeo = this.buildBellMembrane(profile);
      const membraneMat = new THREE.MeshPhysicalMaterial({
        color: baseColor.clone().lerp(new THREE.Color("#dffaff"), 0.4),
        emissive: accentColor.clone().multiplyScalar(0.12),
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0,
        transmission: 0.85,
        thickness: 0.6,
        ior: 1.33,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      membrane = new THREE.Mesh(membraneGeo, membraneMat);
      membrane.renderOrder = 4;
      swimTilt.add(membrane);
    }

    // --- Tendrils / arms / tail as undulating ribbons ---------------------
    const strands: StrandVisual[] = [];
    for (const spec of profile.tendrils) {
      const built = this.buildStrand(spec);
      const strandColor =
        spec.kind === "tail" || spec.kind === "filament"
          ? accentColor.clone().offsetHSL((rng() - 0.5) * 0.05, 0, -0.05)
          : baseColor.clone().lerp(accentColor, 0.4);
      const mat = new THREE.MeshStandardMaterial({
        color: strandColor,
        emissive: strandColor.clone().multiplyScalar(0.16),
        emissiveIntensity: 0.45,
        roughness: 0.5,
        metalness: 0.05,
        transparent: true,
        opacity: spec.kind === "tentacle" || spec.kind === "filament" ? 0.7 : 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(built.geo, mat);
      mesh.renderOrder = spec.kind === "tail" ? 2 : 2;
      swimTilt.add(mesh);
      strands.push({
        mesh,
        spec,
        segs: built.segs,
        basePos: built.basePos,
        dir: built.dir,
        halfWidths: built.halfWidths,
        positions: built.positions,
      });
    }

    // --- Side fins (hunter / swarmer) -------------------------------------
    const fins: CreatureVisual["fins"] = [];
    if (profile.finSpan > 0.01) {
      const finLen = profile.aspect * 1.4;
      for (const sign of [1, -1]) {
        const finMat = new THREE.MeshStandardMaterial({
          color: baseColor.clone().lerp(accentColor, 0.5),
          emissive: accentColor.clone().multiplyScalar(0.1),
          emissiveIntensity: 0.3,
          roughness: 0.45,
          metalness: 0.04,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const fin = new THREE.Mesh(
          this.buildFinGeometry(profile.finSpan, finLen, sign),
          finMat,
        );
        fin.renderOrder = 2;
        swimTilt.add(fin);
        fins.push(fin);
      }
    }

    // --- Internal bioluminescent glow (pockets, eyes, gut) ----------------
    const glows: GlowSprite[] = [];
    const addGlow = (
      x: number,
      y: number,
      z: number,
      r: number,
      warm: boolean,
      bright: number,
    ) => {
      const col = warm
        ? warmColor.clone()
        : accentColor.clone().lerp(new THREE.Color("#aef6ff"), 0.5);
      const mat = new THREE.SpriteMaterial({
        map: this.glowSpriteTexture,
        color: col,
        transparent: true,
        opacity: clamp(bright, 0.1, 0.7),
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      const baseScale = r * 2.6;
      sprite.scale.setScalar(baseScale);
      sprite.renderOrder = 5;
      swimTilt.add(sprite);
      glows.push({ sprite, phase: rng() * Math.PI * 2, baseScale, warm });
    };

    for (const p of profile.pockets) {
      addGlow(p.x, p.y, 0.35, p.r, p.warm, 0.5);
    }
    for (const e of profile.eyes) {
      // Eyes sit toward the head (+x); keep them small and dim.
      addGlow(e.x, e.y, 0.55, e.r * 0.7, false, e.bright * 0.6);
    }
    // A couple of the brightest freckles as faint glow motes (cap for perf).
    const freckleGlows = profile.freckles.slice(0, 4);
    for (const f of freckleGlows) {
      addGlow(f.x, f.y, 0.4, f.r * 3, f.warm, 0.22);
    }
    if (profile.gut > 0.2) {
      addGlow(0, 0, 0.3, 0.32 * profile.gut + 0.12, profile.warmth > 0.5, 0.3);
    }

    // --- Selection aura (NormalBlending ring, only visible on emphasis) ----
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(1.18, 1.5, 48),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    aura.position.z = -0.7;
    aura.renderOrder = 1;
    group.add(aura);

    return {
      group,
      swimTilt,
      silhouette,
      body,
      membrane,
      strands,
      fins,
      glows,
      aura,
      profile,
      baseColor: organism.baseColor,
      phase: rng() * Math.PI * 2,
      zOffset: -20 + rng() * 95,
      archetype: organism.archetype,
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
      isHover ? 0.6 : 0,
      isSelected ? 1 : 0,
      isMerge ? 0.7 : 0,
      isDragged ? 0.9 : 0,
    );

    const t = state.now * 0.001;
    // Bell/muscular contraction drives a gentle squash-and-stretch.
    const contraction = organism.contraction;
    const pulse = 1 + Math.sin(organism.pulsePhase + visual.phase) * 0.05;
    const scale = organism.radius * pulse;
    // Soft internal glow — clamped to a calm ceiling so it never blooms/strobes.
    const brightness = clamp(0.45 + emphasis * 0.45 + organism.resonance * 0.4, 0.4, 1.05);

    if (organism.baseColor !== visual.baseColor) {
      visual.baseColor = organism.baseColor;
      const next = new THREE.Color(organism.baseColor);
      visual.body.material.color.copy(next);
      visual.body.material.emissive.copy(next.clone().multiplyScalar(0.18));
    }

    // World placement: orthographic camera maps 1 world unit → 1 px.
    visual.group.position.set(
      organism.x - this.width / 2,
      this.height / 2 - organism.y + Math.sin(t * 1.3 + visual.phase) * 6,
      visual.zOffset,
    );
    // Face the heading; bank into turns; add a faint drift wobble.
    visual.group.rotation.set(
      Math.sin(t * 0.9 + visual.phase) * 0.1,
      Math.cos(t * 1.0 + visual.phase) * 0.14,
      -organism.heading,
    );
    visual.group.scale.setScalar(scale * (1 + emphasis * 0.16));

    // Body lean: the soft body tilts with the banking turn rate.
    visual.swimTilt.rotation.z = organism.bankLean * 0.32;

    // Squash-and-stretch the body along its axis from the contraction state.
    const stretch = 1 + contraction * 0.12;
    const squash = 1 - contraction * 0.08;
    visual.body.scale.set(stretch, squash, squash);

    visual.silhouette.material.opacity = dimmed ? 0.06 : 0.16 + emphasis * 0.14;
    visual.silhouette.scale.setScalar(1.0 + emphasis * 0.15 + organism.hover * 0.1);

    visual.body.material.emissiveIntensity = brightness;
    visual.body.material.opacity = dimmed ? 0.32 : 0.94;

    if (visual.membrane) {
      visual.membrane.material.opacity = dimmed ? 0.12 : 0.42;
      // Bell pulses: the membrane skirt opens and closes with contraction.
      const open = 1 + contraction * 0.16;
      visual.membrane.scale.set(open, 1 - contraction * 0.1, open);
      visual.membrane.material.emissiveIntensity = 0.3 + emphasis * 0.3;
    }

    // Undulate every strand from the simulation's sway state.
    const flow = organism.bankLean;
    for (const strand of visual.strands) {
      this.deformStrand(strand, strand.spec, organism.swayPhase, contraction, flow);
      const attr = strand.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      attr.needsUpdate = true;
      strand.mesh.geometry.computeVertexNormals();
      const baseOp =
        strand.spec.kind === "tentacle" || strand.spec.kind === "filament" ? 0.7 : 0.86;
      strand.mesh.material.opacity = dimmed ? 0.1 : baseOp;
      strand.mesh.material.emissiveIntensity = 0.4 + emphasis * 0.4;
    }

    // Fins billow gently with the body's contraction cycle.
    for (let i = 0; i < visual.fins.length; i++) {
      const fin = visual.fins[i];
      const wave = Math.sin(organism.swayPhase * 1.4 + visual.phase + i * Math.PI) * 0.18;
      fin.rotation.x = wave;
      fin.material.opacity = dimmed ? 0.1 : 0.46;
    }

    // Internal glow gently flickers (slow, low amplitude — never strobes).
    for (const g of visual.glows) {
      const flick = 0.85 + Math.sin(t * 1.1 + g.phase) * 0.15;
      g.sprite.scale.setScalar(g.baseScale * flick * (1 + emphasis * 0.1));
      const base = g.warm ? 0.5 : 0.42;
      g.sprite.material.opacity = dimmed ? 0.05 : clamp(base * flick + emphasis * 0.15, 0, 0.7);
    }

    visual.aura.material.opacity = dimmed ? 0 : emphasis * 0.4;
    visual.aura.scale.setScalar(1 + emphasis * 0.45 + organism.hover * 0.3);
  }

  private async tryLoadBlenderPlants() {
    try {
      const gltf = await this.gltfLoader.loadAsync("/assets/blender/plants.glb");
      const group = gltf.scene;
      group.position.set(0, -this.height / 2 + FLOOR_HEIGHT * 0.1, -220);
      group.scale.set(76, 76, 76);
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
      if (node instanceof THREE.Sprite) {
        node.material.dispose();
        return;
      }
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

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
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  accent: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  aura: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  orbit: THREE.Group;
  appendages: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  baseColor: string;
  variant: number;
  phase: number;
  zOffset: number;
}

interface PlantVisual {
  group: THREE.Group;
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
  private readonly bubbleMaterial = new THREE.PointsMaterial({
    color: "#e8ffff",
    transparent: true,
    opacity: 0.6,
    size: 5.5,
    sizeAttenuation: false,
    depthWrite: false,
  });
  private readonly bubbles: THREE.Points;
  private readonly bubbleValues = new Float32Array(BUBBLE_COUNT * 3);
  private readonly bubbleStates: BubbleState[] = [];

  private readonly backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.backdrop = this.createBackdrop();
    this.scene.add(this.backdrop);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, FLOOR_HEIGHT),
      new THREE.MeshStandardMaterial({
        color: "#44d986",
        roughness: 0.95,
        metalness: 0.03,
        emissive: "#225f49",
        emissiveIntensity: 0.35,
      }),
    );
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.scene.add(
      this.ambientLight,
      this.hemiLight,
      this.keyLight,
      this.rimLight,
      this.warmLight,
    );
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;

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

    this.layoutPlants();
  }

  render(organisms: Organism[], state: AquariumRenderState) {
    this.backdrop.material.uniforms.uTime.value = state.now * 0.001;

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
    this.backdrop.geometry.dispose();
    this.backdrop.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
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

        vec3 palette(float t) {
          vec3 a = vec3(0.42, 0.88, 1.00);
          vec3 b = vec3(0.64, 1.00, 0.82);
          vec3 c = vec3(1.00, 0.64, 0.86);
          return mix(mix(a, b, smoothstep(0.0, 0.7, t)), c, smoothstep(0.65, 1.0, t));
        }

        void main() {
          vec2 uv = vUv;
          float waveA = sin((uv.x * 10.0) + uTime * 0.8) * 0.04;
          float waveB = sin((uv.x * 17.0) - uTime * 0.6) * 0.02;
          float y = clamp(uv.y + waveA + waveB, 0.0, 1.0);
          vec3 base = palette(1.0 - y);
          float shafts = smoothstep(0.35, 0.0, abs(fract(uv.x * 3.5 + uTime * 0.04) - 0.5));
          float bloom = smoothstep(0.8, 0.2, y) * 0.22;
          vec3 color = base + vec3(0.25, 0.33, 0.4) * shafts * bloom;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthWrite: false,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  }

  private seedPlants() {
    for (let i = 0; i < PLANT_COUNT; i++) {
      const rng = mulberry32(0x91a4_3f + i * 37);
      const group = new THREE.Group();
      const stemMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.3 + rng() * 0.08, 0.65, 0.47),
        emissive: new THREE.Color().setHSL(0.3 + rng() * 0.08, 0.8, 0.24),
        emissiveIntensity: 0.35,
        roughness: 0.75,
        metalness: 0.02,
      });
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 7, 120, 9),
        stemMaterial,
      );
      stem.castShadow = true;
      group.add(stem);

      const leafCount = 3 + Math.floor(rng() * 4);
      for (let leaf = 0; leaf < leafCount; leaf++) {
        const leafMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(36, 14),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.25 + rng() * 0.2, 0.7, 0.52),
            emissive: new THREE.Color().setHSL(0.32 + rng() * 0.12, 0.85, 0.22),
            emissiveIntensity: 0.28,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.86,
            roughness: 0.62,
            metalness: 0,
          }),
        );
        const f = (leaf + 1) / (leafCount + 1);
        leafMesh.position.y = -48 + f * 105;
        leafMesh.position.x = (leaf % 2 === 0 ? 1 : -1) * (16 + rng() * 8);
        leafMesh.rotation.y = leaf % 2 === 0 ? -0.6 : 0.6;
        leafMesh.rotation.z = (leaf % 2 === 0 ? -1 : 1) * (0.3 + rng() * 0.2);
        group.add(leafMesh);
      }

      this.scene.add(group);
      this.plants.push({
        group,
        anchor: i / Math.max(1, PLANT_COUNT - 1),
        heightFactor: 0.7 + rng() * 1.7,
        phase: rng() * Math.PI * 2,
        swayAmplitude: 0.03 + rng() * 0.08,
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
      const y = -this.height / 2 + FLOOR_HEIGHT * 0.46;
      plant.group.position.set(x, y, -110 + (i % 5) * 6);
      const scale = plant.heightFactor * (this.height / 780);
      plant.group.scale.set(1, scale, 1);
    }
  }

  private updatePlants(now: number) {
    const t = now * 0.001;
    for (const plant of this.plants) {
      plant.group.rotation.z =
        Math.sin(t * plant.swaySpeed + plant.phase) * plant.swayAmplitude;
      plant.group.rotation.y =
        Math.cos(t * (plant.swaySpeed * 0.55) + plant.phase) * 0.12;
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

    const bodyGeometry = this.createBodyGeometry(organism.archetype, rng);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor.clone().multiplyScalar(0.32),
      emissiveIntensity: 0.8,
      roughness: 0.33 + rng() * 0.28,
      metalness: 0.06 + rng() * 0.12,
      transparent: true,
      opacity: 0.94,
      flatShading: rng() > 0.6,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
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
    });
    const accent = new THREE.Mesh(this.createAccentGeometry(rng), accentMaterial);
    accent.scale.setScalar(0.85 + rng() * 0.55);
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
      }),
    );
    aura.position.z = -0.55;
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
    const scale = clamp(organism.radius / 20, 0.72, 2.4) * pulse;
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

    visual.body.material.emissiveIntensity = brightness;
    visual.body.material.opacity = dimmed ? 0.22 : 0.94;
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
        return new THREE.SphereGeometry(1, 28, 24);
      case "swarmer":
        return new THREE.OctahedronGeometry(1, 1 + Math.floor(rng() * 2));
      case "floater":
        return new THREE.DodecahedronGeometry(1, 0);
      case "hunter":
        return new THREE.CapsuleGeometry(0.64 + rng() * 0.14, 1.3 + rng() * 0.5, 8, 18);
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
      default: {
        const _never: never = variant;
        return _never;
      }
    }
  }

  private async tryLoadBlenderPlants() {
    try {
      const gltf = await this.gltfLoader.loadAsync("/assets/blender/plants.glb");
      const group = gltf.scene;
      group.position.set(0, -this.height / 2 + FLOOR_HEIGHT * 0.58, -170);
      group.scale.set(95, 95, 95);
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

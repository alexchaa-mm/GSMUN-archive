import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createMintGltfLoader } from './gltf-runtime';

type RegistryArtifact = {
  localPath?: string;
  runtimeUrl?: string;
  role: string;
  format?: string;
  filename?: string;
  extensionsRequired?: string[];
};

type RegistryAsset = {
  artifacts: Record<string, RegistryArtifact>;
  transform?: { position?: number[]; rotation?: number[]; scale?: number[] };
};

type MintRegistry = { registryVersion: number; assetRoot: string; assets: Record<string, RegistryAsset> };

export type MintAnimationSet = {
  root: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
};

type CachedAnimationSet = {
  root: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
};

export class AssetManager {
  private registry: MintRegistry | null = null;
  private readonly modelCache = new Map<string, THREE.Object3D>();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly animationCache = new Map<string, CachedAnimationSet>();

  async initialize(): Promise<void> {
    try {
      const response = await fetch(
        new URL('mint-assets.json', `${window.location.origin}${import.meta.env.BASE_URL}`),
        { cache: 'no-cache' },
      );
      if (response.ok) this.registry = await response.json() as MintRegistry;
    } catch {
      this.registry = null;
    }
  }

  isMintReady(): boolean {
    return !!this.registry
      && [
        'rider-animation',
        'rider-tricks',
        'yeti-animation',
        'alpine-props',
        'snow-park-jumps',
        'music-gameplay',
        'title-art',
      ]
        .every((key) => !!this.registry?.assets[key]);
  }

  getArtifactUrl(key: string, artifactIdOrFilename?: string): string | null {
    const match = this.findArtifact(key, artifactIdOrFilename);
    return match ? this.artifactUrl(match) : null;
  }

  async loadModel(key: string): Promise<THREE.Object3D | null> {
    return this.loadModelArtifact(key);
  }

  async loadModelArtifact(key: string, filenameFragment?: string): Promise<THREE.Object3D | null> {
    const cacheKey = `${key}:${filenameFragment ?? 'canonical'}`;
    const cached = this.modelCache.get(cacheKey);
    if (cached) return cloneSkeleton(cached);
    const asset = this.registry?.assets[key];
    if (!asset) return null;
    const candidates = Object.values(asset.artifacts).filter((entry) => entry.format === 'glb');
    const artifact = filenameFragment
      ? candidates.find((entry) => entry.filename?.toLowerCase().includes(filenameFragment.toLowerCase()))
      : candidates.find((entry) => entry.role === 'canonical_model')
        ?? candidates.find((entry) => entry.role === 'rigged_character')
        ?? candidates[0];
    if (!artifact) return null;
    const gltf = await createMintGltfLoader().loadAsync(this.artifactUrl(artifact));
    const root = gltf.scene;
    this.applyRegistryTransform(root, asset);
    this.modelCache.set(cacheKey, root);
    return cloneSkeleton(root);
  }

  async loadTexture(key: string, artifactIdOrFilename?: string, color = false): Promise<THREE.Texture | null> {
    const cacheKey = `${key}:${artifactIdOrFilename ?? 'image'}`;
    const cached = this.textureCache.get(cacheKey);
    if (cached) return cached;
    const url = this.getArtifactUrl(key, artifactIdOrFilename);
    if (!url) return null;
    const texture = await new THREE.TextureLoader().loadAsync(url);
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  async loadPbrMaterial(key: string, repeatX = 1, repeatY = repeatX): Promise<THREE.MeshStandardMaterial | null> {
    const [map, normalMap, roughnessMap, metalnessMap] = await Promise.all([
      this.loadTexture(key, 'map_basecolor', true),
      this.loadTexture(key, 'map_normal'),
      this.loadTexture(key, 'map_roughness'),
      this.loadTexture(key, 'map_metalness'),
    ]);
    if (!map) return null;
    for (const texture of [map, normalMap, roughnessMap, metalnessMap]) {
      if (!texture) continue;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.needsUpdate = true;
    }
    const material = new THREE.MeshStandardMaterial({
      map,
      normalMap: normalMap ?? undefined,
      roughnessMap: roughnessMap ?? undefined,
      metalnessMap: metalnessMap ?? undefined,
      roughness: 0.88,
      metalness: 0.03,
    });
    material.name = `mint-${key}`;
    return material;
  }

  async loadAnimationSet(key: string): Promise<MintAnimationSet | null> {
    const cached = this.animationCache.get(key);
    if (cached) return { root: cloneSkeleton(cached.root), clips: this.cloneClips(cached.clips) };
    const asset = this.registry?.assets[key];
    if (!asset) return null;
    const artifacts = Object.values(asset.artifacts);
    const rigged = artifacts.find((entry) => entry.role === 'rigged_character' && entry.format === 'glb');
    const clipArtifacts = artifacts.filter((entry) => entry.role === 'animation_clip' && entry.format === 'glb');
    if (!rigged || clipArtifacts.length === 0) return null;

    const loader = createMintGltfLoader();
    const [riggedGltf, ...clipGltfs] = await Promise.all([
      loader.loadAsync(this.artifactUrl(rigged)),
      ...clipArtifacts.map((artifact) => loader.loadAsync(this.artifactUrl(artifact))),
    ]);
    const clips = new Map<string, THREE.AnimationClip>();
    clipArtifacts.forEach((artifact, index) => {
      const gltf = clipGltfs[index];
      const clip = gltf.animations[0];
      if (!clip) return;
      const label = (artifact.filename ?? clip.name).replace(/\.[^.]+$/, '').toLowerCase();
      clip.name = label;
      this.stripRootMotion(clip);
      clips.set(label, clip);
      this.disposeObject(gltf.scene);
    });
    this.applyRegistryTransform(riggedGltf.scene, asset);
    this.animationCache.set(key, { root: riggedGltf.scene, clips });
    return { root: cloneSkeleton(riggedGltf.scene), clips: this.cloneClips(clips) };
  }

  async loadAnimationClips(key: string): Promise<Map<string, THREE.AnimationClip>> {
    const asset = this.registry?.assets[key];
    if (!asset) return new Map();
    const artifacts = Object.values(asset.artifacts)
      .filter((entry) => entry.role === 'animation_clip' && entry.format === 'glb');
    const loader = createMintGltfLoader();
    const gltfs = await Promise.all(
      artifacts.map((artifact) => loader.loadAsync(this.artifactUrl(artifact))),
    );
    const clips = new Map<string, THREE.AnimationClip>();
    artifacts.forEach((artifact, index) => {
      const gltf = gltfs[index];
      const clip = gltf.animations[0];
      if (!clip) return;
      const label = (artifact.filename ?? clip.name).replace(/\.[^.]+$/, '').toLowerCase();
      clip.name = label;
      this.stripRootMotion(clip);
      clips.set(label, clip);
      this.disposeObject(gltf.scene);
    });
    return clips;
  }

  dispose(): void {
    this.modelCache.forEach((root) => this.disposeObject(root));
    this.animationCache.forEach((set) => this.disposeObject(set.root));
    this.textureCache.forEach((texture) => texture.dispose());
    this.modelCache.clear();
    this.animationCache.clear();
    this.textureCache.clear();
  }

  private findArtifact(key: string, artifactIdOrFilename?: string): RegistryArtifact | null {
    const asset = this.registry?.assets[key];
    if (!asset) return null;
    if (artifactIdOrFilename && asset.artifacts[artifactIdOrFilename]) return asset.artifacts[artifactIdOrFilename];
    const artifacts = Object.values(asset.artifacts);
    if (artifactIdOrFilename) {
      const fragment = artifactIdOrFilename.toLowerCase();
      const match = artifacts.find((entry) => entry.filename?.toLowerCase().includes(fragment));
      if (match) return match;
    }
    return artifacts.find((entry) => entry.role === 'image' || entry.role === 'audio' || entry.role === 'material_map')
      ?? artifacts[0]
      ?? null;
  }

  private artifactUrl(artifact: RegistryArtifact): string {
    if (artifact.runtimeUrl) return artifact.runtimeUrl;
    if (artifact.localPath) {
      return new URL(
        artifact.localPath.replace(/^public\//, ''),
        `${window.location.origin}${import.meta.env.BASE_URL}`,
      ).href;
    }
    throw new Error('Mint registry artifact has no runtime URL.');
  }

  private applyRegistryTransform(root: THREE.Object3D, asset: RegistryAsset): void {
    const transform = asset.transform;
    if (transform?.position?.length === 3) root.position.fromArray(transform.position);
    if (transform?.rotation?.length === 3) root.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2], 'XYZ');
    if (transform?.scale?.length === 3) root.scale.fromArray(transform.scale);
  }

  private cloneClips(source: Map<string, THREE.AnimationClip>): Map<string, THREE.AnimationClip> {
    return new Map([...source].map(([name, clip]) => [name, clip.clone()]));
  }

  private stripRootMotion(clip: THREE.AnimationClip): void {
    for (const track of clip.tracks) {
      const property = track.name.toLowerCase();
      if (!property.endsWith('.position') || !(property.includes('hips') || property.includes('armature'))) continue;
      const values = track.values;
      const stride = track.getValueSize();
      if (stride < 3 || values.length < stride) continue;
      const x = values[0];
      const y = values[1];
      const z = values[2];
      for (let index = 0; index < values.length; index += stride) {
        values[index] = x;
        values[index + 1] = y;
        values[index + 2] = z;
      }
    }
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }
}

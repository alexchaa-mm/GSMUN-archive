import registryJson from "../../mint-assets.json";
import type { AnimationClipJSON } from "three";

// Thin, typed adapter over the package-owned Mint registry. Runtime code loads
// generated models only from the verified Mint CDN URLs recorded there. The
// compact clip JSON files are authored, app-specific keyframe transforms of
// the source animation batches and remain inside the portable capsule.

export interface ArtifactRecord {
  artifactId: string;
  role: string;
  format: string;
  contentType: string;
  runtimeUrl: string;
  loaderHint: string;
  byteSize?: number;
  usesDraco?: boolean;
  requiresDraco?: boolean;
  requiresMeshopt?: boolean;
  requiresKtx2?: boolean;
  unknownRequiredExtensions?: string[];
}

export interface AssetRecord {
  source: { assetType: string; assetId: string };
  mode: string;
  artifacts: Record<string, ArtifactRecord>;
}

interface Registry {
  assets: Record<string, AssetRecord>;
}

const registry = registryJson as unknown as Registry;
const clipBundleLoaders: Record<
  string,
  () => Promise<Record<string, AnimationClipJSON>>
> = {
  dk: async () =>
    (await import("../runtime-animation/dk.json")).default as unknown as Record<
      string,
      AnimationClipJSON
    >,
  mario: async () =>
    (await import("../runtime-animation/mario.json")).default as unknown as Record<
      string,
      AnimationClipJSON
    >,
  samus: async () =>
    (await import("../runtime-animation/samus.json")).default as unknown as Record<
      string,
      AnimationClipJSON
    >,
};

export function hasAsset(key: string): boolean {
  return Boolean(registry.assets[key]);
}

export function getAsset(key: string): AssetRecord {
  const asset = registry.assets[key];
  if (!asset) throw new Error(`Mint asset "${key}" is not registered in mint-assets.json`);
  return asset;
}

/** Browser URL for the canonical model GLB of a model asset, or null if absent. */
export function getModelUrl(key: string): string | null {
  if (!hasAsset(key)) return null;
  const asset = getAsset(key);
  const model =
    Object.values(asset.artifacts).find((artifact) => artifact.role === "canonical_model") ??
    Object.values(asset.artifacts).find((artifact) => artifact.loaderHint === "gltf");
  return model?.runtimeUrl ?? null;
}

/** Browser URL for the rigged character GLB of an animation source. */
export function getRiggedModelUrl(key: string): string | null {
  if (!hasAsset(key)) return null;
  const rigged = Object.values(getAsset(key).artifacts).find(
    (artifact) => artifact.role === "rigged_character" && artifact.format === "glb",
  );
  return rigged?.runtimeUrl ?? null;
}

export async function getClipBundle(
  key: string,
): Promise<Record<string, AnimationClipJSON>> {
  const load = clipBundleLoaders[key];
  if (!load) throw new Error(`No animation clip bundle registered for "${key}"`);
  return await load();
}

/** Assert runtime decode requirements are satisfiable before load. */
export function assertLoadable(key: string): void {
  const asset = getAsset(key);
  for (const artifact of Object.values(asset.artifacts)) {
    if (artifact.unknownRequiredExtensions?.length) {
      throw new Error(
        `Asset "${key}" needs unsupported glTF extensions: ${artifact.unknownRequiredExtensions.join(", ")}`,
      );
    }
    if (artifact.requiresMeshopt) {
      throw new Error(`Asset "${key}" requires a Meshopt decoder that is not configured.`);
    }
    if (artifact.requiresKtx2) {
      throw new Error(`Asset "${key}" requires a KTX2 loader that is not configured.`);
    }
  }
}

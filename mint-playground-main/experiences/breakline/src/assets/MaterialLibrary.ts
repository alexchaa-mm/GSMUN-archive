import * as THREE from 'three';

export const MINT_ALPINE = {
  mint: '#43f2c2',
  aqua: '#28d9d2',
  ice: '#e4fcff',
  ink: '#08252b',
  citrus: '#c7ff55',
  danger: '#ff536b',
  steel: '#17444a',
} as const;

export type MintMaterialRole = 'rider' | 'board' | 'rail' | 'box' | 'marker';

const ROLE_TINTS: Record<MintMaterialRole, { color: string; strength: number; roughness?: number; metalness?: number }> = {
  rider: { color: MINT_ALPINE.mint, strength: 0.2 },
  board: { color: MINT_ALPINE.aqua, strength: 0.48, roughness: 0.38, metalness: 0.18 },
  rail: { color: MINT_ALPINE.mint, strength: 0.62, roughness: 0.32, metalness: 0.58 },
  box: { color: MINT_ALPINE.aqua, strength: 0.56, roughness: 0.42, metalness: 0.38 },
  marker: { color: MINT_ALPINE.citrus, strength: 0.5, roughness: 0.55, metalness: 0.08 },
};

export function applyMintMaterialRole(root: THREE.Object3D, role: MintMaterialRole): void {
  const tint = ROLE_TINTS[role];
  const color = new THREE.Color(tint.color);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const materials = source.map((material) => {
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) {
        clone.color.lerp(color, tint.strength);
        if (tint.roughness !== undefined) clone.roughness = tint.roughness;
        if (tint.metalness !== undefined) clone.metalness = tint.metalness;
        clone.needsUpdate = true;
      }
      return clone;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
}

export function createParkMaterial(role: 'rail' | 'box' | 'marker' | 'support' | 'jump'): THREE.MeshStandardMaterial {
  const settings = {
    rail: { color: MINT_ALPINE.mint, roughness: 0.26, metalness: 0.68 },
    box: { color: MINT_ALPINE.aqua, roughness: 0.38, metalness: 0.42 },
    marker: { color: MINT_ALPINE.citrus, roughness: 0.48, metalness: 0.06 },
    support: { color: MINT_ALPINE.steel, roughness: 0.54, metalness: 0.5 },
    jump: { color: '#72e6cb', roughness: 0.72, metalness: 0.02 },
  }[role];
  const material = new THREE.MeshStandardMaterial(settings);
  material.name = `mint-alpine-${role}`;
  return material;
}

export function applySharedMaterial(root: THREE.Object3D, material: THREE.Material): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.material = material;
  });
}

import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createMintGltfLoader } from "../assets/gltf-runtime";
import { getClipBundle, getRiggedModelUrl } from "../assets/registry";
import type { AnimRole, SkeletalAnimation } from "../config/characters";

// Skeletal animation for characters that have a rig. Kirby is animated
// procedurally (squash/stretch, no skeleton); this is the other path.
//
// Clips come from compact app-specific JSON transforms rather than downloading
// full animation GLBs that each repeat the mesh. The rigged mesh is fetched
// once from Mint CDN and cloned per fighter with SkeletonUtils so two players
// can pick the same character without sharing a skeleton.

const loader = createMintGltfLoader();

const _q = new THREE.Quaternion();

function hipsQuatTrack(clip: THREE.AnimationClip): THREE.KeyframeTrack | undefined {
  return clip.tracks.find(
    (t) => /quaternion$/i.test(t.name) && /hips|pelvis|root/i.test(t.name),
  );
}

/**
 * Mint retargets each animation from its own source, so every clip bakes a
 * different resting orientation into the root (Hips) bone — the run clip in
 * particular comes in facing ~180° from idle. Left alone the character spins to
 * face a new direction every time the state machine swaps clips (the "running
 * backwards" bug). A yaw-only correction is unreliable here: a ~180° flip is
 * ambiguous under Euler decomposition. Instead, rotate each clip's whole Hips
 * track by the exact quaternion that maps its first frame onto the idle clip's
 * first frame, so every animation starts from one shared facing. The in-clip
 * motion (the delta from frame 0) is preserved, and the character's `modelYaw`
 * then points that shared facing at the camera.
 */
function normalizeFacingToIdle(byRole: Map<AnimRole, THREE.AnimationClip>): void {
  const idle = byRole.get("idle");
  const idleTrack = idle && hipsQuatTrack(idle);
  if (!idleTrack) return;
  const ref = new THREE.Quaternion(
    idleTrack.values[0],
    idleTrack.values[1],
    idleTrack.values[2],
    idleTrack.values[3],
  );
  const correction = new THREE.Quaternion();
  const q0 = new THREE.Quaternion();
  // A clip may fill several roles; dedupe so each is corrected exactly once.
  for (const clip of new Set(byRole.values())) {
    const ud = clip.userData as { __facingFixed?: boolean };
    if (ud.__facingFixed) continue;
    ud.__facingFixed = true;
    const track = hipsQuatTrack(clip);
    if (!track) continue;
    const v = track.values;
    if (v.length < 4) continue;
    q0.set(v[0], v[1], v[2], v[3]);
    // correction * q0 = ref  =>  correction = ref * q0⁻¹
    correction.copy(ref).multiply(q0.invert());
    for (let i = 0; i < v.length; i += 4) {
      _q.set(v[i], v[i + 1], v[i + 2], v[i + 3]);
      _q.premultiply(correction);
      v[i] = _q.x;
      v[i + 1] = _q.y;
      v[i + 2] = _q.z;
      v[i + 3] = _q.w;
    }
  }
}

interface LoadedRig {
  source: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
}

const rigCache = new Map<string, Promise<LoadedRig>>();

function loadRig(assetKey: string): Promise<LoadedRig> {
  const cached = rigCache.get(assetKey);
  if (cached) return cached;

  const pending = (async (): Promise<LoadedRig> => {
    const modelUrl = getRiggedModelUrl(assetKey);
    if (!modelUrl) throw new Error(`No rigged model registered for "${assetKey}"`);

    const [gltf, clipJson] = await Promise.all([
      loader.loadAsync(modelUrl),
      getClipBundle(assetKey),
    ]);

    const source = gltf.scene;
    source.traverse((o) => {
      // Skinned bounds are computed from the bind pose, so culling would pop
      // limbs out mid-swing.
      o.frustumCulled = false;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });

    const clips = new Map<string, THREE.AnimationClip>();
    for (const [clipId, json] of Object.entries(clipJson)) {
      const clip = THREE.AnimationClip.parse(json);
      // AnimationClip.parse leaves uuid undefined here, and AnimationMixer caches
      // actions by clip.uuid — so without a distinct id every role collides onto
      // the first-cached action (idle) and no attack/locomotion clip ever plays.
      // The Mint clipId is already unique per clip, so use it as the uuid.
      // (uuid is typed readonly, but assigning it here is exactly the intent.)
      (clip as { uuid: string }).uuid = clipId;
      clips.set(clipId, clip);
    }
    return { source, clips };
  })();

  rigCache.set(assetKey, pending);
  return pending;
}

export class CharacterAnimator {
  readonly root: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private byRole = new Map<AnimRole, THREE.AnimationClip>();
  private action: THREE.AnimationAction | null = null;
  private currentRole: AnimRole | null = null;

  private constructor(root: THREE.Object3D, byRole: Map<AnimRole, THREE.AnimationClip>) {
    this.root = root;
    this.byRole = byRole;
    this.mixer = new THREE.AnimationMixer(root);
  }

  static async create(def: SkeletalAnimation): Promise<CharacterAnimator> {
    const rig = await loadRig(def.assetKey);
    const root = cloneSkeleton(rig.source);
    const byRole = new Map<AnimRole, THREE.AnimationClip>();
    for (const [role, clipId] of Object.entries(def.clips)) {
      const clip = rig.clips.get(clipId as string);
      if (clip) byRole.set(role as AnimRole, clip);
      else console.warn(`clip "${clipId}" for role "${role}" missing from clips.json`);
    }
    normalizeFacingToIdle(byRole); // one shared facing so nobody runs backwards
    return new CharacterAnimator(root, byRole);
  }

  /**
   * Drive the rig to `role`. Looping roles (locomotion) cross-fade; one-shot
   * roles (attacks) are time-scaled to finish in exactly `seconds`, so the
   * motion always lines up with the move's frame data no matter how long the
   * source clip happens to be.
   */
  play(
    role: AnimRole,
    opts: {
      loop?: boolean;
      seconds?: number;
      fade?: number;
      restart?: boolean;
      /** Playback rate for a looping clip; lets a walk cycle track real speed. */
      rate?: number;
    } = {},
  ) {
    const clip = this.byRole.get(role) ?? this.byRole.get("idle");
    if (!clip) return;
    // "seconds" means "make one play of the clip take this long" (used for both
    // one-shot attacks and to set a locomotion cadence); "rate" is a direct
    // multiplier. seconds wins when given.
    const timeScale =
      opts.seconds && opts.seconds > 0 ? clip.duration / opts.seconds : (opts.rate ?? 1);

    // Re-triggering the same one-shot (jab, jab) has to replay it, so callers
    // can force a restart even when the role has not changed.
    if (role === this.currentRole && !opts.restart) {
      // A continuing loop can still be re-timed as the fighter speeds up.
      if (this.action) this.action.setEffectiveTimeScale(timeScale);
      return;
    }
    this.currentRole = role;

    const prev = this.action;
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.enabled = true;
    if (opts.loop === false) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.setEffectiveTimeScale(timeScale);
    next.setEffectiveWeight(1);
    next.play();

    // Fade the outgoing action out explicitly rather than crossFadeFrom: a
    // LoopOnce action that has already clamped still sits at full weight, and
    // fading in over the top of it leaves both poses fighting — which reads as
    // the character barely moving at all.
    const fade = opts.fade ?? 0.12;
    if (prev && prev !== next) {
      prev.fadeOut(fade);
      next.fadeIn(fade);
    }
    this.action = next;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.parent?.remove(this.root);
  }
}

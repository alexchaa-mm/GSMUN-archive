import * as THREE from 'three';
import type { InputDevice } from '../game/types';

type Action = 'jump' | 'tuck' | 'spinLeft' | 'spinRight' | 'frontFlip' | 'backFlip' | 'frontGrab' | 'backGrab' | 'grind' | 'special' | 'noseButter' | 'tailButter' | 'reset' | 'pause' | 'debug';

const ACTION_KEYS: Record<Action, string[]> = {
  jump: ['Space'], tuck: ['ShiftLeft', 'ShiftRight'], spinLeft: ['KeyQ'], spinRight: ['KeyE'],
  frontFlip: ['KeyZ'], backFlip: ['KeyX'], frontGrab: ['KeyG'], backGrab: ['KeyH'],
  grind: ['KeyJ'], special: ['KeyF'], noseButter: ['KeyW'], tailButter: ['KeyS'],
  reset: ['KeyR'], pause: ['Escape'], debug: ['F3'],
};

export class InputManager {
  readonly cameraLook = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private readonly pressedKeys = new Set<string>();
  private readonly releasedKeys = new Set<string>();
  private readonly touchActions = new Set<string>();
  private readonly pressedTouch = new Set<string>();
  private readonly releasedTouch = new Set<string>();
  private touchSteer = 0;
  private pointerId: number | null = null;
  private pointerCenter = 0;
  private pointerRadius = 1;
  private mouseLocked = false;
  private gamepadButtons: boolean[] = [];
  private previousGamepadButtons: boolean[] = [];
  private readonly pressedGamepad = new Set<number>();
  private readonly releasedGamepad = new Set<number>();
  private gamepadAxes = [0, 0, 0, 0];
  private device: InputDevice = 'keyboard';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly touchButtons: NodeListOf<HTMLButtonElement>,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('pointerlockchange', this.onPointerLock);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    stick.addEventListener('pointerdown', this.onStickDown);
    stick.addEventListener('pointermove', this.onStickMove);
    stick.addEventListener('pointerup', this.onStickUp);
    stick.addEventListener('pointercancel', this.onStickUp);
    stick.addEventListener('lostpointercapture', this.onStickUp);
    touchButtons.forEach((button) => {
      button.addEventListener('pointerdown', this.onTouchActionDown);
      button.addEventListener('pointerup', this.onTouchActionUp);
      button.addEventListener('pointercancel', this.onTouchActionUp);
      button.addEventListener('lostpointercapture', this.onTouchActionUp);
    });
  }

  beginFrame(): void {
    this.previousGamepadButtons = this.gamepadButtons.slice();
    this.pollGamepad();
    this.cameraLook.multiplyScalar(0.84);
  }

  endFrame(): void {
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.pressedTouch.clear();
    this.releasedTouch.clear();
    this.pressedGamepad.clear();
    this.releasedGamepad.clear();
  }

  get activeDevice(): InputDevice { return this.device; }

  steer(): number {
    let value = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) value -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) value += 1;
    if (Math.abs(this.gamepadAxes[0] ?? 0) > 0.12) value = this.gamepadAxes[0];
    if (Math.abs(this.touchSteer) > Math.abs(value)) value = this.touchSteer;
    return THREE.MathUtils.clamp(value, -1, 1);
  }

  spinIntent(): number {
    const keyboard = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
    if (keyboard !== 0) return keyboard;
    const gamepad = this.gamepadAxes[0] ?? 0;
    return Math.abs(gamepad) >= 0.55 ? THREE.MathUtils.clamp(gamepad, -1, 1) : 0;
  }

  held(action: Action): boolean {
    if (this.touchActions.has(action)) return true;
    if (action === 'frontGrab' && this.touchActions.has('grab')) return true;
    if (ACTION_KEYS[action].some((key) => this.keys.has(key))) return true;
    const b = this.gamepadButtons;
    switch (action) {
      case 'jump': return !!b[0];
      case 'frontFlip': return !!b[2];
      case 'backFlip': return !!b[1];
      case 'grind': return !!b[3];
      case 'frontGrab': return !!b[4];
      case 'backGrab': return !!b[5];
      case 'tuck': return (b[7] ?? false) || (this.gamepadAxes[3] ?? 0) > 0.55;
      case 'special': return !!b[10];
      case 'noseButter': return !!b[12];
      case 'tailButter': return !!b[13];
      default: return false;
    }
  }

  pressed(action: Action): boolean {
    const keyPressed = ACTION_KEYS[action].some((key) => this.pressedKeys.has(key));
    const touchPressed = this.pressedTouch.has(action) || (action === 'frontGrab' && this.pressedTouch.has('grab'));
    const index = this.gamepadIndex(action);
    const padPressed = index >= 0 && this.pressedGamepad.has(index);
    return keyPressed || touchPressed || padPressed;
  }

  released(action: Action): boolean {
    const keyReleased = ACTION_KEYS[action].some((key) => this.releasedKeys.has(key));
    const touchReleased = this.releasedTouch.has(action) || (action === 'frontGrab' && this.releasedTouch.has('grab'));
    const index = this.gamepadIndex(action);
    const padReleased = index >= 0 && this.releasedGamepad.has(index);
    return keyReleased || touchReleased || padReleased;
  }

  setTestKey(code: string, held: boolean): void {
    if (held) {
      if (!this.keys.has(code)) this.pressedKeys.add(code);
      this.keys.add(code);
      this.device = 'keyboard';
      return;
    }
    if (this.keys.delete(code)) this.releasedKeys.add(code);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('pointerlockchange', this.onPointerLock);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    this.stick.removeEventListener('pointerdown', this.onStickDown);
    this.stick.removeEventListener('pointermove', this.onStickMove);
    this.stick.removeEventListener('pointerup', this.onStickUp);
    this.stick.removeEventListener('pointercancel', this.onStickUp);
    this.stick.removeEventListener('lostpointercapture', this.onStickUp);
    this.touchButtons.forEach((button) => {
      button.removeEventListener('pointerdown', this.onTouchActionDown);
      button.removeEventListener('pointerup', this.onTouchActionUp);
      button.removeEventListener('pointercancel', this.onTouchActionUp);
      button.removeEventListener('lostpointercapture', this.onTouchActionUp);
    });
  }

  private pollGamepad(): void {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
    if (!pad) { this.gamepadButtons = []; return; }
    this.gamepadButtons = pad.buttons.map((button) => button.pressed || button.value > 0.55);
    this.gamepadButtons.forEach((pressed, index) => {
      if (pressed && !this.previousGamepadButtons[index]) this.pressedGamepad.add(index);
      if (!pressed && this.previousGamepadButtons[index]) this.releasedGamepad.add(index);
    });
    this.gamepadAxes = pad.axes.map((value) => Math.abs(value) < 0.1 ? 0 : value);
    const active = this.gamepadButtons.some(Boolean) || this.gamepadAxes.some((value) => Math.abs(value) > 0.15);
    if (active) this.device = 'gamepad';
    this.cameraLook.x += (this.gamepadAxes[2] ?? 0) * 0.035;
    this.cameraLook.y += (this.gamepadAxes[3] ?? 0) * 0.025;
  }

  private gamepadIndex(action: Action): number {
    return ({ jump: 0, backFlip: 1, frontFlip: 2, grind: 3, frontGrab: 4, backGrab: 5, special: 10, noseButter: 12, tailButter: 13, pause: 9 } as Partial<Record<Action, number>>)[action] ?? -1;
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
    if (!this.keys.has(event.code)) this.pressedKeys.add(event.code);
    this.keys.add(event.code);
    this.device = 'keyboard';
  };
  private readonly onKeyUp = (event: KeyboardEvent) => { if (this.keys.delete(event.code)) this.releasedKeys.add(event.code); };
  private readonly onBlur = () => { this.keys.clear(); this.touchActions.clear(); this.pressedKeys.clear(); this.releasedKeys.clear(); this.touchSteer = 0; };
  private readonly onVisibility = () => { if (document.hidden) this.onBlur(); };
  private readonly onPointerLock = () => { this.mouseLocked = document.pointerLockElement === this.canvas; };
  private readonly onCanvasPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') void this.canvas.requestPointerLock?.();
  };
  private readonly onMouseMove = (event: MouseEvent) => {
    if (!this.mouseLocked) return;
    this.cameraLook.x = THREE.MathUtils.clamp(this.cameraLook.x + event.movementX * 0.0018, -0.9, 0.9);
    this.cameraLook.y = THREE.MathUtils.clamp(this.cameraLook.y + event.movementY * 0.0014, -0.45, 0.5);
  };
  private readonly onStickDown = (event: PointerEvent) => {
    event.preventDefault(); this.device = 'touch'; this.pointerId = event.pointerId;
    const rect = this.stick.getBoundingClientRect(); this.pointerCenter = rect.left + rect.width / 2; this.pointerRadius = rect.width * 0.43;
    this.stick.setPointerCapture(event.pointerId); this.updateStick(event.clientX);
  };
  private readonly onStickMove = (event: PointerEvent) => { if (event.pointerId === this.pointerId) this.updateStick(event.clientX); };
  private readonly onStickUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return; this.pointerId = null; this.touchSteer = 0; this.knob.style.transform = 'translate(-50%, -50%)';
  };
  private updateStick(clientX: number): void {
    this.touchSteer = THREE.MathUtils.clamp((clientX - this.pointerCenter) / this.pointerRadius, -1, 1);
    this.knob.style.transform = `translate(calc(-50% + ${this.touchSteer * 36}px), -50%)`;
  }
  private readonly onTouchActionDown = (event: PointerEvent) => {
    event.preventDefault(); const button = event.currentTarget as HTMLButtonElement; const action = button.dataset.action;
    if (!action) return; this.device = 'touch'; if (!this.touchActions.has(action)) this.pressedTouch.add(action); this.touchActions.add(action); button.classList.add('active'); button.setPointerCapture(event.pointerId);
  };
  private readonly onTouchActionUp = (event: PointerEvent) => {
    const button = event.currentTarget as HTMLButtonElement; const action = button.dataset.action;
    if (action && this.touchActions.delete(action)) this.releasedTouch.add(action); button.classList.remove('active');
  };
}

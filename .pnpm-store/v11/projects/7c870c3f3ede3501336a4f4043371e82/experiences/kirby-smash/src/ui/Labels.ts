import * as THREE from "three";
import type { Fighter } from "../game/Fighter";

// Floating "P1"/"P2" tags above each fighter. The number is a digital
// seven-segment display, colour-coded per player, projected from the fighter's
// head position each frame.

const COLORS: Record<number, string> = { 1: "#ff7bbf", 2: "#66b3ff" };

// Which of the 7 segments (a,b,c,d,e,f,g) light up for each digit.
const SEGMENTS: Record<number, string[]> = {
  1: ["b", "c"],
  2: ["a", "b", "g", "e", "d"],
};

export class Labels {
  private layer: HTMLElement;
  private tags: Record<number, HTMLElement> = {};
  private tmp = new THREE.Vector3();

  constructor() {
    this.layer = document.createElement("div");
    this.layer.className = "label-layer";
    document.body.appendChild(this.layer);
  }

  register(playerId: number) {
    const tag = document.createElement("div");
    tag.className = "p-tag";
    tag.style.setProperty("--pc", COLORS[playerId]);
    tag.innerHTML = `<span class="p-letter">P</span>${sevenSeg(playerId)}`;
    this.layer.appendChild(tag);
    this.tags[playerId] = tag;
  }

  update(camera: THREE.Camera, fighters: Fighter[], canvas: HTMLCanvasElement) {
    const halfW = canvas.clientWidth / 2;
    const halfH = canvas.clientHeight / 2;
    for (const f of fighters) {
      const tag = this.tags[f.playerId];
      if (!tag) continue;
      if (f.state === "dead") {
        tag.style.display = "none";
        continue;
      }
      this.tmp.set(f.x, f.y + 1.75, 0);
      this.tmp.project(camera);
      if (this.tmp.z > 1) {
        tag.style.display = "none";
        continue;
      }
      const sx = this.tmp.x * halfW + halfW;
      const sy = -this.tmp.y * halfH + halfH;
      tag.style.display = "flex";
      tag.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`;
    }
  }
}

function sevenSeg(digit: number): string {
  const on = new Set(SEGMENTS[digit] ?? []);
  const seg = (id: string) => `<i class="seg seg-${id}${on.has(id) ? " on" : ""}"></i>`;
  return `<span class="seg7">${["a", "b", "c", "d", "e", "f", "g"].map(seg).join("")}</span>`;
}

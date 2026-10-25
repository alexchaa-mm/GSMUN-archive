export type BookPose = {
  x: number;
  z: number;
  turn: number;
  roll: number;
  scale: number;
};

export type BookFootprint = BookPose & {
  id: string;
  y: number;
  width: number;
  height: number;
  thickness: number;
};

export type MotionBookSize = {
  width: number;
  height: number;
  thickness: number;
};

export type MotionLayout = {
  shelvedZ: number;
  presentedZ: number;
  rotationLaneZ: number;
  presentedScale: number;
  collisionMargin: number;
};

export type BrowseMotionPhase =
  | "retreat-current"
  | "turn-current"
  | "shelve-current"
  | "extract-next"
  | "turn-next"
  | "settle-next";

// The procedural geometry stays in its original local basis: X is cover width,
// Y is book height, and Z is thickness. The shelved -90 degree roll makes the
// long Y dimension run along world X. `turn` rotates around world X: at 90
// degrees the book lies flat with its spine toward +Z; at zero its cover faces
// +Z. Once front-facing, `roll` returns to zero so the presented cover is
// upright without changing which face points toward the camera.
export const horizontalBookRoll = -Math.PI / 2;
export const uprightCoverRoll = 0;
export const shelvedTurn = Math.PI / 2;
export const presentedTurn = 0;
export const verticalShelfGap = 0.16;

const shelvedZ = -0.64;
const presentedZ = 0.4;
const presentedScale = 1.035;
const maximumFocusScale = 1.08;
const collisionMargin = 0.035;

export const browsePhaseDuration: Record<BrowseMotionPhase, number> = {
  "retreat-current": 0.11,
  "turn-current": 0.14,
  "shelve-current": 0.13,
  "extract-next": 0.13,
  "turn-next": 0.14,
  "settle-next": 0.11,
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

export function createMotionLayout(books: MotionBookSize[]): MotionLayout {
  const maxShelvedHalfDepth = books.reduce(
    (maximum, book) => Math.max(maximum, book.width * 0.5),
    0,
  );

  const maxRotationRadius = books.reduce(
    (maximum, book) =>
      Math.max(
        maximum,
        Math.hypot(book.width, book.thickness) *
          0.5 *
          maximumFocusScale,
      ),
    0,
  );

  return {
    shelvedZ,
    presentedZ,
    rotationLaneZ:
      shelvedZ +
      maxShelvedHalfDepth +
      maxRotationRadius +
      collisionMargin,
    presentedScale,
    collisionMargin,
  };
}

export function createVerticalSlotPositions(
  books: MotionBookSize[],
  gap = verticalShelfGap,
) {
  const positions: number[] = [];
  let y = 0;

  books.forEach((book, index) => {
    if (index > 0) {
      const previous = books[index - 1];
      y -= previous.thickness * 0.5 + gap + book.thickness * 0.5;
    }
    positions.push(y);
  });

  return positions;
}

export function shelvedBookPose(layout: MotionLayout): BookPose {
  return {
    x: 0,
    z: layout.shelvedZ,
    turn: shelvedTurn,
    roll: horizontalBookRoll,
    scale: 1,
  };
}

export function presentedBookPose(layout: MotionLayout): BookPose {
  return {
    x: 0,
    z: layout.presentedZ,
    turn: presentedTurn,
    roll: uprightCoverRoll,
    scale: layout.presentedScale,
  };
}

export function focusedBookPose(
  progress: number,
  layout: MotionLayout,
  focusX: number,
  focusZ: number,
  focusScale: number,
): BookPose {
  const t = smooth(progress);

  return {
    x: lerp(0, focusX, t),
    z: lerp(layout.presentedZ, focusZ, t),
    turn: presentedTurn,
    roll: uprightCoverRoll,
    scale: lerp(layout.presentedScale, focusScale, t),
  };
}

export function browseMotionPose(
  phase: BrowseMotionPhase,
  progress: number,
  layout: MotionLayout,
): BookPose {
  const t = smooth(progress);

  switch (phase) {
    case "retreat-current":
      return {
        x: 0,
        z: lerp(layout.presentedZ, layout.rotationLaneZ, t),
        turn: presentedTurn,
        roll: lerp(uprightCoverRoll, horizontalBookRoll, t),
        scale: lerp(layout.presentedScale, 1, t),
      };

    case "turn-current":
      return {
        x: 0,
        z: layout.rotationLaneZ,
        turn: lerp(presentedTurn, shelvedTurn, t),
        roll: horizontalBookRoll,
        scale: 1,
      };

    case "shelve-current":
      return {
        x: 0,
        z: lerp(layout.rotationLaneZ, layout.shelvedZ, t),
        turn: shelvedTurn,
        roll: horizontalBookRoll,
        scale: 1,
      };

    case "extract-next":
      return {
        x: 0,
        z: lerp(layout.shelvedZ, layout.rotationLaneZ, t),
        turn: shelvedTurn,
        roll: horizontalBookRoll,
        scale: 1,
      };

    case "turn-next":
      return {
        x: 0,
        z: layout.rotationLaneZ,
        turn: lerp(shelvedTurn, presentedTurn, t),
        roll: horizontalBookRoll,
        scale: 1,
      };

    case "settle-next":
      return {
        x: 0,
        z: lerp(layout.rotationLaneZ, layout.presentedZ, t),
        turn: presentedTurn,
        roll: lerp(horizontalBookRoll, uprightCoverRoll, t),
        scale: lerp(1, layout.presentedScale, t),
      };
  }
}

export function bookWorldHalfExtents(book: BookFootprint) {
  const turnCosine = Math.abs(Math.cos(book.turn));
  const turnSine = Math.abs(Math.sin(book.turn));
  const rollCosine = Math.abs(Math.cos(book.roll));
  const rollSine = Math.abs(Math.sin(book.roll));
  const halfWidth = book.width * 0.5;
  const halfHeight = book.height * 0.5;
  const halfThickness = book.thickness * 0.5;

  return {
    x:
      (rollCosine * halfWidth + rollSine * halfHeight) * book.scale,
    y:
      (turnCosine * rollSine * halfWidth +
        turnCosine * rollCosine * halfHeight +
        turnSine * halfThickness) *
      book.scale,
    z:
      (turnSine * rollSine * halfWidth +
        turnSine * rollCosine * halfHeight +
        turnCosine * halfThickness) *
      book.scale,
  };
}

export function bookFootprintsOverlap(
  left: BookFootprint,
  right: BookFootprint,
  margin: number,
) {
  const leftHalf = bookWorldHalfExtents(left);
  const rightHalf = bookWorldHalfExtents(right);

  return (
    Math.abs(left.x - right.x) < leftHalf.x + rightHalf.x + margin &&
    Math.abs(left.y - right.y) < leftHalf.y + rightHalf.y + margin &&
    Math.abs(left.z - right.z) < leftHalf.z + rightHalf.z + margin
  );
}

type Point2 = readonly [number, number];
export type V7NormalizedPoint = readonly [number, number];

const BOARD_WIDTH = 176;
const BOARD_DEPTH = 153;

/**
 * Financial City V7 foundation-local normalized space is centered on the
 * board: X and Z both run from -0.5 to +0.5 at the authored board edges.
 * Runtime routes must be derived from these anchors through the same measured
 * 176 × 153 fit used by the indivisible V7 road asset.
 */
export const v7NormalizedPointToFoundationLocal = (
  [normalizedX, normalizedZ]: V7NormalizedPoint,
): Point2 => [
  normalizedX * BOARD_WIDTH,
  normalizedZ * BOARD_DEPTH,
];

const roundedRectangleNormalized = (
  xHalf: number,
  zHalf: number,
  radiusX: number,
  radiusZ: number,
  arcSteps = 16,
): readonly V7NormalizedPoint[] => {
  const points: V7NormalizedPoint[] = [];
  const appendArc = (
    centerX: number,
    centerZ: number,
    startAngle: number,
    endAngle: number,
  ) => {
    for (let step = 0; step <= arcSteps; step += 1) {
      const angle = startAngle + ((endAngle - startAngle) * step) / arcSteps;
      points.push([
        centerX + Math.cos(angle) * radiusX,
        centerZ + Math.sin(angle) * radiusZ,
      ]);
    }
  };

  appendArc(xHalf - radiusX, zHalf - radiusZ, Math.PI / 2, 0);
  appendArc(xHalf - radiusX, -zHalf + radiusZ, 0, -Math.PI / 2);
  appendArc(-xHalf + radiusX, -zHalf + radiusZ, -Math.PI / 2, -Math.PI);
  appendArc(-xHalf + radiusX, zHalf - radiusZ, Math.PI, Math.PI / 2);
  return points;
};

/**
 * These values are measured from the accepted V7 foundation's isolated
 * top-down render, not inferred from the earlier V5 12 m modular grid.
 * V7's visible asphalt is approximately 10 m wide. Its perimeter centerline is
 * near the board edge, while the internal streets sit closer to the center
 * than the former theoretical mask assumed.
 */
const NORMALIZED_PERIMETER_X = 82.5 / BOARD_WIDTH;
const NORMALIZED_PERIMETER_Z = 71.5 / BOARD_DEPTH;
const NORMALIZED_CORNER_RADIUS_X = 11 / BOARD_WIDTH;
const NORMALIZED_CORNER_RADIUS_Z = 11 / BOARD_DEPTH;
const NORMALIZED_LANE_OFFSET_X = 2 / BOARD_WIDTH;
const NORMALIZED_LANE_OFFSET_Z = 2 / BOARD_DEPTH;
const NORMALIZED_INTERNAL_VERTICAL_ROADS = [
  -26.5 / BOARD_WIDTH,
  26.5 / BOARD_WIDTH,
] as const;
const NORMALIZED_INTERNAL_HORIZONTAL_ROADS = [
  -21.75 / BOARD_DEPTH,
  21.75 / BOARD_DEPTH,
] as const;
const NORMALIZED_INTERSECTIONS = [
  [NORMALIZED_INTERNAL_VERTICAL_ROADS[0], NORMALIZED_INTERNAL_HORIZONTAL_ROADS[1]],
  [NORMALIZED_INTERNAL_VERTICAL_ROADS[1], NORMALIZED_INTERNAL_HORIZONTAL_ROADS[1]],
  [NORMALIZED_INTERNAL_VERTICAL_ROADS[0], NORMALIZED_INTERNAL_HORIZONTAL_ROADS[0]],
  [NORMALIZED_INTERNAL_VERTICAL_ROADS[1], NORMALIZED_INTERNAL_HORIZONTAL_ROADS[0]],
] as const satisfies readonly V7NormalizedPoint[];
const NORMALIZED_SIDEWALK_ANCHORS = [
  [-0.238636363636364, 0.222222222222222],
  [0.238636363636364, 0.222222222222222],
  [-0.238636363636364, -0.222222222222222],
  [0.238636363636364, -0.222222222222222],
] as const satisfies readonly V7NormalizedPoint[];

const [PERIMETER_X, PERIMETER_Z] = v7NormalizedPointToFoundationLocal([
  NORMALIZED_PERIMETER_X,
  NORMALIZED_PERIMETER_Z,
]);
const [CORNER_RADIUS_X, CORNER_RADIUS_Z] =
  v7NormalizedPointToFoundationLocal([
    NORMALIZED_CORNER_RADIUS_X,
    NORMALIZED_CORNER_RADIUS_Z,
  ]);
const CORNER_RADIUS = (CORNER_RADIUS_X + CORNER_RADIUS_Z) / 2;
const ROAD_WIDTH = 10;
const INTERNAL_VERTICAL_ROADS = NORMALIZED_INTERNAL_VERTICAL_ROADS.map(
  (normalizedX) => v7NormalizedPointToFoundationLocal([normalizedX, 0])[0],
);
const INTERNAL_HORIZONTAL_ROADS = NORMALIZED_INTERNAL_HORIZONTAL_ROADS.map(
  (normalizedZ) => v7NormalizedPointToFoundationLocal([0, normalizedZ])[1],
);

const NORMALIZED_PERIMETER_LANE_ANCHORS = [
  roundedRectangleNormalized(
    NORMALIZED_PERIMETER_X + NORMALIZED_LANE_OFFSET_X,
    NORMALIZED_PERIMETER_Z + NORMALIZED_LANE_OFFSET_Z,
    NORMALIZED_CORNER_RADIUS_X + NORMALIZED_LANE_OFFSET_X,
    NORMALIZED_CORNER_RADIUS_Z + NORMALIZED_LANE_OFFSET_Z,
  ),
  roundedRectangleNormalized(
    NORMALIZED_PERIMETER_X - NORMALIZED_LANE_OFFSET_X,
    NORMALIZED_PERIMETER_Z - NORMALIZED_LANE_OFFSET_Z,
    NORMALIZED_CORNER_RADIUS_X - NORMALIZED_LANE_OFFSET_X,
    NORMALIZED_CORNER_RADIUS_Z - NORMALIZED_LANE_OFFSET_Z,
  ),
] as const;

const NORMALIZED_INTERNAL_LANE_ANCHORS = [
  roundedRectangleNormalized(
    NORMALIZED_INTERNAL_VERTICAL_ROADS[1] + NORMALIZED_LANE_OFFSET_X,
    NORMALIZED_INTERNAL_HORIZONTAL_ROADS[1] + NORMALIZED_LANE_OFFSET_Z,
    5 / BOARD_WIDTH,
    5 / BOARD_DEPTH,
  ),
  roundedRectangleNormalized(
    NORMALIZED_INTERNAL_VERTICAL_ROADS[1] - NORMALIZED_LANE_OFFSET_X,
    NORMALIZED_INTERNAL_HORIZONTAL_ROADS[1] - NORMALIZED_LANE_OFFSET_Z,
    1.5 / BOARD_WIDTH,
    1.5 / BOARD_DEPTH,
  ),
] as const;

const pointInRoundedRectangle = (
  x: number,
  z: number,
  xHalf: number,
  zHalf: number,
  radius: number,
) => {
  if (Math.abs(x) > xHalf || Math.abs(z) > zHalf) return false;
  const cornerX = Math.max(Math.abs(x) - (xHalf - radius), 0);
  const cornerZ = Math.max(Math.abs(z) - (zHalf - radius), 0);
  return cornerX * cornerX + cornerZ * cornerZ <= radius * radius;
};

const pointIsOnV7Road = (
  x: number,
  z: number,
  safetyInset: number,
) => {
  const roadHalfWidth = ROAD_WIDTH / 2;
  const outerX = PERIMETER_X + roadHalfWidth - safetyInset;
  const outerZ = PERIMETER_Z + roadHalfWidth - safetyInset;
  const outerRadius = CORNER_RADIUS + roadHalfWidth - safetyInset;
  const innerX = PERIMETER_X - roadHalfWidth + safetyInset;
  const innerZ = PERIMETER_Z - roadHalfWidth + safetyInset;
  const innerRadius = CORNER_RADIUS - roadHalfWidth + safetyInset;
  const onPerimeter = pointInRoundedRectangle(x, z, outerX, outerZ, outerRadius)
    && !pointInRoundedRectangle(x, z, innerX, innerZ, innerRadius);
  const onVertical = Math.abs(z) <= PERIMETER_Z + roadHalfWidth - safetyInset
    && INTERNAL_VERTICAL_ROADS.some((centerX) =>
      Math.abs(x - centerX) <= roadHalfWidth - safetyInset,
    );
  const onHorizontal = Math.abs(x) <= PERIMETER_X + roadHalfWidth - safetyInset
    && INTERNAL_HORIZONTAL_ROADS.some((centerZ) =>
      Math.abs(z - centerZ) <= roadHalfWidth - safetyInset,
    );

  return onPerimeter || onVertical || onHorizontal;
};

export const trafficFootprintIsOnV7Road = (
  x: number,
  z: number,
  yaw: number,
  halfLength: number,
  halfWidth: number,
  safetyInset = 0.35,
) => {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);

  // Sample the full rotated rectangle, not only its four corners. That keeps
  // long edges from briefly crossing a parcel while a vehicle turns through
  // the non-convex union of intersecting road strips.
  for (let widthStep = 0; widthStep <= 4; widthStep += 1) {
    const localX = -halfWidth + (halfWidth * 2 * widthStep) / 4;
    for (let lengthStep = 0; lengthStep <= 4; lengthStep += 1) {
      const localZ = -halfLength + (halfLength * 2 * lengthStep) / 4;
      const cornerX = x + cosine * localX + sine * localZ;
      const cornerZ = z - sine * localX + cosine * localZ;
      if (!pointIsOnV7Road(cornerX, cornerZ, safetyInset)) {
        return false;
      }
    }
  }

  return true;
};

export const buildingFootprintClearsV7Roads = (
  x: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
  safetyInset = 0.25,
) => {
  // Building placement remains on its previously accepted parcel-clearance
  // calibration. This traffic correction deliberately does not move or
  // reclassify established architecture.
  const buildingVerticalRoads = [-29, 29] as const;
  const buildingHorizontalRoads = [-25.5, 25.5] as const;
  const buildingPerimeterX = 73.96;
  const buildingPerimeterZ = 62.46;
  const buildingCornerRadius = 11.04;
  const roadHalfWidth = 6;
  const minX = x - halfWidth;
  const maxX = x + halfWidth;
  const minZ = z - halfDepth;
  const maxZ = z + halfDepth;
  const clearsVerticalRoads = buildingVerticalRoads.every((centerX) =>
    maxX <= centerX - roadHalfWidth - safetyInset
      || minX >= centerX + roadHalfWidth + safetyInset,
  );
  const clearsHorizontalRoads = buildingHorizontalRoads.every((centerZ) =>
    maxZ <= centerZ - roadHalfWidth - safetyInset
      || minZ >= centerZ + roadHalfWidth + safetyInset,
  );
  if (!clearsVerticalRoads || !clearsHorizontalRoads) return false;

  const innerX = buildingPerimeterX - roadHalfWidth - safetyInset;
  const innerZ = buildingPerimeterZ - roadHalfWidth - safetyInset;
  const innerRadius = buildingCornerRadius - roadHalfWidth - safetyInset;
  return [
    [minX, minZ],
    [minX, maxZ],
    [maxX, minZ],
    [maxX, maxZ],
  ].every(([cornerX, cornerZ]) =>
    pointInRoundedRectangle(cornerX, cornerZ, innerX, innerZ, innerRadius),
  );
};

export const FINANCIAL_CITY_V7_CALIBRATION = {
  board: {
    width: BOARD_WIDTH,
    depth: BOARD_DEPTH,
    surfaceY: 1,
    normalizedMin: -0.5,
    normalizedMax: 0.5,
  },
  roadWidth: ROAD_WIDTH,
  calibrationSource: "v7-isolated-top-down-visible-asphalt",
  perimeter: {
    center: { xHalf: PERIMETER_X, zHalf: PERIMETER_Z, cornerRadius: CORNER_RADIUS },
    normalizedLaneAnchors: NORMALIZED_PERIMETER_LANE_ANCHORS,
  },
  internalRoadCenterlines: {
    vertical: INTERNAL_VERTICAL_ROADS,
    horizontal: INTERNAL_HORIZONTAL_ROADS,
    normalizedLaneAnchors: NORMALIZED_INTERNAL_LANE_ANCHORS,
  },
  normalizedIntersections: NORMALIZED_INTERSECTIONS,
  intersections: NORMALIZED_INTERSECTIONS.map(
    v7NormalizedPointToFoundationLocal,
  ),
  parcels: [
    { id: "northwest", center: [-54.5, 47.2], size: [24.5, 16.5] },
    { id: "north", center: [0, 47.2], size: [32, 16.5] },
    { id: "northeast", center: [54.5, 47.2], size: [24.5, 16.5] },
    { id: "west", center: [-54.5, 0], size: [24.5, 24.5] },
    { id: "east", center: [54.5, 0], size: [24.5, 24.5] },
    { id: "southwest", center: [-54.5, -47.2], size: [24.5, 16.5] },
    { id: "south", center: [0, -47.2], size: [32, 16.5] },
    { id: "southeast", center: [54.5, -47.2], size: [24.5, 16.5] },
  ],
  civicPads: [
    { id: "city-hall", center: [8.2, 0], size: [15.2, 24] },
    { id: "resilience-park", center: [-8.2, 0], size: [15.2, 24] },
  ],
  normalizedSidewalkAnchors: NORMALIZED_SIDEWALK_ANCHORS,
  sidewalkAnchors: NORMALIZED_SIDEWALK_ANCHORS.map(
    v7NormalizedPointToFoundationLocal,
  ),
} as const;

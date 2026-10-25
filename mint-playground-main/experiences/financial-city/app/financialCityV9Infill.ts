export type FinancialCityParcelId =
  | "northwest"
  | "north"
  | "northeast"
  | "west"
  | "east"
  | "southwest"
  | "south"
  | "southeast";

export type FinancialCityInfillAsset =
  | "brickApartments"
  | "limestoneOffices"
  | "tealGlassTower"
  | "copperMixedUse"
  | "terracedResidences"
  | "hotel"
  | "arcade";

export type FinancialCityInfillBlocker =
  | "skyline"
  | "hospital"
  | "fireStation"
  | "debtConstruction"
  | "futureDistrict";

export type FinancialCityInfillTier =
  | "deferred"
  | "balanced"
  | "luxury";

export type FinancialCityV9InfillSpec = {
  key: string;
  parcelId: FinancialCityParcelId;
  asset: FinancialCityInfillAsset;
  variantIndex: number;
  x: number;
  z: number;
  footprint: number;
  yaw: number;
  hideWhen?: readonly FinancialCityInfillBlocker[];
};

type FinancialCityTierMetrics = {
  stage: number;
  surplus: number;
  goalMatch: number;
  savingsRate: number;
  debtLoad: number;
  emergencyMonths: number;
};

export const getFinancialCityInfillTier = (
  metrics: FinancialCityTierMetrics,
): FinancialCityInfillTier => {
  if (
    metrics.stage <= 2
    || metrics.surplus < 0
    || metrics.goalMatch < 0.65
  ) return "deferred";

  if (
    metrics.stage >= 5
    && metrics.savingsRate >= 0.3
    && metrics.debtLoad <= 0.12
    && metrics.emergencyMonths >= 4
  ) return "luxury";

  return "balanced";
};

/**
 * V9 composes forty state-responsive building anchors inside V7's accepted
 * parcels. Every anchor swaps between complete deferred, balanced, and luxury
 * Mint buildings; no runtime material damage or recoloring is used.
 */
export const FINANCIAL_CITY_V9_INFILL = [
  // West: the fully open parcel becomes a dense 2 × 4 city block.
  { key: "infill-west-northwest", parcelId: "west", asset: "brickApartments", variantIndex: 0, x: -63.2, z: -6.3, footprint: 5.6, yaw: Math.PI / 2 },
  { key: "infill-west-north-inner", parcelId: "west", asset: "limestoneOffices", variantIndex: 1, x: -57.3, z: -6.3, footprint: 5.6, yaw: 0 },
  { key: "infill-west-north-center", parcelId: "west", asset: "tealGlassTower", variantIndex: 2, x: -51.4, z: -6.3, footprint: 5.6, yaw: 0 },
  { key: "infill-west-northeast", parcelId: "west", asset: "copperMixedUse", variantIndex: 3, x: -45.5, z: -6.3, footprint: 5.6, yaw: -Math.PI / 2 },
  { key: "infill-west-southwest", parcelId: "west", asset: "terracedResidences", variantIndex: 4, x: -63.2, z: 6.3, footprint: 5.6, yaw: Math.PI / 2 },
  { key: "infill-west-south-inner", parcelId: "west", asset: "hotel", variantIndex: 5, x: -57.3, z: 6.3, footprint: 5.6, yaw: Math.PI },
  { key: "infill-west-south-center", parcelId: "west", asset: "arcade", variantIndex: 6, x: -51.4, z: 6.3, footprint: 5.6, yaw: Math.PI },
  { key: "infill-west-southeast", parcelId: "west", asset: "brickApartments", variantIndex: 7, x: -45.5, z: 6.3, footprint: 5.6, yaw: -Math.PI / 2 },

  // Northwest: one roadside building and a complete three-building rear row.
  { key: "infill-northwest-roadside", parcelId: "northwest", asset: "brickApartments", variantIndex: 1, x: -63.2, z: 42.5, footprint: 6, yaw: Math.PI / 2 },
  { key: "infill-northwest-corner", parcelId: "northwest", asset: "copperMixedUse", variantIndex: 2, x: -62, z: 51.7, footprint: 6, yaw: Math.PI },
  { key: "infill-northwest-inner", parcelId: "northwest", asset: "limestoneOffices", variantIndex: 3, x: -53.6, z: 51.7, footprint: 6, yaw: Math.PI },
  { key: "infill-northwest-east", parcelId: "northwest", asset: "arcade", variantIndex: 4, x: -45.5, z: 51.7, footprint: 6, yaw: Math.PI },

  // North: four-building frontage behind employment and arts.
  { key: "infill-north-far-left", parcelId: "north", asset: "arcade", variantIndex: 4, x: -12, z: 51.6, footprint: 6.2, yaw: Math.PI },
  { key: "infill-north-left", parcelId: "north", asset: "tealGlassTower", variantIndex: 5, x: -4, z: 51.6, footprint: 6.2, yaw: Math.PI },
  { key: "infill-north-right", parcelId: "north", asset: "hotel", variantIndex: 6, x: 4, z: 51.6, footprint: 6.2, yaw: Math.PI },
  { key: "infill-north-far-right", parcelId: "north", asset: "brickApartments", variantIndex: 7, x: 12, z: 51.6, footprint: 6.2, yaw: Math.PI },

  // Northeast: three west/center buildings yield to the unlocked future district.
  { key: "infill-northeast-west-roadside", parcelId: "northeast", asset: "terracedResidences", variantIndex: 0, x: 47.3, z: 43.4, footprint: 6.8, yaw: Math.PI / 2, hideWhen: ["futureDistrict"] },
  { key: "infill-northeast-west-corner", parcelId: "northeast", asset: "brickApartments", variantIndex: 1, x: 47.3, z: 51.5, footprint: 6.8, yaw: Math.PI, hideWhen: ["futureDistrict"] },
  { key: "infill-northeast-center", parcelId: "northeast", asset: "hotel", variantIndex: 2, x: 55.2, z: 51.7, footprint: 5.6, yaw: Math.PI, hideWhen: ["futureDistrict"] },
  { key: "infill-northeast-east-roadside", parcelId: "northeast", asset: "limestoneOffices", variantIndex: 3, x: 63, z: 43, footprint: 6.5, yaw: -Math.PI / 2 },
  { key: "infill-northeast-east-corner", parcelId: "northeast", asset: "copperMixedUse", variantIndex: 4, x: 63, z: 51.5, footprint: 6.5, yaw: Math.PI },

  // East: the west and center columns fill in only when emergency campuses are absent.
  { key: "infill-east-west-north", parcelId: "east", asset: "arcade", variantIndex: 5, x: 47, z: -6.2, footprint: 5.6, yaw: Math.PI / 2, hideWhen: ["hospital", "fireStation"] },
  { key: "infill-east-center-north", parcelId: "east", asset: "terracedResidences", variantIndex: 6, x: 55, z: -6.2, footprint: 5.6, yaw: 0, hideWhen: ["hospital", "fireStation"] },
  { key: "infill-east-roadside-north", parcelId: "east", asset: "tealGlassTower", variantIndex: 7, x: 63, z: -6.2, footprint: 5.6, yaw: -Math.PI / 2 },
  { key: "infill-east-west-south", parcelId: "east", asset: "brickApartments", variantIndex: 0, x: 47, z: 6.2, footprint: 5.6, yaw: Math.PI / 2, hideWhen: ["hospital", "fireStation"] },
  { key: "infill-east-center-south", parcelId: "east", asset: "hotel", variantIndex: 1, x: 55, z: 6.2, footprint: 5.6, yaw: 0, hideWhen: ["hospital", "fireStation"] },
  { key: "infill-east-roadside-south", parcelId: "east", asset: "limestoneOffices", variantIndex: 2, x: 63, z: 6.2, footprint: 5.6, yaw: -Math.PI / 2 },

  // Southwest: three-building frontage and one west-side building wrap employment.
  { key: "infill-southwest-corner", parcelId: "southwest", asset: "brickApartments", variantIndex: 3, x: -63, z: -52.3, footprint: 5.6, yaw: 0 },
  { key: "infill-southwest-center", parcelId: "southwest", asset: "hotel", variantIndex: 4, x: -54, z: -52.3, footprint: 5.6, yaw: 0 },
  { key: "infill-southwest-east", parcelId: "southwest", asset: "limestoneOffices", variantIndex: 5, x: -45.5, z: -52.3, footprint: 5.6, yaw: 0 },
  { key: "infill-southwest-roadside", parcelId: "southwest", asset: "arcade", variantIndex: 6, x: -63, z: -42.2, footprint: 5.6, yaw: Math.PI / 2 },

  // South: three center/right buildings yield to the savings skyline.
  { key: "infill-south-far-left", parcelId: "south", asset: "copperMixedUse", variantIndex: 7, x: -12, z: -52.3, footprint: 5.6, yaw: 0 },
  { key: "infill-south-left", parcelId: "south", asset: "hotel", variantIndex: 0, x: -4, z: -52.3, footprint: 5.6, yaw: 0, hideWhen: ["skyline"] },
  { key: "infill-south-right", parcelId: "south", asset: "terracedResidences", variantIndex: 1, x: 4, z: -52.3, footprint: 5.6, yaw: 0, hideWhen: ["skyline"] },
  { key: "infill-south-far-right", parcelId: "south", asset: "brickApartments", variantIndex: 2, x: 12, z: -52.3, footprint: 5.6, yaw: 0, hideWhen: ["skyline"] },

  // Southeast: four-building frontage plus an east-side road building.
  { key: "infill-southeast-far-west", parcelId: "southeast", asset: "brickApartments", variantIndex: 2, x: 45.5, z: -52.2, footprint: 5.2, yaw: 0, hideWhen: ["debtConstruction"] },
  { key: "infill-southeast-west", parcelId: "southeast", asset: "hotel", variantIndex: 3, x: 51.7, z: -52.2, footprint: 5.2, yaw: 0, hideWhen: ["debtConstruction"] },
  { key: "infill-southeast-center", parcelId: "southeast", asset: "limestoneOffices", variantIndex: 4, x: 57.5, z: -52.2, footprint: 5.2, yaw: 0 },
  { key: "infill-southeast-corner", parcelId: "southeast", asset: "copperMixedUse", variantIndex: 5, x: 63, z: -52.2, footprint: 5.2, yaw: 0 },
  { key: "infill-southeast-roadside", parcelId: "southeast", asset: "arcade", variantIndex: 6, x: 63, z: -42.5, footprint: 6, yaw: -Math.PI / 2 },
] as const satisfies readonly FinancialCityV9InfillSpec[];

export const FINANCIAL_CITY_V9_INFILL_RESERVED_FOOTPRINTS = [
  { id: "dining", parcelId: "northwest", x: -50, z: 40, footprint: 14 },
  { id: "employment", parcelId: "north", x: -13.5, z: 40, footprint: 16 },
  { id: "arts", parcelId: "north", x: 13.5, z: 40, footprint: 15 },
  { id: "futureDistrict", parcelId: "northeast", x: 51, z: 41.5, footprint: 17 },
  { id: "hospital", parcelId: "east", x: 50, z: -4, footprint: 16 },
  { id: "fireStation", parcelId: "east", x: 50, z: 13, footprint: 11 },
  { id: "employment", parcelId: "southwest", x: -52, z: -41.25, footprint: 16 },
  { id: "utility", parcelId: "south", x: -15, z: -40, footprint: 13 },
  { id: "skyline", parcelId: "south", x: 3, z: -41, footprint: 18 },
  { id: "debtConstruction", parcelId: "southeast", x: 42.5, z: -45, footprint: 14 },
  { id: "highInterest", parcelId: "southeast", x: 52, z: -39, footprint: 10 },
  { id: "landmark", parcelId: "southeast", x: 52, z: -39, footprint: 14 },
] as const;

export const squareFootprintsOverlap = (
  a: { x: number; z: number; footprint: number },
  b: { x: number; z: number; footprint: number },
  clearance = 0.2,
) =>
  Math.abs(a.x - b.x) < (a.footprint + b.footprint) / 2 + clearance
  && Math.abs(a.z - b.z) < (a.footprint + b.footprint) / 2 + clearance;

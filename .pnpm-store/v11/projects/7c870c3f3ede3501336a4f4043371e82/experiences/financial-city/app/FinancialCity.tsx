"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  FINANCIAL_CITY_IMPORT_CONTRACT,
  FINANCIAL_CITY_MINT_ASSETS,
} from "./financialCityMintAssets";
import {
  buildingFootprintClearsV7Roads,
  FINANCIAL_CITY_V7_CALIBRATION,
  trafficFootprintIsOnV7Road,
  v7NormalizedPointToFoundationLocal,
} from "./financialCityV7Calibration";
import {
  FINANCIAL_CITY_V9_INFILL,
  getFinancialCityInfillTier,
  type FinancialCityInfillTier,
  squareFootprintsOverlap,
} from "./financialCityV9Infill";

type FinanceState = {
  income: number;
  rent: number;
  utilities: number;
  groceries: number;
  carPayment: number;
  insurance: number;
  discretionary: number;
  savings: number;
  retirement: number;
  emergencyContribution: number;
  emergencyFund: number;
  debt: number;
  highInterestDebt: number;
  debtPayment: number;
};

type CityMetrics = {
  surplus: number;
  savingsRate: number;
  emergencyMonths: number;
  debtLoad: number;
  highInterestRatio: number;
  goalMatch: number;
  goalsMet: number;
  essentialSpend: number;
  trafficActivity: number;
  score: number;
  stage: 1 | 2 | 3 | 4 | 5;
  phase: "In distress" | "Recovering" | "Stable" | "Growing" | "Thriving";
  nextStageScore: number | null;
};

type DistrictId =
  | "overview"
  | "income"
  | "savings"
  | "emergency"
  | "future";

type ModelId =
  | "underlay"
  | "foundation"
  | "trafficSignals"
  | "streetlights"
  | "horizon"
  | "infill"
  | "cityHall"
  | "utility"
  | "employment"
  | "gridRecovery"
  | "skyline"
  | "park"
  | "upgrades"
  | "hospital"
  | "fireStation"
  | "floodProtection"
  | "repairs"
  | "debtConstruction"
  | "highInterest"
  | "overspending"
  | "recovery"
  | "dining"
  | "arts"
  | "transit"
  | "landmark"
  | "futureDistrict"
  | "clouds"
  | "haze";

type ModelSpec = {
  key?: string;
  id: ModelId;
  url: string;
  position: readonly [number, number, number];
  footprint: number;
  yaw?: number;
  always?: boolean;
  roadClearanceRequired?: boolean;
  hideWhen?: readonly ModelId[];
  infillTier?: FinancialCityInfillTier;
};

type RuntimeModel = {
  id: ModelId;
  root: THREE.Group;
  desiredScale: number;
  shown: boolean;
};

type TrafficVehicle = {
  root: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  offset: number;
  speed: number;
  direction: 1 | -1;
  index: number;
  clearance: number;
  halfLength: number;
  halfWidth: number;
  routeKind: "perimeter" | "internal";
};

type BudgetKey =
  | "rent"
  | "utilities"
  | "groceries"
  | "carPayment"
  | "insurance"
  | "discretionary"
  | "savings"
  | "retirement"
  | "emergencyContribution"
  | "debtPayment";

type BudgetRow = {
  key: BudgetKey;
  label: string;
  target: number;
  min: number;
  max: number;
  step: number;
  kind: "expense" | "contribution";
};

const STORAGE_KEY = "financial-city-plan-v2";

const DEFAULT_FINANCES: FinanceState = {
  income: 10000,
  rent: 2500,
  utilities: 450,
  groceries: 750,
  carPayment: 650,
  insurance: 500,
  discretionary: 900,
  savings: 1000,
  retirement: 1000,
  emergencyContribution: 500,
  emergencyFund: 15000,
  debt: 20000,
  highInterestDebt: 3000,
  debtPayment: 500,
};

const PRESETS: Record<string, FinanceState> = {
  "Off target": {
    income: 10000,
    rent: 3050,
    utilities: 650,
    groceries: 1050,
    carPayment: 900,
    insurance: 675,
    discretionary: 3000,
    savings: 200,
    retirement: 250,
    emergencyContribution: 100,
    emergencyFund: 2500,
    debt: 52000,
    highInterestDebt: 15000,
    debtPayment: 250,
  },
  "On target": DEFAULT_FINANCES,
  Ahead: {
    income: 10000,
    rent: 2400,
    utilities: 390,
    groceries: 650,
    carPayment: 550,
    insurance: 450,
    discretionary: 700,
    savings: 1300,
    retirement: 1400,
    emergencyContribution: 700,
    emergencyFund: 30000,
    debt: 8000,
    highInterestDebt: 0,
    debtPayment: 700,
  },
};

const BUDGET_ROWS: BudgetRow[] = [
  { key: "rent", label: "Rent", target: 2500, min: 1000, max: 4500, step: 50, kind: "expense" },
  { key: "utilities", label: "Basic utilities", target: 450, min: 100, max: 1200, step: 25, kind: "expense" },
  { key: "groceries", label: "Groceries", target: 750, min: 200, max: 1800, step: 25, kind: "expense" },
  { key: "carPayment", label: "Car payment", target: 650, min: 0, max: 1600, step: 25, kind: "expense" },
  { key: "insurance", label: "Insurance", target: 500, min: 100, max: 1400, step: 25, kind: "expense" },
  { key: "discretionary", label: "Flexible spending", target: 900, min: 0, max: 3000, step: 50, kind: "expense" },
  { key: "savings", label: "Savings", target: 1000, min: 0, max: 3000, step: 50, kind: "contribution" },
  { key: "retirement", label: "Retirement", target: 1000, min: 0, max: 3000, step: 50, kind: "contribution" },
  { key: "emergencyContribution", label: "Emergency fund", target: 500, min: 0, max: 2000, step: 50, kind: "contribution" },
  { key: "debtPayment", label: "Debt payment", target: 500, min: 0, max: 2500, step: 50, kind: "contribution" },
];

const CITY_SURFACE_Y = FINANCIAL_CITY_V7_CALIBRATION.board.surfaceY;
const TRAFFIC_SURFACE_Y = CITY_SURFACE_Y + 0.06;
const UNDERLAY_BOTTOM_Y =
  FINANCIAL_CITY_IMPORT_CONTRACT.underlayTopY
  - FINANCIAL_CITY_IMPORT_CONTRACT.underlayTargetHeight;

const TRAFFIC_MODELS = [
  { url: FINANCIAL_CITY_MINT_ASSETS.vehicles.navySedan, length: 4.4, yawOffset: 0 },
  { url: FINANCIAL_CITY_MINT_ASSETS.vehicles.copperHatchback, length: 3.9, yawOffset: -Math.PI / 2 },
  { url: FINANCIAL_CITY_MINT_ASSETS.vehicles.ivoryCrossover, length: 4.5, yawOffset: 0 },
  { url: FINANCIAL_CITY_MINT_ASSETS.vehicles.tealMicroCar, length: 3.4, yawOffset: 0 },
  { url: FINANCIAL_CITY_MINT_ASSETS.vehicles.deliveryVan, length: 5.4, yawOffset: 0 },
  { url: FINANCIAL_CITY_MINT_ASSETS.vehicles.cityBus, length: 8.6, yawOffset: 0 },
] as const;

const TRAFFIC_ROUTE_SPECS = [
  ...FINANCIAL_CITY_V7_CALIBRATION.perimeter.normalizedLaneAnchors.map((anchors) => ({
    anchors,
    kind: "perimeter" as const,
  })),
  ...FINANCIAL_CITY_V7_CALIBRATION.internalRoadCenterlines.normalizedLaneAnchors.map((anchors) => ({
    anchors,
    kind: "internal" as const,
  })),
];

const INFILL_MODEL_SPECS: ModelSpec[] = FINANCIAL_CITY_V9_INFILL.flatMap(
  (spec) => {
    const common = {
      id: "infill" as const,
      position: [spec.x, CITY_SURFACE_Y, spec.z] as const,
      footprint: spec.footprint,
      yaw: spec.yaw,
      always: true,
      hideWhen: "hideWhen" in spec ? spec.hideWhen : undefined,
    };
    const deferredAssets = FINANCIAL_CITY_MINT_ASSETS.infillState.deferred;
    const luxuryAssets = FINANCIAL_CITY_MINT_ASSETS.infillState.luxury;

    return [
      {
        ...common,
        key: `${spec.key}-deferred`,
        url: deferredAssets[spec.variantIndex % deferredAssets.length],
        infillTier: "deferred" as const,
      },
      {
        ...common,
        key: `${spec.key}-balanced`,
        url: FINANCIAL_CITY_MINT_ASSETS.infill[spec.asset],
        infillTier: "balanced" as const,
      },
      {
        ...common,
        key: `${spec.key}-luxury`,
        url: luxuryAssets[spec.variantIndex % luxuryAssets.length],
        infillTier: "luxury" as const,
      },
    ];
  },
);

const CIVIC_INFRASTRUCTURE_SPECS: ModelSpec[] = [
  ...FINANCIAL_CITY_V7_CALIBRATION.intersections.map(([x, z], index) => ({
    key: `traffic-signals-${index + 1}`,
    id: "trafficSignals" as const,
    url: FINANCIAL_CITY_MINT_ASSETS.infrastructure.trafficSignals,
    position: [x, CITY_SURFACE_Y, z] as const,
    footprint: 14,
    always: true,
  })),
  ...FINANCIAL_CITY_V7_CALIBRATION.sidewalkAnchors.map(
    ([x, z], index) => ({
      key: `streetlights-${index + 1}`,
      id: "streetlights" as const,
      url: FINANCIAL_CITY_MINT_ASSETS.infrastructure.streetlights,
      position: [x, CITY_SURFACE_Y, z] as const,
      footprint: 4.4,
      yaw: z > 0 ? 0 : Math.PI,
      always: true,
      roadClearanceRequired: true,
    }),
  ),
];

const MODEL_SPECS: ModelSpec[] = [
  {
    id: "underlay",
    url: FINANCIAL_CITY_MINT_ASSETS.foundation.underlay,
    position: [0, UNDERLAY_BOTTOM_Y, 0],
    footprint: FINANCIAL_CITY_IMPORT_CONTRACT.underlayTargetSize[0],
    always: true,
  },
  { id: "foundation", url: FINANCIAL_CITY_MINT_ASSETS.foundation.city, position: [0, 0, 0], footprint: 176, always: true },
  { id: "cityHall", url: FINANCIAL_CITY_MINT_ASSETS.cityHall.exterior, position: [9, CITY_SURFACE_Y, 0], footprint: 17, always: true },
  { id: "park", url: FINANCIAL_CITY_MINT_ASSETS.savings.resiliencePark, position: [-10, CITY_SURFACE_Y, 0], footprint: 14, always: true },
  { id: "employment", url: FINANCIAL_CITY_MINT_ASSETS.income.employmentBlocks, position: [-52, CITY_SURFACE_Y, -41.25], footprint: 16, yaw: Math.PI, always: true, roadClearanceRequired: true },
  { id: "utility", url: FINANCIAL_CITY_MINT_ASSETS.income.utilityCampus, position: [-15, CITY_SURFACE_Y, -40], footprint: 13, yaw: Math.PI, always: true, roadClearanceRequired: true },
  { key: "south-employment-infill", id: "employment", url: FINANCIAL_CITY_MINT_ASSETS.income.employmentBlocks, position: [-13.5, CITY_SURFACE_Y, 40], footprint: 16, yaw: Math.PI, always: true, roadClearanceRequired: true },
  { id: "skyline", url: FINANCIAL_CITY_MINT_ASSETS.savings.skyline, position: [3, CITY_SURFACE_Y, -41], footprint: 18, yaw: Math.PI, roadClearanceRequired: true },
  { id: "hospital", url: FINANCIAL_CITY_MINT_ASSETS.emergency.hospital, position: [50, CITY_SURFACE_Y, -4], footprint: 16, yaw: -Math.PI / 2 },
  { id: "fireStation", url: FINANCIAL_CITY_MINT_ASSETS.emergency.fireStation, position: [50, CITY_SURFACE_Y, 13], footprint: 11, yaw: -Math.PI / 2 },
  { id: "debtConstruction", url: FINANCIAL_CITY_MINT_ASSETS.pressure.debtConstruction, position: [42.5, CITY_SURFACE_Y, -45], footprint: 14, yaw: Math.PI },
  { id: "highInterest", url: FINANCIAL_CITY_MINT_ASSETS.pressure.highInterest, position: [52, CITY_SURFACE_Y, -39], footprint: 10, yaw: Math.PI },
  { id: "dining", url: FINANCIAL_CITY_MINT_ASSETS.discretionary.dining, position: [-50, CITY_SURFACE_Y, 40], footprint: 14 },
  { id: "arts", url: FINANCIAL_CITY_MINT_ASSETS.discretionary.arts, position: [13.5, CITY_SURFACE_Y, 40], footprint: 15, yaw: Math.PI, roadClearanceRequired: true },
  { id: "landmark", url: FINANCIAL_CITY_MINT_ASSETS.future.culturalLandmark, position: [52, CITY_SURFACE_Y, -39], footprint: 14, yaw: Math.PI },
  { id: "futureDistrict", url: FINANCIAL_CITY_MINT_ASSETS.future.district, position: [51, CITY_SURFACE_Y, 41.5], footprint: 17, yaw: Math.PI },
  ...CIVIC_INFRASTRUCTURE_SPECS,
  ...INFILL_MODEL_SPECS,
];

const MODEL_SPECS_BY_KEY = new Map(
  MODEL_SPECS.map((spec) => [spec.key ?? spec.id, spec]),
);

const TRAFFIC_OBSTACLES = MODEL_SPECS.filter((spec) =>
  spec.id !== "foundation"
  && spec.id !== "underlay"
  && spec.id !== "trafficSignals",
);

function trafficPointIsClear(point: THREE.Vector3, clearance: number, values: FinanceState, metrics: CityMetrics) {
  return TRAFFIC_OBSTACLES.every((spec) => {
    if (!modelSpecIsVisible(spec, values, metrics)) return true;
    const protectedHalfSpan = spec.footprint * 0.43 + clearance;
    return Math.abs(point.x - spec.position[0]) > protectedHalfSpan
      || Math.abs(point.z - spec.position[2]) > protectedHalfSpan;
  });
}

const FOCUS: Record<DistrictId, { camera: readonly [number, number, number]; target: readonly [number, number, number] }> = {
  overview: { camera: [86, 66, 90], target: [0, 8, 0] },
  income: { camera: [-82, 54, 58], target: [-40, 8, -10] },
  savings: { camera: [-34, 56, 70], target: [0, 8, 28] },
  emergency: { camera: [84, 52, 50], target: [46, 8, 5] },
  future: { camera: [76, 56, -6], target: [34, 9, -38] },
};

const DISTRICTS: { id: DistrictId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "income", label: "Income" },
  { id: "savings", label: "Savings" },
  { id: "emergency", label: "Safety" },
  { id: "future", label: "Future" },
];

const BALANCE_FIELDS: { key: "emergencyFund" | "debt" | "highInterestDebt"; label: string; min: number; max: number; step: number }[] = [
  { key: "emergencyFund", label: "Emergency fund", min: 0, max: 60000, step: 250 },
  { key: "debt", label: "Total debt", min: 0, max: 120000, step: 500 },
  { key: "highInterestDebt", label: "High-interest debt", min: 0, max: 50000, step: 250 },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function calculateMetrics(values: FinanceState): CityMetrics {
  const income = Math.max(values.income, 1);
  const essentialSpend = values.rent + values.utilities + values.groceries + values.carPayment + values.insurance;
  const monthlyOutflow = BUDGET_ROWS.reduce((total, row) => total + values[row.key], 0);
  const surplus = values.income - monthlyOutflow;
  const savingsRate = (values.savings + values.retirement + values.emergencyContribution) / income;
  const emergencyMonths = values.emergencyFund / Math.max(essentialSpend, 1);
  const debtLoad = values.debt / (income * 12);
  const highInterestRatio = values.highInterestDebt / Math.max(values.debt, income);
  const incomeGoal = clamp(values.income / 10000);
  const rowScores = BUDGET_ROWS.map((row) => {
    const actual = values[row.key];
    if (row.kind === "expense") return actual <= row.target ? 1 : clamp(1 - (actual - row.target) / Math.max(row.target * 0.75, 1));
    return clamp(actual / Math.max(row.target, 1));
  });
  const goalsMet = BUDGET_ROWS.filter((row) => row.kind === "expense" ? values[row.key] <= row.target : values[row.key] >= row.target).length;
  const goalMatch = (incomeGoal + rowScores.reduce((total, value) => total + value, 0)) / (rowScores.length + 1);
  const cashScore = clamp((surplus / income + 0.05) / 0.2);
  const savingsScore = clamp(savingsRate / 0.25);
  const emergencyScore = clamp(emergencyMonths / 6);
  const debtScore = 1 - clamp(debtLoad / 0.75);
  const interestScore = 1 - clamp(highInterestRatio / 0.45);
  const score = Math.round(
    100 *
      (cashScore * 0.17 +
        savingsScore * 0.18 +
        emergencyScore * 0.18 +
        debtScore * 0.12 +
        interestScore * 0.1 +
        goalMatch * 0.25),
  );
  const trafficActivity = clamp(0.08 + (score / 100) * 0.92);
  const stage = (score < 40 ? 1 : score < 60 ? 2 : score < 75 ? 3 : score < 90 ? 4 : 5) as CityMetrics["stage"];
  const phase = score < 40 ? "In distress" : score < 60 ? "Recovering" : score < 75 ? "Stable" : score < 90 ? "Growing" : "Thriving";
  const nextStageScore = stage === 1 ? 40 : stage === 2 ? 60 : stage === 3 ? 75 : stage === 4 ? 90 : null;
  return { surplus, savingsRate, emergencyMonths, debtLoad, highInterestRatio, goalMatch, goalsMet, essentialSpend, trafficActivity, score, stage, phase, nextStageScore };
}

function shouldShow(id: ModelId, values: FinanceState, metrics: CityMetrics) {
  const investingRate = values.retirement / Math.max(values.income, 1);
  const discretionaryRate = values.discretionary / Math.max(values.income, 1);
  switch (id) {
    case "gridRecovery": return metrics.stage >= 3;
    case "skyline": return metrics.savingsRate >= 0.1;
    case "park": return metrics.savingsRate >= 0.07;
    case "upgrades": return metrics.stage >= 5 && metrics.savingsRate >= 0.18;
    case "hospital": return metrics.emergencyMonths >= 3;
    case "fireStation": return metrics.emergencyMonths >= 2;
    case "floodProtection": return metrics.emergencyMonths >= 5;
    case "repairs": return metrics.stage >= 2 && metrics.emergencyMonths >= 1;
    case "debtConstruction": return metrics.debtLoad > 0.25;
    case "highInterest": return values.highInterestDebt > values.income * 0.4;
    case "overspending": return metrics.surplus < 0 || discretionaryRate > 0.15 || metrics.goalMatch < 0.65;
    case "recovery": return metrics.stage >= 4 && metrics.surplus >= 0 && metrics.debtLoad <= 0.35;
    case "dining": return values.discretionary > 150;
    case "arts": return values.discretionary > 600;
    case "transit": return investingRate >= 0.05;
    case "landmark": return investingRate >= 0.09;
    case "futureDistrict": return metrics.stage >= 5 && investingRate >= 0.13;
    default: return true;
  }
}

function modelSpecIsVisible(
  spec: ModelSpec,
  values: FinanceState,
  metrics: CityMetrics,
) {
  if (
    spec.infillTier
    && spec.infillTier !== getFinancialCityInfillTier(metrics)
  ) return false;
  const baseVisible = Boolean(
    spec.always || shouldShow(spec.id, values, metrics),
  );
  const reservedSiteIsActive = spec.hideWhen?.some((blockerId) =>
    shouldShow(blockerId, values, metrics),
  );
  return baseVisible && !reservedSiteIsActive;
}

function getVisibleInfillOverlapViolations(
  values: FinanceState,
  metrics: CityMetrics,
) {
  const architecture = MODEL_SPECS.filter((spec) =>
    spec.id !== "foundation"
    && spec.id !== "underlay"
    && spec.id !== "trafficSignals"
    && spec.id !== "streetlights"
    && modelSpecIsVisible(spec, values, metrics),
  );
  const violations: string[] = [];

  INFILL_MODEL_SPECS.forEach((infill) => {
    if (!modelSpecIsVisible(infill, values, metrics)) return;
    architecture.forEach((occupied) => {
      if (occupied === infill) return;
      if (
        occupied.id === "infill"
        && (occupied.key ?? "") < (infill.key ?? "")
      ) return;
      if (!squareFootprintsOverlap(
        {
          x: infill.position[0],
          z: infill.position[2],
          footprint: infill.footprint,
        },
        {
          x: occupied.position[0],
          z: occupied.position[2],
          footprint: occupied.footprint,
        },
      )) return;
      violations.push(
        `${infill.key ?? "infill"}:${occupied.key ?? occupied.id}`,
      );
    });
  });

  return violations;
}

function districtIsAvailable(id: DistrictId, values: FinanceState, metrics: CityMetrics) {
  if (id === "savings") return metrics.savingsRate >= 0.07;
  if (id === "emergency") return metrics.emergencyMonths >= 1;
  if (id === "future") return values.retirement / Math.max(values.income, 1) >= 0.05;
  return true;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getNextMoves(values: FinanceState, metrics: CityMetrics) {
  const moves: string[] = [];
  const missedGoal = BUDGET_ROWS.find((row) => row.kind === "expense" ? values[row.key] > row.target : values[row.key] < row.target);
  if (metrics.surplus < 0) moves.push(`Free up ${formatMoney(Math.abs(metrics.surplus))}/month to restore city services.`);
  if (missedGoal) {
    const difference = Math.abs(values[missedGoal.key] - missedGoal.target);
    moves.push(`${missedGoal.label} is ${formatMoney(difference)} ${missedGoal.kind === "expense" ? "over" : "short of"} its monthly goal.`);
  }
  if (metrics.emergencyMonths < 3) moves.push(`Build ${Math.max(0, 3 - metrics.emergencyMonths).toFixed(1)} more months of emergency coverage.`);
  if (metrics.savingsRate < 0.2) moves.push("Move savings, retirement, and emergency contributions toward 20% of income.");
  if (values.highInterestDebt > 0) moves.push(`Prioritize the ${formatMoney(values.highInterestDebt)} high-interest balance.`);
  if (metrics.debtLoad > 0.35) moves.push("Reduce total debt below 35% of annual income.");
  if (moves.length === 0) moves.push("Your core systems are strong. Keep contributions automatic.");
  return moves.slice(0, 3);
}

function budgetGoalMet(row: BudgetRow, value: number) {
  return row.kind === "expense" ? value <= row.target : value >= row.target;
}

function FinancialCityWorld({
  values,
  metrics,
  focus,
  reducedMotion,
}: {
  values: FinanceState;
  metrics: CityMetrics;
  focus: DistrictId;
  reducedMotion: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef(values);
  const metricsRef = useRef(metrics);
  const focusRef = useRef(focus);
  const reducedMotionRef = useRef(reducedMotion);
  const [loadState, setLoadState] = useState({ progress: 0, ready: false, failed: 0 });

  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { metricsRef.current = metrics; }, [metrics]);
  useEffect(() => { focusRef.current = focus; }, [focus]);
  useEffect(() => { reducedMotionRef.current = reducedMotion; }, [reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const roadPlacementViolations = MODEL_SPECS.filter((spec) =>
      spec.id !== "foundation"
      && spec.id !== "underlay"
      && spec.id !== "trafficSignals"
      && !buildingFootprintClearsV7Roads(
        spec.position[0],
        spec.position[2],
        spec.footprint / 2,
        spec.footprint / 2,
      ),
    );
    host.dataset.buildingRoadViolations = String(roadPlacementViolations.length);
    host.dataset.buildingRoadViolationIds = roadPlacementViolations
      .map((spec) => spec.key ?? spec.id)
      .join(",");
    if (roadPlacementViolations.length > 0) {
      console.error(
        "Financial City rejected building placements that overlap a V7 road",
        roadPlacementViolations.map((spec) => spec.key ?? spec.id),
      );
    }

    let disposed = false;
    let frame = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb9dce8);
    const cityFog = new THREE.FogExp2(0xb9dce8, 0.0024);
    scene.fog = cityFog;

    const trafficQaTopDown =
      new URLSearchParams(window.location.search).get("trafficQa") === "top";
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
    camera.position.fromArray(
      trafficQaTopDown ? [0, 260, 0.01] : FOCUS.overview.camera,
    );
    if (trafficQaTopDown) camera.up.set(0, 0, -1);
    camera.lookAt(
      new THREE.Vector3().fromArray(
        trafficQaTopDown ? [0, 0, 0] : FOCUS.overview.target,
      ),
    );
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);
    const maxTextureAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = 38;
    controls.maxDistance = trafficQaTopDown ? 300 : 205;
    controls.minPolarAngle = trafficQaTopDown ? 0 : Math.PI * 0.16;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.target.fromArray(
      trafficQaTopDown ? [0, 0, 0] : FOCUS.overview.target,
    );
    controls.autoRotateSpeed = 0.22;

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x66746a, 2.4);
    scene.add(hemisphere);
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff2d6, 3.6);
    sun.position.set(-82, 120, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -105;
    sun.shadow.camera.right = 105;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.bias = -0.00025;
    scene.add(sun);
    const skyFill = new THREE.DirectionalLight(0xc5e6ff, 0.9);
    skyFill.position.set(80, 45, -65);
    scene.add(skyFill);

    const runtime = new Map<string, RuntimeModel>();
    const traffic: TrafficVehicle[] = [];
    const resources: THREE.Object3D[] = [];
    let infrastructureLoaded = 0;
    let infrastructureLoadFailures = 0;
    let infillLoaded = 0;
    let infillLoadFailures = 0;
    let trafficModelsLoaded = 0;
    let maxMeasuredTrafficWidth = 0;
    host.dataset.infrastructureExpected = String(
      CIVIC_INFRASTRUCTURE_SPECS.length,
    );
    host.dataset.infrastructureLoaded = "0";
    host.dataset.infrastructureLoadFailures = "0";
    host.dataset.infillExpected = String(INFILL_MODEL_SPECS.length);
    host.dataset.infillAnchorExpected = String(FINANCIAL_CITY_V9_INFILL.length);
    host.dataset.infillLoaded = "0";
    host.dataset.infillLoadFailures = "0";
    host.dataset.backgroundMode = "clear-color-only";
    host.dataset.activeInfillTier = getFinancialCityInfillTier(
      metricsRef.current,
    );
    host.dataset.trafficCalibration =
      FINANCIAL_CITY_V7_CALIBRATION.calibrationSource;
    host.dataset.trafficRoadWidth =
      FINANCIAL_CITY_V7_CALIBRATION.roadWidth.toFixed(3);
    host.dataset.trafficMeasuredFootprints = "true";
    host.dataset.trafficQaMode = trafficQaTopDown ? "top" : "production";
    host.dataset.trafficModelsLoaded = "0";
    host.dataset.maxMeasuredTrafficWidth = "0";
    const trafficRoutes = TRAFFIC_ROUTE_SPECS.map(({ anchors, kind }) => ({
      curve: new THREE.CatmullRomCurve3(
        anchors.map((anchor) => {
          const [x, z] = v7NormalizedPointToFoundationLocal(anchor);
          return new THREE.Vector3(x, TRAFFIC_SURFACE_Y, z);
        }),
        true,
        "centripetal",
      ),
      kind,
    }));
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      if (!disposed) setLoadState((current) => ({ ...current, progress: Math.round((loaded / Math.max(total, 1)) * 100) }));
    };
    manager.onLoad = () => {
      if (!disposed) setLoadState((current) => ({ ...current, progress: 100, ready: true }));
    };
    manager.onError = () => {
      if (!disposed) setLoadState((current) => ({ ...current, failed: current.failed + 1 }));
    };
    const loader = new GLTFLoader(manager);
    const modelTemplates = new Map<string, Promise<THREE.Group>>();
    const loadModelTemplate = (url: string) => {
      const existing = modelTemplates.get(url);
      if (existing) return existing;
      const request = new Promise<THREE.Group>((resolve, reject) => {
        loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
      });
      modelTemplates.set(url, request);
      return request;
    };
    host.dataset.uniqueMintModelExpected = String(
      new Set([
        ...MODEL_SPECS.map((spec) => spec.url),
        ...TRAFFIC_MODELS.map((spec) => spec.url),
      ]).size,
    );
    MODEL_SPECS.forEach((spec) => {
      loadModelTemplate(spec.url).then((template) => {
        if (disposed) return;
        const model = template.clone(true);
        model.rotation.y = spec.yaw ?? 0;
        model.updateMatrixWorld(true);
        const sourceBounds = new THREE.Box3().setFromObject(model);
        const sourceSize = sourceBounds.getSize(new THREE.Vector3());
        if (spec.id === "foundation") {
          // The approved Mint V7 foundation is authored flat in XY with local
          // +Z as its surface normal. Fit that complete, indivisible mesh once
          // to the established city footprint, then rotate it into Y-up.
          model.scale.set(
            FINANCIAL_CITY_V7_CALIBRATION.board.width / Math.max(sourceSize.x, 0.001),
            FINANCIAL_CITY_V7_CALIBRATION.board.depth / Math.max(sourceSize.y, 0.001),
            FINANCIAL_CITY_V7_CALIBRATION.board.surfaceY / Math.max(sourceSize.z, 0.001),
          );
          model.rotation.x = -Math.PI / 2;
        } else if (spec.id === "underlay") {
          // V8 is an independent Mint-authored Y-up plinth. Fit it to its own
          // measured contract and keep its top below V7's unchanged bottom.
          model.scale.set(
            FINANCIAL_CITY_IMPORT_CONTRACT.underlayTargetSize[0]
              / Math.max(sourceSize.x, 0.001),
            FINANCIAL_CITY_IMPORT_CONTRACT.underlayTargetHeight
              / Math.max(sourceSize.y, 0.001),
            FINANCIAL_CITY_IMPORT_CONTRACT.underlayTargetSize[1]
              / Math.max(sourceSize.z, 0.001),
          );
        } else {
          const sourceSpan = Math.max(sourceSize.x, sourceSize.z, 0.001);
          const scale = spec.footprint / sourceSpan;
          model.scale.setScalar(scale);
        }
        model.updateMatrixWorld(true);
        const fittedBounds = new THREE.Box3().setFromObject(model);
        const center = fittedBounds.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -fittedBounds.min.y, -center.z);

        const root = new THREE.Group();
        root.position.fromArray(spec.position);
        root.add(model);
        root.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = spec.id !== "clouds" && spec.id !== "haze";
            object.receiveShadow = spec.id !== "clouds" && spec.id !== "haze";
            if (spec.id === "foundation" || spec.id === "underlay") {
              const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
              materials.forEach((material) => {
                Object.values(material).forEach((value) => {
                  if (!(value instanceof THREE.Texture)) return;
                  value.anisotropy = maxTextureAnisotropy;
                  value.needsUpdate = true;
                });
              });
            }
            if (spec.id === "haze") {
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.forEach((material) => {
                material.transparent = true;
                material.opacity = 0.08;
                material.depthWrite = false;
                material.needsUpdate = true;
              });
            }
          }
        });

        if (spec.id === "horizon") root.scale.y = 0.62;
        const desiredScale = 1;
        const shown = modelSpecIsVisible(
          spec,
          valuesRef.current,
          metricsRef.current,
        );
        if (!shown) root.scale.multiplyScalar(0.001);
        runtime.set(spec.key ?? spec.id, { id: spec.id, root, desiredScale, shown });
        resources.push(root);
        scene.add(root);

        if (spec.id === "trafficSignals" || spec.id === "streetlights") {
          infrastructureLoaded += 1;
          host.dataset.infrastructureLoaded = String(infrastructureLoaded);
        }
        if (spec.id === "infill") {
          infillLoaded += 1;
          host.dataset.infillLoaded = String(infillLoaded);
        }
        if (spec.id === "underlay") {
          root.updateMatrixWorld(true);
          const underlayBounds = new THREE.Box3().setFromObject(root);
          const underlaySize = underlayBounds.getSize(new THREE.Vector3());
          host.dataset.underlayReady = "true";
          host.dataset.underlayWidth = underlaySize.x.toFixed(3);
          host.dataset.underlayDepth = underlaySize.z.toFixed(3);
          host.dataset.underlayBottomY = underlayBounds.min.y.toFixed(3);
          host.dataset.underlayTopY = underlayBounds.max.y.toFixed(3);
        }
      }).catch((error) => {
        if (spec.id === "underlay") host.dataset.underlayReady = "false";
        if (spec.id === "trafficSignals" || spec.id === "streetlights") {
          infrastructureLoadFailures += 1;
          host.dataset.infrastructureLoadFailures = String(
            infrastructureLoadFailures,
          );
        }
        if (spec.id === "infill") {
          infillLoadFailures += 1;
          host.dataset.infillLoadFailures = String(infillLoadFailures);
        }
        console.error(`Financial City could not load ${spec.id}`, error);
      });
    });

    TRAFFIC_MODELS.forEach((spec, modelIndex) => {
      loadModelTemplate(spec.url).then((sourceTemplate) => {
        if (disposed) return;
        const template = sourceTemplate.clone(true);
        template.rotation.y = spec.yawOffset;
        template.updateMatrixWorld(true);
        const sourceBounds = new THREE.Box3().setFromObject(template);
        const sourceSize = sourceBounds.getSize(new THREE.Vector3());
        template.scale.setScalar(spec.length / Math.max(sourceSize.x, sourceSize.z, 0.001));
        template.updateMatrixWorld(true);
        const fittedBounds = new THREE.Box3().setFromObject(template);
        const fittedSize = fittedBounds.getSize(new THREE.Vector3());
        trafficModelsLoaded += 1;
        maxMeasuredTrafficWidth = Math.max(
          maxMeasuredTrafficWidth,
          fittedSize.x,
        );
        host.dataset.trafficModelsLoaded = String(trafficModelsLoaded);
        host.dataset.maxMeasuredTrafficWidth =
          maxMeasuredTrafficWidth.toFixed(3);
        const center = fittedBounds.getCenter(new THREE.Vector3());
        template.position.set(-center.x, -fittedBounds.min.y, -center.z);
        template.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });

        for (let copyIndex = 0; copyIndex < 2; copyIndex += 1) {
          const root = new THREE.Group();
          root.add(template.clone(true));
          const compactVehicle = modelIndex < 4;
          const routeIndex = compactVehicle && copyIndex === 0
            ? 2 + (modelIndex % 2)
            : (modelIndex + copyIndex) % 2;
          const route = trafficRoutes[routeIndex];
          traffic.push({
            root,
            curve: route.curve,
            offset: (modelIndex / TRAFFIC_MODELS.length + copyIndex * 0.47) % 1,
            speed: spec.length > 7 ? 0.0065 : 0.009 + modelIndex * 0.00055,
            direction: routeIndex === 0 ? 1 : -1,
            index: modelIndex * 2 + copyIndex,
            clearance: Math.max(1.4, spec.length * 0.22),
            // Validate the actual corrected Mint mesh bounds. The previous
            // declared widths understated several exports, especially the bus.
            halfLength: fittedSize.z / 2 + 0.2,
            halfWidth: fittedSize.x / 2 + 0.2,
            routeKind: route.kind,
          });
          resources.push(root);
          scene.add(root);
        }
      }).catch((error) => {
        console.error("Financial City could not load a Mint traffic vehicle", error);
      });
    });

    const timer = new THREE.Timer();
    timer.connect(document);
    const cameraGoal = new THREE.Vector3().fromArray(FOCUS.overview.camera);
    const targetGoal = new THREE.Vector3().fromArray(FOCUS.overview.target);
    let lastFocus: DistrictId = "overview";
    let cameraTransition = false;

    const animate = (timestamp?: number) => {
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      const currentValues = valuesRef.current;
      const currentMetrics = metricsRef.current;
      const activeInfillTier = getFinancialCityInfillTier(currentMetrics);
      const motionOff = reducedMotionRef.current;
      controls.autoRotate = false;
      host.dataset.activeInfillTier = activeInfillTier;
      const vitality = currentMetrics.score / 100;
      renderer.toneMappingExposure = THREE.MathUtils.lerp(0.72, 1.08, vitality);
      hemisphere.intensity = THREE.MathUtils.lerp(1.15, 2.4, vitality);
      ambient.intensity = THREE.MathUtils.lerp(0.2, 0.45, vitality);
      sun.intensity = THREE.MathUtils.lerp(1.45, 3.6, vitality);
      cityFog.density = THREE.MathUtils.lerp(0.0046, 0.0024, vitality);

      if (focusRef.current !== lastFocus) {
        lastFocus = focusRef.current;
        cameraGoal.fromArray(FOCUS[lastFocus].camera);
        targetGoal.fromArray(FOCUS[lastFocus].target);
        cameraTransition = true;
      }

      const cameraBlend = motionOff ? 1 : 1 - Math.exp(-dt * 2.4);
      if (cameraTransition) {
        camera.position.lerp(cameraGoal, cameraBlend);
        controls.target.lerp(targetGoal, cameraBlend);
        if (camera.position.distanceToSquared(cameraGoal) < 0.08 && controls.target.distanceToSquared(targetGoal) < 0.04) {
          cameraTransition = false;
        }
      }

      let visibleInfill = 0;
      runtime.forEach((entry, key) => {
        const spec = MODEL_SPECS_BY_KEY.get(key);
        const intended = spec
          ? modelSpecIsVisible(spec, currentValues, currentMetrics)
          : shouldShow(entry.id, currentValues, currentMetrics);
        entry.shown = Boolean(intended);
        if (entry.id === "infill" && intended) visibleInfill += 1;
        const baseYScale = entry.id === "horizon" ? 0.62 : 1;
        const targetScale = intended ? 1 : 0.001;
        const blend = motionOff ? 1 : 1 - Math.exp(-dt * 4.8);
        entry.root.scale.x = THREE.MathUtils.lerp(entry.root.scale.x, targetScale, blend);
        entry.root.scale.y = THREE.MathUtils.lerp(entry.root.scale.y, targetScale * baseYScale, blend);
        entry.root.scale.z = THREE.MathUtils.lerp(entry.root.scale.z, targetScale, blend);
        entry.root.visible = entry.root.scale.x > 0.008;
      });
      host.dataset.visibleInfill = String(visibleInfill);
      const infillOverlapViolations = getVisibleInfillOverlapViolations(
        currentValues,
        currentMetrics,
      );
      host.dataset.infillOverlapViolations = String(
        infillOverlapViolations.length,
      );
      host.dataset.infillOverlapViolationIds =
        infillOverlapViolations.join(",");

      const haze = runtime.get("haze")?.root;
      if (haze && !motionOff) haze.position.x = 28 + Math.sin(elapsed * 0.045) * 7;

      const activeTraffic = Math.max(1, Math.round(1 + currentMetrics.trafficActivity * 11));
      let trafficRoadViolations = 0;
      let visibleTraffic = 0;
      let visibleInternalTraffic = 0;
      let visiblePerimeterTraffic = 0;
      traffic.forEach((vehicle) => {
        vehicle.root.visible = vehicle.index < activeTraffic;
        if (!vehicle.root.visible) return;
        const travel = motionOff ? vehicle.offset : (vehicle.offset + elapsed * vehicle.speed * (0.45 + currentMetrics.trafficActivity)) % 1;
        const progress = vehicle.direction === 1 ? travel : 1 - travel;
        const position = vehicle.curve.getPointAt(progress);
        const tangent = vehicle.curve.getTangentAt(progress).multiplyScalar(vehicle.direction);
        const yaw = Math.atan2(tangent.x, tangent.z);
        if (!trafficFootprintIsOnV7Road(
          position.x,
          position.z,
          yaw,
          vehicle.halfLength,
          vehicle.halfWidth,
        )) {
          trafficRoadViolations += 1;
          vehicle.root.visible = false;
          return;
        }
        if (!trafficPointIsClear(position, vehicle.clearance, currentValues, currentMetrics)) {
          vehicle.root.visible = false;
          return;
        }
        vehicle.root.position.copy(position);
        vehicle.root.rotation.y = yaw;
        visibleTraffic += 1;
        if (vehicle.routeKind === "internal") visibleInternalTraffic += 1;
        else visiblePerimeterTraffic += 1;
      });
      host.dataset.trafficRoadViolations = String(trafficRoadViolations);
      host.dataset.visibleTraffic = String(visibleTraffic);
      host.dataset.visibleInternalTraffic = String(visibleInternalTraffic);
      host.dataset.visiblePerimeterTraffic = String(visiblePerimeterTraffic);

      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      timer.dispose();
      controls.dispose();
      const disposedGeometries = new Set<THREE.BufferGeometry>();
      const disposedMaterials = new Set<THREE.Material>();
      const disposedTextures = new Set<THREE.Texture>();
      resources.forEach((root) => {
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          if (!disposedGeometries.has(object.geometry)) {
            disposedGeometries.add(object.geometry);
            object.geometry.dispose();
          }
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (disposedMaterials.has(material)) return;
            disposedMaterials.add(material);
            Object.values(material).forEach((value) => {
              if (
                value instanceof THREE.Texture
                && !disposedTextures.has(value)
              ) {
                disposedTextures.add(value);
                value.dispose();
              }
            });
            material.dispose();
          });
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="fc-world" ref={hostRef} aria-label="Interactive 3D model of Financial City">
      {!loadState.ready && (
        <div className="fc-loader" role="status" aria-live="polite">
          <span className="fc-kicker">Assembling your city</span>
          <strong>{loadState.progress}%</strong>
          <div className="fc-load-track"><i style={{ width: `${loadState.progress}%` }} /></div>
          <small>Loading Mint-authored city assets</small>
        </div>
      )}
      {loadState.failed > 0 && <p className="fc-load-error">{loadState.failed} city assets could not be loaded.</p>}
    </div>
  );
}

export default function FinancialCity() {
  const [values, setValues] = useState<FinanceState>(DEFAULT_FINANCES);
  const [hydrated, setHydrated] = useState(false);
  const [focus, setFocus] = useState<DistrictId>("overview");
  const [panelOpen, setPanelOpen] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const metrics = useMemo(() => calculateMetrics(values), [values]);
  const infillTier = getFinancialCityInfillTier(metrics);
  const nextMoves = useMemo(() => getNextMoves(values, metrics), [values, metrics]);
  const effectiveFocus = districtIsAvailable(focus, values, metrics) ? focus : "overview";
  const monthlyAllocated = values.income - metrics.surplus;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setValues({ ...DEFAULT_FINANCES, ...JSON.parse(saved) });
      } catch (error) {
        console.warn("Financial City could not restore the local plan", error);
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  }, [hydrated, values]);

  const update = (key: keyof FinanceState, value: number) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === "debt" && next.highInterestDebt > value) next.highInterestDebt = value;
      if (key === "highInterestDebt" && value > next.debt) next.debt = value;
      return next;
    });
  };

  return (
    <main className="fc-app">
      <FinancialCityWorld
        values={values}
        metrics={metrics}
        focus={effectiveFocus}
        reducedMotion={reducedMotion}
      />

      <header className="fc-header">
        <div>
          <Link className="fc-brand" href="/financial-city" aria-label="Financial City home">
            <span>FC</span>
            <div><strong>Financial City</strong><small>Metropolitan Ledger</small></div>
          </Link>
          <p className="fc-mint-credit">City assets created with Mint</p>
        </div>
        <div className="fc-header-actions">
          <button className="fc-text-button" onClick={() => setReducedMotion((value) => !value)} aria-pressed={reducedMotion}>
            Motion {reducedMotion ? "off" : "on"}
          </button>
          <button className="fc-plan-toggle" onClick={() => setPanelOpen((value) => !value)} aria-expanded={panelOpen}>
            {panelOpen ? "Hide plan" : "Edit plan"}
          </button>
        </div>
      </header>

      <section className={`fc-score-card is-stage-${metrics.stage}`} aria-label="City resilience summary">
        <div className="fc-score-ring" style={{ "--fc-score": `${metrics.score * 3.6}deg` } as React.CSSProperties}>
          <strong>{metrics.score}</strong><small>/ 100</small>
        </div>
        <div>
          <span className="fc-kicker">City resilience · stage {metrics.stage} of 5</span>
          <h1>{metrics.phase}</h1>
          <p>{metrics.goalMatch >= 0.9 ? `${metrics.goalsMet}/${BUDGET_ROWS.length} goals aligned · traffic flowing.` : `${metrics.goalsMet}/${BUDGET_ROWS.length} goals aligned · city activity is slowing.`}</p>
          <div className="fc-stage-track" aria-label={`City progress ${metrics.score} out of 100`}>
            <i style={{ width: `${metrics.score}%` }} />
          </div>
          <small className="fc-stage-next">
            {metrics.nextStageScore === null ? "Peak city condition reached" : `${metrics.nextStageScore - metrics.score} points to the next city stage`}
          </small>
          <small className={`fc-building-stock is-${infillTier}`}>
            Building stock · {infillTier === "deferred"
              ? "maintenance deferred"
              : infillTier === "luxury"
                ? "renovated luxury"
                : "balanced"}
          </small>
        </div>
      </section>

      <nav className={`fc-district-nav ${panelOpen ? "is-panel-open" : ""}`} aria-label="Explore city districts">
        {DISTRICTS.map((district) => (
          <button
            key={district.id}
            className={effectiveFocus === district.id ? "is-active" : ""}
            disabled={!districtIsAvailable(district.id, values, metrics)}
            title={districtIsAvailable(district.id, values, metrics) ? undefined : `${district.label} district unlocks as this plan improves`}
            onClick={() => setFocus(district.id)}
          >
            {district.label}
          </button>
        ))}
      </nav>

      <section className={`fc-plan ${panelOpen ? "is-open" : ""}`} aria-label="Financial plan controls">
        <div className="fc-plan-heading">
          <div><span className="fc-kicker">$10K monthly plan</span><h2>Budget sheet</h2></div>
          <span className={`fc-surplus ${metrics.surplus < 0 ? "is-negative" : ""}`}>
            {metrics.surplus >= 0 ? "+" : ""}{formatMoney(metrics.surplus)}<small>monthly room</small>
          </span>
        </div>

        <div className="fc-presets" aria-label="Budget scenarios">
          {Object.entries(PRESETS).map(([name, preset]) => (
            <button key={name} onClick={() => setValues({ ...preset })}>{name}</button>
          ))}
        </div>

        <div className="fc-metrics">
          <div><span>Budget match</span><strong>{Math.round(metrics.goalMatch * 100)}%</strong></div>
          <div><span>Goals met</span><strong>{metrics.goalsMet} / {BUDGET_ROWS.length}</strong></div>
          <div><span>Safety runway</span><strong>{metrics.emergencyMonths.toFixed(1)} mo</strong></div>
        </div>

        <div className="fc-income-control">
          <span><strong>Monthly income</strong><small>Reference goal {formatMoney(10000)}</small></span>
          <label className="fc-money-entry">
            <span aria-hidden="true">$</span>
            <input
              aria-label="Monthly income"
              type="number"
              min={0}
              max={1000000}
              step={100}
              value={values.income}
              onChange={(event) => update("income", Math.max(0, Number(event.target.value)))}
            />
          </label>
        </div>

        <div className="fc-budget-sheet">
          <div className="fc-budget-columns" aria-hidden="true"><span>Category</span><span>Goal</span><span>Actual</span></div>
          {BUDGET_ROWS.map((row) => {
            const met = budgetGoalMet(row, values[row.key]);
            const difference = Math.abs(values[row.key] - row.target);
            return (
              <div className={`fc-budget-row ${met ? "is-met" : "is-missed"}`} key={row.key}>
                <span className="fc-budget-name">{row.label}<small>{met ? "Goal met" : `${formatMoney(difference)} ${row.kind === "expense" ? "over" : "short"}`}</small></span>
                <output>{formatMoney(row.target)}</output>
                <label className="fc-money-entry fc-money-entry--compact">
                  <span aria-hidden="true">$</span>
                  <input
                    aria-label={`${row.label} actual`}
                    type="number"
                    min={0}
                    max={row.max * 10}
                    step={row.step}
                    value={values[row.key]}
                    onChange={(event) => update(row.key, Math.max(0, Number(event.target.value)))}
                  />
                </label>
              </div>
            );
          })}
          <div className="fc-budget-total">
            <span>Monthly allocated</span><strong>{formatMoney(monthlyAllocated)}</strong>
            <span>Remaining</span><strong className={metrics.surplus < 0 ? "is-negative" : ""}>{formatMoney(metrics.surplus)}</strong>
          </div>
        </div>

        <details className="fc-balance-sheet">
          <summary>Balance sheet <span>Fund and debt balances</span></summary>
          <div className="fc-fields">
          {BALANCE_FIELDS.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <span className="fc-money-entry">
                <span aria-hidden="true">$</span>
                <input
                  aria-label={field.label}
                  type="number"
                  min={0}
                  max={field.max * 10}
                  step={field.step}
                  value={values[field.key]}
                  onChange={(event) => update(field.key, Math.max(0, Number(event.target.value)))}
                />
              </span>
            </label>
          ))}
          </div>
        </details>

        <div className="fc-next-moves">
          <span className="fc-kicker">Next moves</span>
          <ol>{nextMoves.map((move) => <li key={move}>{move}</li>)}</ol>
        </div>
        <p className="fc-local-note"><span aria-hidden="true">●</span> Saved only in this browser. Your financial data never leaves this device.</p>
      </section>

      <p className="fc-camera-help">Drag to orbit · Scroll to zoom</p>
    </main>
  );
}

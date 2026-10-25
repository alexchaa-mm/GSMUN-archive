import assert from "node:assert/strict";
import test from "node:test";
import {
  buildingFootprintClearsV7Roads,
  FINANCIAL_CITY_V7_CALIBRATION,
  v7NormalizedPointToFoundationLocal,
} from "../app/financialCityV7Calibration.ts";
import { FINANCIAL_CITY_MINT_ASSETS } from "../app/financialCityMintAssets.ts";

test("V8 civic infrastructure derives every placement from V7 normalized anchors", () => {
  assert.equal(FINANCIAL_CITY_V7_CALIBRATION.normalizedIntersections.length, 4);
  assert.equal(FINANCIAL_CITY_V7_CALIBRATION.normalizedSidewalkAnchors.length, 4);

  for (const anchor of [
    ...FINANCIAL_CITY_V7_CALIBRATION.normalizedIntersections,
    ...FINANCIAL_CITY_V7_CALIBRATION.normalizedSidewalkAnchors,
  ]) {
    assert.ok(anchor[0] >= -0.5 && anchor[0] <= 0.5);
    assert.ok(anchor[1] >= -0.5 && anchor[1] <= 0.5);
  }

  assert.deepEqual(
    FINANCIAL_CITY_V7_CALIBRATION.normalizedIntersections.map(
      v7NormalizedPointToFoundationLocal,
    ),
    FINANCIAL_CITY_V7_CALIBRATION.intersections,
  );
  assert.deepEqual(
    FINANCIAL_CITY_V7_CALIBRATION.normalizedSidewalkAnchors.map(
      v7NormalizedPointToFoundationLocal,
    ),
    FINANCIAL_CITY_V7_CALIBRATION.sidewalkAnchors,
  );

  for (const [x, z] of FINANCIAL_CITY_V7_CALIBRATION.sidewalkAnchors) {
    assert.equal(
      buildingFootprintClearsV7Roads(x, z, 2.2, 2.2),
      true,
      `streetlight pair at ${x}, ${z} must clear every V7 road`,
    );
  }
});

test("active Mint infrastructure loads from durable Mint CDN artifacts", () => {
  assert.match(
    FINANCIAL_CITY_MINT_ASSETS.infrastructure.trafficSignals,
    /^https:\/\/cdn\.mint\.gg\/glb\/intersection-traffic-signals-normalized-[0-9a-f]{16}\.glb$/,
  );
  assert.match(
    FINANCIAL_CITY_MINT_ASSETS.infrastructure.streetlights,
    /^https:\/\/cdn\.mint\.gg\/glb\/civic-streetlight-pair-normalized-[0-9a-f]{16}\.glb$/,
  );
});

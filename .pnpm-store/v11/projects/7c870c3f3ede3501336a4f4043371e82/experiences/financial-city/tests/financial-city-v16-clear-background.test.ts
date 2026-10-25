import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FINANCIAL_CITY_MINT_ASSETS } from "../app/financialCityMintAssets.ts";

const FINANCIAL_CITY_SOURCE = new URL(
  "../app/FinancialCity.tsx",
  import.meta.url,
);

test("V16 has no runtime background asset family", () => {
  assert.equal("backdrops" in FINANCIAL_CITY_MINT_ASSETS, false);
});

test("V16 renders only a clear color behind the unchanged city board", () => {
  const source = readFileSync(FINANCIAL_CITY_SOURCE, "utf8");
  assert.match(source, /backgroundMode = "clear-color-only"/);
  assert.doesNotMatch(source, /SparkRenderer|SplatMesh|citySky|cityscapeWorld/);
  assert.doesNotMatch(source, /Place the splat|Splat placement controls/);
});

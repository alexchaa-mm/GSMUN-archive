import assert from "node:assert/strict";
import test from "node:test";
import {
  FINANCIAL_CITY_IMPORT_CONTRACT,
  FINANCIAL_CITY_MINT_ASSETS,
} from "../app/financialCityMintAssets.ts";

test("V8 placement contract keeps the plinth strictly below unchanged V7", () => {
  assert.deepEqual(FINANCIAL_CITY_IMPORT_CONTRACT.cityTargetSize, [176, 153]);
  assert.deepEqual(FINANCIAL_CITY_IMPORT_CONTRACT.underlayTargetSize, [184, 161]);
  assert.equal(FINANCIAL_CITY_IMPORT_CONTRACT.underlayTargetHeight, 2.5);
  assert.equal(FINANCIAL_CITY_IMPORT_CONTRACT.underlayTopY, -0.02);
  assert.equal(
    FINANCIAL_CITY_IMPORT_CONTRACT.underlayTopY
      - FINANCIAL_CITY_IMPORT_CONTRACT.underlayTargetHeight,
    -2.52,
  );
  assert.match(
    FINANCIAL_CITY_MINT_ASSETS.foundation.underlay,
    /^https:\/\/cdn\.mint\.gg\/glb\/chamfered-ledger-plinth-normalized-[0-9a-f]{16}\.glb$/,
  );
});

test("V7 and V8 canonical Mint GLBs use durable CDN URLs", () => {
  assert.match(
    FINANCIAL_CITY_MINT_ASSETS.foundation.city,
    /^https:\/\/cdn\.mint\.gg\/glb\/financial-city-v7-street-line-overlay-normalized-61829dc1381e78d9\.glb$/,
  );
  assert.match(
    FINANCIAL_CITY_MINT_ASSETS.foundation.underlay,
    /^https:\/\/cdn\.mint\.gg\/glb\/chamfered-ledger-plinth-normalized-32f36f487869ba04\.glb$/,
  );
});

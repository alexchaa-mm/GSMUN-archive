import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FINANCIAL_CITY_MINT_ASSETS } from "../app/financialCityMintAssets.ts";

const packageRoot = new URL("../", import.meta.url);

const collectStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
};

test("the published capsule uses only registered Mint CDN model artifacts", async () => {
  const registry = JSON.parse(
    await readFile(new URL("mint-assets.json", packageRoot), "utf8"),
  ) as {
    assets: Record<
      string,
      { artifacts: Record<string, { runtimeUrl: string }> }
    >;
  };
  const sourceUrls = new Set(collectStrings(FINANCIAL_CITY_MINT_ASSETS));
  const registryUrls = new Set(
    Object.values(registry.assets).flatMap((asset) =>
      Object.values(asset.artifacts).map((artifact) => artifact.runtimeUrl),
    ),
  );

  assert.equal(sourceUrls.size, 44);
  assert.equal(registryUrls.size, 44);
  assert.deepEqual(sourceUrls, registryUrls);
  for (const url of sourceUrls) {
    assert.match(
      url,
      /^https:\/\/cdn\.mint\.gg\/glb\/.+-normalized-[0-9a-f]{16}\.glb$/,
    );
  }
});

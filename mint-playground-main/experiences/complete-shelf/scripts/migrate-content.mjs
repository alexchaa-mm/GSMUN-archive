// Retired importer: it used to seed demo images and publish automatically.
// There is deliberately no network/database client or credential access here.
if (process.argv.includes("--apply") || process.argv.includes("--resume")) {
  throw new Error("Legacy migration is disabled. Review .local/catalog-import-v1-no-demo/ and obtain separate approval for its guarded draft-only import and artwork upload. Do not rerun the schema migration.");
}
console.log("Inspection only: use the existing review bundle .local/catalog-import-v1-no-demo/.");
console.log("8 books, 8 archives, 32 draft chapters, 24 artwork assets, zero photos. No SQL, uploads or publication performed.");

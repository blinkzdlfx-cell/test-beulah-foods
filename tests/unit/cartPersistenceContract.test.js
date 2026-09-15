import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cartSource = await readFile(
  new URL("../../storefront/js/services/cartService.js", import.meta.url),
  "utf8",
);

test("cart database writes are serialized", () => {
  assert.match(cartSource, /let databasePersistenceQueue = Promise\.resolve\(\);/);
  assert.match(cartSource, /databasePersistenceQueue = databasePersistenceQueue\.then\(task, task\)/);
});

test("cart persistence snapshots each mutation before database synchronization", () => {
  assert.match(cartSource, /const snapshot = items\.map\(normalizeItem\);/);
  assert.match(cartSource, /\{ cart_items: snapshot \}/);
});

test("stale database responses cannot overwrite newer local cart mutations", () => {
  assert.match(cartSource, /let cartMutationVersion = 0;/);
  assert.match(cartSource, /cartMutationVersion \+= 1;/);
  assert.match(cartSource, /if \(mutationVersion === cartMutationVersion\) return saveCart\(databaseItems\);/);
});

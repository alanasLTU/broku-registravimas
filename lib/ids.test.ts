import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asUuid, isUuid } from "./ids.ts";

describe("asUuid", () => {
  it("keeps a valid UUID", () => {
    const id = "ecb3c1de-c045-4a7a-949a-292616eff13b";
    assert.equal(asUuid(id), id);
    assert.equal(isUuid(id), true);
  });

  it("replaces capture draft id new-issue so Postgres does not reject it", () => {
    const id = asUuid("new-issue");
    assert.notEqual(id, "new-issue");
    assert.equal(isUuid(id), true);
  });

  it("replaces legacy- prefixed ids", () => {
    const id = asUuid("legacy-abc");
    assert.equal(isUuid(id), true);
  });

  it("generates a UUID when value is empty", () => {
    assert.equal(isUuid(asUuid("")), true);
    assert.equal(isUuid(asUuid(null)), true);
    assert.equal(isUuid(asUuid(undefined)), true);
  });
});

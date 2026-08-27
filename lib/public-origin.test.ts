import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUsablePublicOrigin, resolvePublicOrigin } from "./public-origin.ts";

describe("public origin", () => {
  it("rejects 0.0.0.0 which cannot be opened on a phone", () => {
    assert.equal(isUsablePublicOrigin("http://0.0.0.0:3010"), false);
    assert.equal(isUsablePublicOrigin("http://127.0.0.1:3010"), true);
    assert.equal(isUsablePublicOrigin("http://192.168.1.184:3010"), true);
  });

  it("prefers the browser origin over a 0.0.0.0 request URL", () => {
    const request = new Request("http://0.0.0.0:3010/api/projects/share-link", {
      method: "POST",
    });
    assert.equal(
      resolvePublicOrigin(request, "http://192.168.1.184:3010"),
      "http://192.168.1.184:3010",
    );
  });
});

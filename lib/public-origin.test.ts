import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isShareablePublicOrigin, isUsablePublicOrigin, resolvePublicOrigin } from "./public-origin.ts";

describe("public origin", () => {
  it("rejects 0.0.0.0 which cannot be opened on a phone", () => {
    assert.equal(isUsablePublicOrigin("http://0.0.0.0:3010"), false);
    assert.equal(isUsablePublicOrigin("http://127.0.0.1:3010"), true);
    assert.equal(isUsablePublicOrigin("http://192.168.1.184:3010"), true);
  });

  it("does not treat loopback as a client share link", () => {
    assert.equal(isShareablePublicOrigin("http://localhost:3000"), false);
    assert.equal(isShareablePublicOrigin("http://127.0.0.1:3010"), false);
    assert.equal(isShareablePublicOrigin("https://broku-registravimas.vercel.app"), true);
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

  it("ignores a localhost APP_URL when the request is on Vercel", () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    try {
      const request = new Request("https://broku-registravimas.vercel.app/api/projects/share-link", {
        method: "POST",
        headers: {
          host: "broku-registravimas.vercel.app",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(
        resolvePublicOrigin(request, "http://localhost:3000"),
        "https://broku-registravimas.vercel.app",
      );
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = previous;
    }
  });
});

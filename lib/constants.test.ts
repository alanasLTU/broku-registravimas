import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClientRecordType,
  isProjectCompleted,
  isRecordType,
  normalizeProjectStatus,
  normalizeStatus,
} from "./constants.ts";

describe("record types", () => {
  it("allows staff types including Užduotis", () => {
    assert.equal(isRecordType("Užduotis"), true);
    assert.equal(isRecordType("Brokas"), true);
  });

  it("does not allow clients to pick Užduotis", () => {
    assert.equal(isClientRecordType("Užduotis"), false);
    assert.equal(isClientRecordType("Brokas"), true);
    assert.equal(isClientRecordType("Apimtis"), true);
    assert.equal(isClientRecordType("Papildoma apimtis"), true);
  });
});

describe("record status", () => {
  it("maps legacy statuses", () => {
    assert.equal(normalizeStatus("Uždaryta"), "Baigtas");
    assert.equal(normalizeStatus("Perduota"), "Planuojamas");
    assert.equal(normalizeStatus("Vykdoma"), "Vykdoma");
  });
});

describe("project status", () => {
  it("treats unknown values as Vykdomas", () => {
    assert.equal(normalizeProjectStatus(undefined), "Vykdomas");
    assert.equal(normalizeProjectStatus("Kita"), "Vykdomas");
    assert.equal(normalizeProjectStatus("Baigtas"), "Baigtas");
  });

  it("marks completed projects by status or archived flag", () => {
    assert.equal(isProjectCompleted({ status: "Baigtas" }), true);
    assert.equal(isProjectCompleted({ archived: true, status: "Vykdomas" }), true);
    assert.equal(isProjectCompleted({ status: "Vykdomas", archived: false }), false);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { bootMessage } from "./index.mjs";

test("bootMessage returns a non-empty startup string", () => {
  assert.equal(typeof bootMessage(), "string");
  assert.ok(bootMessage().length > 0);
});

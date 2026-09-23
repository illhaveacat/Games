import { test } from "node:test";
import assert from "node:assert/strict";
import { createDialogueRequest, createDialogueResponse } from "./index.mjs";

test("createDialogueRequest 返回 speakerId/text", () => {
  const req = createDialogueRequest({ speakerId: "npc-1", text: "你好" });
  assert.deepEqual(req, { speakerId: "npc-1", text: "你好" });
});

test("createDialogueRequest 拒绝空 text", () => {
  assert.throws(() => createDialogueRequest({ speakerId: "npc-1", text: "" }), /text 不能为空/);
});

test("createDialogueResponse 返回 speakerId/text/timestamp", () => {
  const res = createDialogueResponse({ speakerId: "npc-1", text: "你好", timestamp: 1700000000000 });
  assert.deepEqual(res, { speakerId: "npc-1", text: "你好", timestamp: 1700000000000 });
});

test("createDialogueResponse 拒绝空 speakerId", () => {
  assert.throws(() => createDialogueResponse({ speakerId: "", text: "你好" }), /speakerId 不能为空/);
});

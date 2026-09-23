import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDialogueRequest,
  createDialogueResponse,
  createQuest,
  createQuestProgress,
  createPlayerProgress,
  getLevelForXp,
  LEVEL_THRESHOLDS,
} from "./index.js";

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

test("createQuest 返回完整字段", () => {
  const quest = createQuest({
    id: "quest-order-coffee",
    npcId: "npc-barista",
    title: "点一杯咖啡",
    completionCriteria: "用英语完成点单对话",
    rewardXp: 50,
    rewardPoints: 10,
  });
  assert.deepEqual(quest, {
    id: "quest-order-coffee",
    npcId: "npc-barista",
    title: "点一杯咖啡",
    completionCriteria: "用英语完成点单对话",
    rewardXp: 50,
    rewardPoints: 10,
  });
});

test("createQuest 拒绝空 title 与负数奖励", () => {
  const base = {
    id: "q1",
    npcId: "npc-1",
    title: "t",
    completionCriteria: "c",
    rewardXp: 10,
    rewardPoints: 5,
  };
  assert.throws(() => createQuest({ ...base, title: "" }), /title 不能为空/);
  assert.throws(() => createQuest({ ...base, rewardXp: -1 }), /rewardXp 必须是不小于 0 的数字/);
  assert.throws(() => createQuest({ ...base, rewardPoints: -1 }), /rewardPoints 必须是不小于 0 的数字/);
});

test("createQuestProgress 默认 status 为 not_started", () => {
  const progress = createQuestProgress({ questId: "quest-order-coffee" });
  assert.deepEqual(progress, { questId: "quest-order-coffee", status: "not_started" });
});

test("createQuestProgress 接受合法 status，拒绝非法 status", () => {
  const inProgress = createQuestProgress({ questId: "q1", status: "in_progress" });
  assert.equal(inProgress.status, "in_progress");
  assert.throws(
    () => createQuestProgress({ questId: "q1", status: "done" as never }),
    /status 必须是 not_started\/in_progress\/completed 之一/,
  );
});

test("getLevelForXp 边界：刚好达到阈值、超过、不足", () => {
  assert.equal(getLevelForXp(0), 1);
  assert.equal(getLevelForXp(99), 1, "不足下一级阈值仍是当前等级");
  assert.equal(getLevelForXp(100), 2, "刚好达到阈值即升级");
  assert.equal(getLevelForXp(101), 2, "超过阈值但未达下一级");
  assert.equal(getLevelForXp(249), 2);
  assert.equal(getLevelForXp(250), 3);
  assert.equal(getLevelForXp(999), 4);
  assert.equal(getLevelForXp(1000), 5, "达到最高档阈值");
  assert.equal(getLevelForXp(999999), 5, "超过最高档阈值后维持最高等级");
});

test("getLevelForXp 拒绝负数", () => {
  assert.throws(() => getLevelForXp(-1), /xp 必须是不小于 0 的数字/);
});

test("LEVEL_THRESHOLDS 按 level 升序且从 0 开始", () => {
  assert.equal(LEVEL_THRESHOLDS[0].minXp, 0);
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) {
    assert.ok(LEVEL_THRESHOLDS[i].minXp > LEVEL_THRESHOLDS[i - 1].minXp);
    assert.equal(LEVEL_THRESHOLDS[i].level, LEVEL_THRESHOLDS[i - 1].level + 1);
  }
});

test("createPlayerProgress 默认值与 level 由 xp 派生", () => {
  const fresh = createPlayerProgress();
  assert.deepEqual(fresh, { level: 1, xp: 0, points: 0, completedQuestIds: [] });

  const leveled = createPlayerProgress({ xp: 250, points: 30, completedQuestIds: ["q1", "q2"] });
  assert.deepEqual(leveled, { level: 3, xp: 250, points: 30, completedQuestIds: ["q1", "q2"] });
});

test("createPlayerProgress 拒绝负数与非字符串数组", () => {
  assert.throws(() => createPlayerProgress({ xp: -1 }), /xp 必须是不小于 0 的数字/);
  assert.throws(() => createPlayerProgress({ points: -1 }), /points 必须是不小于 0 的数字/);
  assert.throws(
    () => createPlayerProgress({ completedQuestIds: [1 as unknown as string] }),
    /completedQuestIds 必须是字符串数组/,
  );
});

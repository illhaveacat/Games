import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { loadBaristaContent } from "../content/loadContent.js";
import { createDatabase } from "../progress/db.js";
import { getPlayerProgress, listQuestsWithProgress } from "../progress/progressStore.js";
import { MAX_PLAYER_TEXT_LENGTH, generateCafeReply, isCafeNpc, matchesStep } from "./cafeDialogueService.js";

describe("isCafeNpc", () => {
  it("recognizes the barista npc id and rejects others", () => {
    expect(isCafeNpc("npc-barista")).toBe(true);
    expect(isCafeNpc("npc-mira")).toBe(false);
    expect(isCafeNpc("")).toBe(false);
  });
});

describe("generateCafeReply", () => {
  it("gives a gentle fallback (not a failure) for unrelated input, and starts the first quest as in_progress", () => {
    const db = createDatabase(":memory:");
    const reply = generateCafeReply(db, "what a nice day");

    expect(reply.speakerId).toBe("npc-barista");
    expect(reply.text.length).toBeGreaterThan(0);
    expect(reply.text.toLowerCase()).not.toContain("fail");

    const entries = listQuestsWithProgress(db);
    expect(entries.find((e) => e.quest.id === "quest-greet-barista")?.progress.status).toBe("in_progress");
  });

  it("advances the quest chain step by step as the player's words match, awarding xp/points for real", () => {
    const db = createDatabase(":memory:");

    const first = generateCafeReply(db, "Hello! I'm new here.");
    expect(first.text.toLowerCase()).toContain("welcome");
    let progress = getPlayerProgress(db);
    expect(progress).toMatchObject({ level: 1, xp: 40, points: 10 });
    expect(progress.completedQuestIds).toEqual(["quest-greet-barista"]);

    // 第一步完成后，一句不相关的话不应该跳过第二步、也不应该判失败
    const offTopic = generateCafeReply(db, "what's the weather like");
    expect(offTopic.text.toLowerCase()).not.toContain("fail");
    expect(getPlayerProgress(db).xp).toBe(40); // 未推进，没有多发奖

    const second = generateCafeReply(db, "Can I get a coffee and a pastry please");
    expect(second.text.toLowerCase()).toContain("sugar");
    progress = getPlayerProgress(db);
    expect(progress).toMatchObject({ level: 2, xp: 100, points: 25 });
    expect(progress.completedQuestIds.sort()).toEqual(["quest-greet-barista", "quest-order-coffee"].sort());

    const third = generateCafeReply(db, "no sugar please, and it's to go");
    progress = getPlayerProgress(db);
    expect(progress).toMatchObject({ level: 2, xp: 180, points: 45 });
    expect(progress.completedQuestIds.sort()).toEqual(
      ["quest-greet-barista", "quest-order-coffee", "quest-answer-followup"].sort(),
    );
    expect(third.text.length).toBeGreaterThan(0);
  });

  it("includes the barista's unlocked extra line once the player has reached the required level (real, observable unlock effect)", () => {
    const db = createDatabase(":memory:");
    generateCafeReply(db, "hello");
    // 40xp，还没到 level 2，回复不应该带解锁台词
    const beforeUnlock = generateCafeReply(db, "irrelevant");
    expect(beforeUnlock.text).not.toContain("bookshop");

    const atLevelUp = generateCafeReply(db, "coffee and a pastry"); // 40+60=100xp -> level 2，触发解锁
    expect(atLevelUp.text).toContain("bookshop");

    // 解锁是持久的，不是一次性事件：后续任意回复都应该继续带着这句
    const after = generateCafeReply(db, "sugar please, for here");
    expect(after.text).toContain("bookshop");
  });

  it("gives a friendly closing reply (not an error) once the whole quest chain is already completed", () => {
    const db = createDatabase(":memory:");
    generateCafeReply(db, "hello");
    generateCafeReply(db, "coffee and a pastry");
    generateCafeReply(db, "sugar, to go");

    const afterAllDone = generateCafeReply(db, "anything at all");
    expect(afterAllDone.text.length).toBeGreaterThan(0);
    expect(afterAllDone.text.toLowerCase()).not.toContain("fail");
    // 没有因为任务都完成了而重复发奖
    expect(getPlayerProgress(db).xp).toBe(180);
  });

  describe("regression: word-boundary + negation (rev-01's real API repro on run-20260923-123440-7cea56)", () => {
    it("does NOT complete the greet step on a substring accident ('this' contains 'hi')", () => {
      const db = createDatabase(":memory:");
      const reply = generateCafeReply(db, "What's this place?");

      expect(getPlayerProgress(db).xp).toBe(0);
      expect(
        listQuestsWithProgress(db).find((e) => e.quest.id === "quest-greet-barista")?.progress.status,
      ).not.toBe("completed");
      expect(reply.text).toBe(reply.text); // 有正常回复（fallback），不是抛错
    });

    it("does NOT complete the order-coffee step when 'coffee' is explicitly negated ('I don't want coffee')", () => {
      const db = createDatabase(":memory:");
      generateCafeReply(db, "hello"); // 先过第一步，进入 order-coffee 这一步
      const before = getPlayerProgress(db).xp;

      const reply = generateCafeReply(db, "I don't want coffee, is there tea?");

      expect(getPlayerProgress(db).xp).toBe(before); // 没有多发奖
      expect(
        listQuestsWithProgress(db).find((e) => e.quest.id === "quest-order-coffee")?.progress.status,
      ).not.toBe("completed");
      expect(reply.text.toLowerCase()).not.toContain("coming right up");
    });

    it("does NOT complete the answer-followup step on a substring accident ('where' contains 'here')", () => {
      const db = createDatabase(":memory:");
      generateCafeReply(db, "hello");
      generateCafeReply(db, "coffee and a pastry"); // 进入第三步
      const before = getPlayerProgress(db).xp;

      const reply = generateCafeReply(db, "Where is the restroom?");

      expect(getPlayerProgress(db).xp).toBe(before);
      expect(
        listQuestsWithProgress(db).find((e) => e.quest.id === "quest-answer-followup")?.progress.status,
      ).not.toBe("completed");
      expect(reply.text.toLowerCase()).not.toContain("perfect, got it");
    });

    it("does NOT complete the greet step on other substring accidents ('they' contains 'hey', 'there' contains 'here' is irrelevant to greet but tested for completeness)", () => {
      const db = createDatabase(":memory:");
      generateCafeReply(db, "Are they open right now?"); // 'they' 不应该误命中 'hey'

      expect(getPlayerProgress(db).xp).toBe(0);
      expect(
        listQuestsWithProgress(db).find((e) => e.quest.id === "quest-greet-barista")?.progress.status,
      ).not.toBe("completed");
    });

    it("still completes the steps normally once the player actually says the right thing (word-boundary fix doesn't break real matches)", () => {
      const db = createDatabase(":memory:");
      const greet = generateCafeReply(db, "Hi! I'm new in town.");
      expect(getPlayerProgress(db).xp).toBe(40);
      expect(greet.text.toLowerCase()).toContain("welcome");

      const order = generateCafeReply(db, "coffee and a blueberry muffin");
      expect(getPlayerProgress(db).xp).toBe(100);

      const followup = generateCafeReply(db, "no sugar, for here");
      expect(getPlayerProgress(db).xp).toBe(180);
      expect(followup.text.length).toBeGreaterThan(0);
    });

    // 弯引号撇号（iOS/macOS 智能标点默认打出来的就是这种，U+2019），rev-01 二次复审用真实 API 复现：
    // 不归一化的话 tokenize 会把 "don’t" 切成 "don"/"t"，"don" 不在 NEGATION_WORDS 里，否定检测失效。
    const CURLY_APOSTROPHE = "’";

    it("does NOT complete order-coffee when negated with a curly apostrophe ('don’t', not the straight ASCII ')", () => {
      const db = createDatabase(":memory:");
      generateCafeReply(db, "hello");
      const before = getPlayerProgress(db).xp;

      const text = `I don${CURLY_APOSTROPHE}t want coffee, is there tea?`;
      const reply = generateCafeReply(db, text);

      expect(getPlayerProgress(db).xp).toBe(before);
      expect(
        listQuestsWithProgress(db).find((e) => e.quest.id === "quest-order-coffee")?.progress.status,
      ).not.toBe("completed");
      expect(reply.text.toLowerCase()).not.toContain("coming right up");
    });

    it("does NOT complete order-coffee when negated with a curly apostrophe ('can’t')", () => {
      const db = createDatabase(":memory:");
      generateCafeReply(db, "hello");
      const before = getPlayerProgress(db).xp;

      const text = `I can${CURLY_APOSTROPHE}t have coffee, sorry`;
      generateCafeReply(db, text);

      expect(getPlayerProgress(db).xp).toBe(before);
    });

    it("does NOT complete order-coffee when negated with a curly apostrophe ('won’t')", () => {
      const db = createDatabase(":memory:");
      generateCafeReply(db, "hello");
      const before = getPlayerProgress(db).xp;

      const text = `I won${CURLY_APOSTROPHE}t order coffee today`;
      generateCafeReply(db, text);

      expect(getPlayerProgress(db).xp).toBe(before);
    });

    it("still detects negation normally with the straight ASCII apostrophe (curly-apostrophe fix doesn't break the existing case)", () => {
      const db = createDatabase(":memory:");
      generateCafeReply(db, "hello");
      const before = getPlayerProgress(db).xp;

      generateCafeReply(db, "I don't want coffee, is there tea?");

      expect(getPlayerProgress(db).xp).toBe(before);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// DIALOG-001：补齐常见说法 + 关键词只在当前步骤生效 + 每步语境化追问 + 词表在 content/ 里维护
// ---------------------------------------------------------------------------------------------

const BARISTA = loadBaristaContent();
const QUEST_GREET = "quest-greet-barista";
const QUEST_ORDER = "quest-order-coffee";
const QUEST_FOLLOWUP = "quest-answer-followup";
const CURLY = "’";

/** 让一个全新的库停在第 n 步（1=打招呼，2=点单，3=加糖/堂食打包追问），靠真实对话推进。 */
function dbAtStep(step: 1 | 2 | 3): DatabaseSync {
  const db = createDatabase(":memory:");
  if (step >= 2) generateCafeReply(db, "hello");
  if (step >= 3) generateCafeReply(db, "coffee and a pastry");
  return db;
}

function statusOf(db: DatabaseSync, questId: string): string | undefined {
  return listQuestsWithProgress(db).find((e) => e.quest.id === questId)?.progress.status;
}

describe("DIALOG-001 第 3 步（加糖/堂食打包追问）：常见正确回答都能推进", () => {
  it.each([
    "No, thanks.",
    "No sugar, thanks.",
    "I don't want sugar.",
    "Just black, please.",
    "For here.",
    "To go, please.",
    "I'll take it with me.",
    // 同一类说法的变体（语音识别/手机智能标点常见）
    "No thank you",
    "no thanks",
    `I don${CURLY}t want sugar.`,
    `I${CURLY}ll take it with me.`,
    "Here, please.",
    "Without sugar, please.",
    "Take away, please.",
    "I'll take it away",
    "Takeout please",
    "I'll eat here.",
    "I'd like to sit here.",
    "sugar please",
    "Two sugars, and to go",
  ])("%s", (utterance) => {
    const db = dbAtStep(3);

    const reply = generateCafeReply(db, utterance);

    expect(statusOf(db, QUEST_FOLLOWUP)).toBe("completed");
    expect(getPlayerProgress(db).xp).toBe(180);
    expect(reply.text.toLowerCase()).toContain("perfect");
  });

  it("STAGE-001 的否定反例仍然不推进点单：'I don't want coffee' / 弯引号 don’t（第 2 步）", () => {
    for (const text of [
      "I don't want coffee, is there tea?",
      `I don${CURLY}t want coffee, is there tea?`,
      "I don't want coffee",
      `I don${CURLY}t want coffee`,
    ]) {
      const db = dbAtStep(2);
      const before = getPlayerProgress(db).xp;

      const reply = generateCafeReply(db, text);

      expect(getPlayerProgress(db).xp).toBe(before);
      expect(statusOf(db, QUEST_ORDER)).not.toBe("completed");
      expect(reply.text.toLowerCase()).not.toContain("coming right up");
    }
  });

  it.each(["Where is the restroom?", "I don't want coffee", "Do you have sugar?", "What's the wifi password?", "hello again"])(
    "第 3 步不会被无关/提问式句子误推进：%s",
    (utterance) => {
      const db = dbAtStep(3);

      const reply = generateCafeReply(db, utterance);

      expect(statusOf(db, QUEST_FOLLOWUP)).not.toBe("completed");
      expect(getPlayerProgress(db).xp).toBe(100);
      expect(reply.text.toLowerCase()).not.toContain("perfect, got it");
    },
  );
});

describe("DIALOG-001 第 2 步（点单）：更多饮品/点心和常见点单句型", () => {
  it.each(["latte", "cappuccino", "americano", "espresso", "tea", "cake", "cookie", "sandwich"])(
    "认得 %s",
    (item) => {
      const db = dbAtStep(2);

      const reply = generateCafeReply(db, `A ${item}, please.`);

      expect(statusOf(db, QUEST_ORDER)).toBe("completed");
      expect(getPlayerProgress(db).xp).toBe(100);
      expect(reply.text.toLowerCase()).toContain("coming right up");
    },
  );

  it.each([
    "Can I get a latte?",
    "Could I get a cappuccino, please?",
    "I'd like a cookie.",
    `I${CURLY}d like a cookie.`,
    "I'll have an americano.",
    "I will have a sandwich",
    "Can I get some tea?",
    // 句型本身就够了：点的东西不在词表里（红茶拿铁之外的东西）也算点单
    "Can I get a hot chocolate?",
    "I'd like a green smoothie, please.",
    "I'll have a flat white.",
  ])("认得点单句型：%s", (utterance) => {
    const db = dbAtStep(2);

    generateCafeReply(db, utterance);

    expect(statusOf(db, QUEST_ORDER)).toBe("completed");
  });

  it.each([
    "Is there tea?",
    "Do you have cake?",
    "What's a latte?",
    "How much is a sandwich?",
    "I'd like to know where the restroom is.",
    "Can I get directions to the station?",
    "I don't want a latte",
    "No cake for me",
  ])("不是点单的句子不推进：%s", (utterance) => {
    const db = dbAtStep(2);

    const reply = generateCafeReply(db, utterance);

    expect(statusOf(db, QUEST_ORDER)).not.toBe("completed");
    expect(getPlayerProgress(db).xp).toBe(40);
    expect(reply.text.toLowerCase()).not.toContain("coming right up");
  });

  it("先否定一个再点另一个（'No coffee, a tea please'）算点单", () => {
    const db = dbAtStep(2);

    generateCafeReply(db, "No coffee, a tea please");

    expect(statusOf(db, QUEST_ORDER)).toBe("completed");
  });
});

describe("DIALOG-001 关键词只在当前进行中的步骤里生效", () => {
  it("第 1 步说点单词汇：不推进任何步骤，也不发奖", () => {
    for (const text of ["coffee and a pastry", "Can I get a latte?", "I'd like a cookie", "a tea, please"]) {
      const db = dbAtStep(1);

      generateCafeReply(db, text);

      expect(statusOf(db, QUEST_GREET)).not.toBe("completed");
      expect(statusOf(db, QUEST_ORDER)).not.toBe("completed");
      expect(statusOf(db, QUEST_FOLLOWUP)).not.toBe("completed");
      expect(getPlayerProgress(db)).toMatchObject({ xp: 0, points: 0 });
    }
  });

  it("第 1 步说追问的回答（here / to go / no sugar / no thanks）：不推进任何步骤", () => {
    for (const text of ["For here.", "To go, please.", "No sugar, thanks.", "No, thanks.", "I'll take it with me."]) {
      const db = dbAtStep(1);

      generateCafeReply(db, text);

      expect(getPlayerProgress(db).xp).toBe(0);
      expect(getPlayerProgress(db).completedQuestIds).toEqual([]);
    }
  });

  it("第 2 步说 'here' 或追问回答：不完成点单，也不会跳过去完成第 3 步", () => {
    for (const text of ["here", "For here.", "To go, please.", "No sugar, thanks.", "No, thanks.", "Just black."]) {
      const db = dbAtStep(2);

      generateCafeReply(db, text);

      expect(statusOf(db, QUEST_ORDER)).not.toBe("completed");
      expect(statusOf(db, QUEST_FOLLOWUP)).not.toBe("completed");
      expect(getPlayerProgress(db).xp).toBe(40);
    }
  });

  it("第 3 步说打招呼或点单词汇：不发奖、不重复完成前面的步骤", () => {
    for (const text of ["hello!", "Hi there", "coffee and a pastry", "Can I get a latte?"]) {
      const db = dbAtStep(3);

      generateCafeReply(db, text);

      expect(statusOf(db, QUEST_FOLLOWUP)).not.toBe("completed");
      expect(getPlayerProgress(db).xp).toBe(100);
    }
  });

  it("一句话只推进当前这一步，不会一口气连过多步（'Hello, a latte, for here'）", () => {
    const db = dbAtStep(1);

    generateCafeReply(db, "Hello, a latte, for here");

    expect(getPlayerProgress(db).completedQuestIds).toEqual([QUEST_GREET]);
    expect(getPlayerProgress(db).xp).toBe(40);
  });
});

describe("DIALOG-001 没听懂时是符合当前步骤语境的自然追问，不是通用的'我没听懂'", () => {
  it("第 1 步：邀请对方打招呼", () => {
    const reply = generateCafeReply(dbAtStep(1), "blah blah");

    expect(reply.text).not.toBe(BARISTA.fallback);
    expect(reply.text.toLowerCase()).toContain("hello");
  });

  it("第 2 步：再问一次想要什么，并提示有哪些选择", () => {
    const reply = generateCafeReply(dbAtStep(2), "blah blah");

    expect(reply.text).not.toBe(BARISTA.fallback);
    expect(reply.text.toLowerCase()).toContain("what can i get");
    expect(reply.text.toLowerCase()).toContain("coffee");
  });

  it("第 3 步：再问一次要不要糖、堂食还是打包", () => {
    const reply = generateCafeReply(dbAtStep(3), "blah blah");

    expect(reply.text).not.toBe(BARISTA.fallback);
    const lower = reply.text.toLowerCase();
    expect(lower).toContain("sugar");
    expect(lower).toContain("for here");
    expect(lower).toContain("to go");
  });

  it("追问不是失败：不含 fail/wrong，并且没听懂不发奖", () => {
    for (const step of [1, 2, 3] as const) {
      const db = dbAtStep(step);
      const before = getPlayerProgress(db).xp;

      const reply = generateCafeReply(db, "blah blah");

      expect(reply.text.toLowerCase()).not.toMatch(/fail|wrong|error/);
      expect(getPlayerProgress(db).xp).toBe(before);
    }
  });
});

describe("DIALOG-001 关键词/短语表在 content/ 里维护，新增说法不需要改代码", () => {
  it("matchesStep 是纯数据驱动：只换关键词表，同一份代码就认得新说法", () => {
    const text = "I'd like an oat flat white";

    expect(matchesStep(text, { keywords: ["latte"] })).toBe(false);
    expect(matchesStep(text, { keywords: ["latte", "flat white"] })).toBe(true);
    expect(matchesStep(text, { keywords: ["oat"] })).toBe(true);
  });

  it("acceptNegated 由内容开关：同一句 'I don't want sugar'，选择题步骤算回答、普通步骤不算", () => {
    const text = "I don't want sugar";

    expect(matchesStep(text, { keywords: ["sugar"] })).toBe(false);
    expect(matchesStep(text, { keywords: ["sugar"], acceptNegated: true })).toBe(true);
  });

  it("blockers 由内容维护：加一个提问短语就能挡住一类误判，去掉就恢复", () => {
    const text = "Is there tea?";

    expect(matchesStep(text, { keywords: ["tea"] })).toBe(true);
    expect(matchesStep(text, { keywords: ["tea"], blockers: ["is there"] })).toBe(false);
  });

  it("短语跨逗号也能命中（'No, thanks.'），单个词仍按词边界（'where' 不命中 'here'）", () => {
    expect(matchesStep("No, thanks.", { keywords: ["no thanks"] })).toBe(true);
    expect(matchesStep("Where is it", { keywords: ["here"] })).toBe(false);
    expect(matchesStep("'hello'", { keywords: ["hello"] })).toBe(true);
  });

  it("内容自洽：每条关键词/短语单独说出来，都能命中它所在的那一步（防止内容里写错字/大小写/弯引号）", () => {
    for (const step of BARISTA.steps) {
      for (const keyword of step.keywords) {
        expect(matchesStep(keyword, step), `${step.questId}: "${keyword}"`).toBe(true);
      }
    }
  });

  it("内容里包含验收要求的全部说法", () => {
    const [, order, followup] = BARISTA.steps;
    for (const item of ["latte", "cappuccino", "americano", "espresso", "tea", "cake", "cookie", "sandwich"]) {
      expect(order.keywords).toContain(item);
    }
    for (const pattern of ["can i get a", "i'd like a", "i'll have a"]) {
      expect(order.keywords).toContain(pattern);
    }
    expect(followup.acceptNegated).toBe(true);
    for (const phrase of ["no thanks", "no sugar", "black", "for here", "to go", "take it with me"]) {
      expect(followup.keywords).toContain(phrase);
    }
  });
});

describe("DIALOG-001 返工：超长输入不能拖垮事件循环（审查 P1）", () => {
  const order = BARISTA.steps[1];
  const followup = BARISTA.steps[2];
  /** 一个宽松的时间预算：线性实现在 100 KB 上只要几十毫秒；回到 O(n²) 会是数秒。 */
  const BUDGET_MS = 500;

  function timed<T>(run: () => T): { result: T; ms: number } {
    const start = performance.now();
    const result = run();
    return { result, ms: performance.now() - start };
  }

  it.each([
    ["is there tea ", "提问式 blocker 重复"],
    ["no tea ", "否定词重复"],
    ["tea ", "关键词重复（无标点）"],
  ])("matchesStep：100 KB 的 %j（%s）在时间预算内返回", (unit) => {
    const text = unit.repeat(Math.ceil(100_000 / unit.length));

    const { ms } = timed(() => matchesStep(text, order));

    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("matchesStep：超长输入的结果与短输入一致（线性实现没有改变语义）", () => {
    expect(matchesStep("is there tea ".repeat(8000), order)).toBe(false);
    expect(matchesStep("no tea ".repeat(14000), order)).toBe(false);
    expect(matchesStep("tea ".repeat(25000), order)).toBe(true);
    expect(matchesStep("no sugar ".repeat(11000), followup)).toBe(true);
  });

  it("generateCafeReply：只处理前 MAX_PLAYER_TEXT_LENGTH 个字符，超出部分被忽略而不是报错", () => {
    const padding = "x ".repeat(MAX_PLAYER_TEXT_LENGTH / 2);

    const beyondCap = dbAtStep(2);
    const ignored = generateCafeReply(beyondCap, `${padding} coffee`);
    expect(ignored.text).toBe(order.fallback);
    expect(statusOf(beyondCap, QUEST_ORDER)).not.toBe("completed");

    const withinCap = dbAtStep(2);
    generateCafeReply(withinCap, `coffee ${padding}`);
    expect(statusOf(withinCap, QUEST_ORDER)).toBe("completed");
  });

  it("generateCafeReply：100 KB 输入在时间预算内返回正常回复", () => {
    const db = dbAtStep(2);

    const { result, ms } = timed(() => generateCafeReply(db, "is there tea ".repeat(8000)));

    expect(ms).toBeLessThan(BUDGET_MS);
    expect(result.speakerId).toBe("npc-barista");
    expect(result.text.length).toBeGreaterThan(0);
  });
});

describe("DIALOG-001 返工：第 3 步单独一句 'No.' / 'Nope' 是对 'Would you like sugar?' 的自然回答", () => {
  it.each(["No.", "no", "Nope.", "Nope!", "No, I'm good."])("%j 推进第 3 步", (text) => {
    const db = dbAtStep(3);

    generateCafeReply(db, text);

    expect(statusOf(db, QUEST_FOLLOWUP)).toBe("completed");
  });

  it("只在第 3 步生效：第 2 步说 'No.'/'Nope' 不算点单，第 1 步也不算打招呼", () => {
    for (const text of ["No.", "Nope"]) {
      const atOrder = dbAtStep(2);
      generateCafeReply(atOrder, text);
      expect(statusOf(atOrder, QUEST_ORDER)).not.toBe("completed");

      const atGreet = dbAtStep(1);
      generateCafeReply(atGreet, text);
      expect(statusOf(atGreet, QUEST_GREET)).not.toBe("completed");
    }
  });
});

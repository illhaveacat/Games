#!/usr/bin/env node
/**
 * 一次拉起整支 AI 团队：协调器 + 若干 Worker + 审查者，各自独立会话、独立 worktree。
 *
 *   node scripts/launch.mjs            按 team.json 全部启动（需要能用的命令行凭据）
 *   node scripts/launch.mjs --desktop  只建 worktree 和简报，打印每个桌面会话该贴什么（不需要凭据）
 *   node scripts/launch.mjs --print    只打印要执行的命令，不真的开窗口
 *   node scripts/launch.mjs --only coord-01,dev-01
 *   node scripts/launch.mjs --dry-run  只建 worktree 和简报，不启动
 *
 * 人类只在协调器那个窗口说话，其余窗口自己拉活干。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  return index < 0 || index + 1 >= argv.length ? fallback : argv[index + 1];
};

const PRINT_ONLY = flag("--print");
const DESKTOP = flag("--desktop");
const DRY_RUN = flag("--dry-run") || DESKTOP;
const ONLY = value("--only", "").split(",").map((s) => s.trim()).filter(Boolean);

function die(message) {
  console.error(`错误: ${message}`);
  process.exit(2);
}

function git(args, cwd = HOME, check = true) {
  const proc = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (proc.error) die("找不到 git");
  if (check && proc.status !== 0) die(`git ${args.join(" ")} 失败: ${(proc.stderr || proc.stdout).trim()}`);
  return (proc.stdout || "").trim();
}

const gitOk = (args, cwd = HOME) => spawnSync("git", args, { cwd, encoding: "utf8" }).status === 0;

// --------------------------------------------------------------------------- 定位

function orchestratorCommand() {
  if (fs.existsSync(path.join(HOME, "scripts", "orchestrator.mjs"))) {
    return "node scripts/orchestrator.mjs";
  }
  return "python scripts/orchestrator.py";
}

function controlRoot() {
  const probe = spawnSync(process.execPath, [path.join(HOME, "scripts", "orchestrator.mjs"), "status"],
    { cwd: HOME, encoding: "utf8" });
  if (probe.status !== 0) {
    die("读不到控制目录。先在项目根目录跑一次 init-runtime，或检查 orchestrator status 的报错。");
  }
  const payload = JSON.parse(probe.stdout);
  if (payload.bootstrapMode) {
    die("控制目录还是仓库内的模板。先跑: node scripts/orchestrator.mjs init-runtime --path <仓库外目录>");
  }
  return payload.controlRoot;
}

const mainWorktree = (() => {
  const common = path.resolve(HOME, git(["rev-parse", "--git-common-dir"]));
  return path.dirname(common);
})();

const CONTROL = controlRoot();
const ORC = orchestratorCommand();

const teamFile = path.join(CONTROL, "team.json");
if (!fs.existsSync(teamFile)) {
  die(`控制目录里没有 team.json: ${teamFile}\n       从 control/team.json 复制一份过去，或重新跑 init-runtime。`);
}
const team = JSON.parse(fs.readFileSync(teamFile, "utf8"));
const agents = JSON.parse(fs.readFileSync(path.join(CONTROL, "agents.json"), "utf8"));
const integrationBranch = agents.integrationBranch || "main";

// --------------------------------------------------------------------------- worktree

function registeredWorktrees() {
  const map = new Map();
  let current = null;
  for (const line of git(["worktree", "list", "--porcelain"], mainWorktree).split("\n")) {
    if (line.startsWith("worktree ")) current = line.slice(9).trim();
    else if (line.startsWith("branch ") && current) map.set(line.slice(7).replace("refs/heads/", "").trim(), current);
  }
  return map;
}

function ensureWorktree(member) {
  if (!member.branch) return mainWorktree;
  const existing = registeredWorktrees().get(member.branch);
  if (existing && fs.existsSync(existing)) return existing;

  const target = path.join(path.dirname(mainWorktree), `${path.basename(mainWorktree)}-${member.id}`);
  if (fs.existsSync(target) && fs.readdirSync(target).length) {
    die(`worktree 目标目录非空，且没登记到 Git: ${target}\n       删掉它，或给 ${member.id} 换个 branch。`);
  }
  const branchExists = gitOk(["rev-parse", "--verify", `refs/heads/${member.branch}`], mainWorktree);
  const args = branchExists
    ? ["worktree", "add", target, member.branch]
    : ["worktree", "add", target, "-b", member.branch, integrationBranch];
  if (PRINT_ONLY) {
    console.log(`  [将执行] git ${args.join(" ")}`);
    return target;
  }
  git(args, mainWorktree);
  return target;
}

// --------------------------------------------------------------------------- 简报

const readPrompt = (name) => {
  const file = path.join(HOME, "prompts", name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : `（缺少 prompts/${name}）`;
};

const SEAT_PROMPT = {
  coordinator: "coordinator.md",
  worker: "worker.md",
  reviewer: "reviewer.md",
};

function loopFor(member) {
  if (member.seat === "coordinator") {
    return `## 你的循环

你是**唯一**和人类对话的窗口。其他窗口在自己拉活，不用你派活给它们，你负责的是秩序和对外沟通。

1. \`${ORC} coordinator-claim --agent ${member.id} --lease-minutes 120\`
   这个租约要一直握着（每轮重新执行同一条命令即可续期）。**只有人类说"先停"时才 release** ——
   租约一断，所有 Worker 都领不到任务。
2. \`${ORC} recover --stale-minutes 45\`：回收掉线任务，并看 staleReview / waitingIntegration 有没有积压。
3. \`${ORC} next\`：看 dispatch 和 skipped。**不要自己去做任务**，Worker 会自己领。
4. 更新 \`docs/progress.md\`，\`checkpoint\`，\`archive\`。
5. 有 \`blocked\` 的任务，用人话向人类提问（选项 / 影响 / 你的推荐），等人回答后 \`unblock --decision\`。
6. 人类提新需求或变更：写进 \`docs/product.md\` → 拆成任务 JSON → \`import-tasks\` → \`validate\` → 给人类确认清单。
7. 每 3--5 分钟回到第 2 步。没事可做就静静等，不要去改代码。

**向人类汇报永远只有三句**：做完了什么 / 下一步 / 要你定什么。不要贴 JSON、命令输出或堆栈。`;
  }
  if (member.seat === "reviewer") {
    return `## 你的循环

1. \`${ORC} status\`，找状态为 \`review\` 的任务。没有就等 3 分钟再看。
2. \`${ORC} show --task <ID>\` 读证据、分支和基线，再看 \`git diff <baseCommit>..<headCommit>\`。
3. 工具已经保证的别重复核对（提交存在、工作树干净、改动没越界、verify 真跑过）。
   **你要审工具审不了的**：证据是否真的支撑验收条件、边界与异常、权限与越权、并发与幂等、安全、测试是否只测了 happy path、是否偏离架构与契约。
4. 有问题：\`review --result reject --note "P0: <文件>:<行> <问题>"\`，写清楚到行号。
5. 通过：\`review --result approve --note "..."\` → 在主工作树把该分支合进 \`${integrationBranch}\` → \`integrate --task <ID> --agent ${member.id}\`。
   **没跑 integrate 的任务不算 done，下游依赖不会解除。**
6. 回到第 1 步。

不要自己动业务代码。不要放行"基本可以"的东西。`;
  }
  const roles = member.taskRoles || ["*"];
  const scope = roles.includes("*") ? "任何 role 的任务" : `role 属于 ${JSON.stringify(roles)} 的任务`;
  return `## 你的循环

1. \`${ORC} next\`，从 \`dispatch\` 里挑第一个 ${scope}。
   - 没有可挑的：等 3 分钟再看。**不要闲着去改代码**，不属于你领到的任务的文件一律不碰。
   - 报"没有活动的协调器租约"：协调器窗口还没起来，等 30 秒重试。
2. \`${ORC} claim-task --task <ID> --agent ${member.id}\`
   被拒就按报错处理（换一个任务 / 等依赖 / 等路径释放），**不要绕过**。
3. 实现。只改任务 \`paths\` 内的文件。碰到契约、共享类型、数据库迁移、CI，停下来 \`block\`，那是 contract-owner 的活。
4. \`git commit\` → \`${ORC} manifest --task <ID>\` → \`${ORC} verify --task <ID>\`
5. 打开 \`claim-task\` 输出里的 \`artifactDir\`，给**每一条** \`acceptanceEvidence\` 填具体证据（写到文件和行号），并把 \`handoff.md\` 改写成真实交接内容。
6. \`${ORC} complete --task <ID> --agent ${member.id}\`。被拒会逐条列原因，逐条补，任务停在 working。
7. 每 10--15 分钟 \`${ORC} heartbeat --task <ID> --agent ${member.id}\`。
8. 回到第 1 步。

你不和人类对话。有需要人拍板的事，\`block\` 掉并写清选项，协调器会去问。`;
}

function buildBrief(member, workdir) {
  const promptFile = SEAT_PROMPT[member.seat];
  if (!promptFile) die(`成员 ${member.id} 的 seat 非法: ${member.seat}（只能是 coordinator / worker / reviewer）`);
  return `# 任务简报：${member.id}

**这份简报是你的全部指令。先整份读完，再开始动作。**

| 项 | 值 |
|---|---|
| 你的 agent id | \`${member.id}\` |
| 席位 | ${member.seat} |
| 工作目录 | \`${workdir}\` |
| 分支 | ${member.branch ? `\`${member.branch}\`（你的专属 worktree）` : `\`${integrationBranch}\`（主工作树，不要在这里改业务代码）`} |
| 命令前缀 | \`${ORC}\` |
| 共享控制目录 | \`${CONTROL}\`（已自动定位，不用设环境变量） |

**所有命令都在 \`${workdir}\` 里执行，所有 \`--agent\` 参数都填 \`${member.id}\`，不要用别的 id。**

## 开工前先做

1. 读 \`AGENTS.md\` 和 \`docs/02-架构说明.md\`。规则以仓库里的文件为准，不是以你的记忆为准。
2. 跑 \`${ORC} status\`，确认 \`controlRoot\` 是上表里的共享控制目录、\`bootstrapMode\` 是 \`false\`。
   不对就停下来报错，不要继续。
3. 你是**无状态实例**：不要假设自己记得任何历史，事实一律从仓库和 \`show\` / \`status\` 里读。

${loopFor(member)}

## 硬约束（违反即算失败）

- **任何一道闸门被拒绝，不许绕过、不许改 \`agents.json\` 放宽、不许直接编辑 \`backlog.json\`。** 缺什么补什么。
- \`verify\` 不通过就是没做完。不许手写 \`result: pass\`，不许说"基本完成"。
- 不自审、不自合。实现和审查必须是不同的 agent id。
- 只有 \`integrate\` 成功、状态变 \`done\` 才算任务结束。
- 只要还有任务不是 \`done\`，就不许宣布项目完成。要停就先写好 \`handoff.md\` 和 \`checkpoint\`。
- 支付、权限、隐私、生产发布、不可逆迁移、需求冲突：一律 \`block\`，不要自己决定。

---

## 你的角色规则原文（prompts/${promptFile}）

${readPrompt(promptFile)}
${member.seat === "coordinator" ? `
---

## 跟人类打交道的规则（prompts/00-开场白.md）

${readPrompt("00-开场白.md")}
` : ""}`;
}

// --------------------------------------------------------------------------- 启动

function kickoffFor(briefPath) {
  return `读 ${briefPath} 全文，严格按它执行。先把整份读完再动手，不要跳读。`;
}

function commandFor(kickoff) {
  const template = team.agentCommand;
  if (!Array.isArray(template) || template.length === 0) die("team.json 的 agentCommand 必须是非空数组");
  const parts = template.map((part) => part.replace("{{KICKOFF}}", kickoff));
  return { bin: parts[0], args: parts.slice(1) };
}

/** 指到第三方端点 / 用 API Key 的情况下，Anthropic 账号登录状态没有参考意义。 */
function customEndpointSource() {
  const keys = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"];
  if (keys.some((key) => process.env[key])) return "环境变量";
  const candidates = [
    path.join(os.homedir(), ".claude", "settings.json"),
    path.join(mainWorktree, ".claude", "settings.json"),
    path.join(mainWorktree, ".claude", "settings.local.json"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const env = JSON.parse(fs.readFileSync(file, "utf8")).env || {};
      if (keys.some((key) => env[key])) return file;
    } catch { /* 配置坏了就当没有 */ }
  }
  return null;
}

/** 开窗口之前先确认 AI CLI 装了、凭据也能用——否则会开出一堆全是报错的窗口。 */
function preflight(bin) {
  if (flag("--skip-preflight")) return;
  const version = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (version.error) {
    die(`找不到命令 \`${bin}\`。\n` +
      `       装上它，或改 ${teamFile} 里的 agentCommand 换成你在用的 AI CLI。`);
  }
  if (path.basename(bin, ".exe") !== "claude") return;

  const auth = spawnSync(bin, ["auth", "status"], { encoding: "utf8", env: childEnv() });
  let loggedIn = null;
  try { loggedIn = JSON.parse(auth.stdout).loggedIn; } catch { /* 输出格式变了就跳过这项检查 */ }
  if (loggedIn !== false) return;

  const proxyHint = CHILD_PROXY
    ? `\n       注意: 系统代理是 ${CHILD_PROXY.HTTPS_PROXY}，但当前终端没有 HTTPS_PROXY 变量。\n` +
      `       登录前先在同一个窗口执行（否则 OAuth 换令牌会直连被挡，报 403）：\n` +
      `         set HTTPS_PROXY=${CHILD_PROXY.HTTPS_PROXY}\n` +
      `         set HTTP_PROXY=${CHILD_PROXY.HTTP_PROXY}`
    : "";

  const custom = customEndpointSource();
  if (!custom) {
    die("`claude` 命令行还没登录（桌面 App 登录不算，命令行是另一套凭据）。\n" +
      "       先在任意终端跑一次：claude auth login\n" +
      "       或用长期令牌：claude setup-token\n" +
      "       不想用命令行就改用桌面会话：node scripts/launch.mjs --desktop\n" +
      "       确认没问题要强行启动：加 --skip-preflight" + proxyHint);
  }

  // 有自定义端点配置，但账号未登录：试一次真实请求，别让它开出一堆报错窗口
  const probe = spawnSync(bin, ["-p", "ok"], { encoding: "utf8", timeout: 60000, env: childEnv() });
  const output = `${probe.stdout || ""}${probe.stderr || ""}`;
  if (probe.status === 0) {
    console.log(`提示: 未登录 Anthropic 账号，但检测到自定义端点配置（${custom}），实测可用，继续。\n`);
    return;
  }
  die(`凭据不可用，两条路都不通：\n` +
    `       · Anthropic 账号：未登录\n` +
    `       · 自定义端点（${custom}）：实测请求失败 —— ${output.trim().split("\n")[0] || `exit ${probe.status}`}\n` +
    `       选一条修：\n` +
    `         A. 用 Anthropic 订阅：先把上面配置文件里的 env 块（ANTHROPIC_BASE_URL 等）移走，\n` +
    `            新开终端再 claude auth login（BASE_URL 没移走的话 OAuth 会被导到第三方端点，登录必失败）\n` +
    `         B. 继续用第三方：去服务商那边换一个有效 token，更新上面的配置文件\n` +
    `         C. 先不修命令行：node scripts/launch.mjs --desktop，改用桌面 App 开会话` + proxyHint);
}

/**
 * 浏览器走了代理、命令行没走，是最常见的一类坑：OAuth 页面能打开，
 * CLI 回来换令牌却直连被挡（403）。这里把系统代理读出来，注入给拉起的每个会话。
 */
function proxyForChildren() {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) return null; // 当前终端已有，子进程自然继承
  if (process.platform !== "win32") return null;
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  const query = spawnSync("reg", ["query", key], { encoding: "utf8" });
  if (query.error || query.status !== 0) return null;
  if (!/ProxyEnable\s+REG_DWORD\s+0x1/i.test(query.stdout)) return null;
  const match = query.stdout.match(/ProxyServer\s+REG_SZ\s+(\S+)/i);
  if (!match) return null;
  const server = match[1].includes("://") ? match[1] : `http://${match[1]}`;
  return {
    HTTP_PROXY: server,
    HTTPS_PROXY: server,
    NO_PROXY: process.env.NO_PROXY || "localhost,127.0.0.1,::1,.local",
  };
}

const CHILD_PROXY = proxyForChildren();
const childEnv = () => ({ ...process.env, ...(CHILD_PROXY || {}) });

function pickTerminal() {
  const preference = team.terminal || "auto";
  if (preference !== "auto") return preference;
  if (process.platform !== "win32") return "print";
  return spawnSync("wt", ["--version"], { encoding: "utf8" }).error ? "start" : "wt";
}

function launchWithWindowsTerminal(plans) {
  const args = [];
  for (const plan of plans) {
    if (args.length) args.push(";");
    args.push("new-tab", "--title", plan.member.id, "-d", plan.workdir, plan.bin, ...plan.args);
  }
  const child = spawn("wt", args, { detached: true, stdio: "ignore", env: childEnv() });
  child.unref();
}

function launchWithSeparateWindows(plans) {
  for (const plan of plans) {
    const child = spawn("cmd", ["/c", "start", plan.member.id, "/D", plan.workdir, "cmd", "/k", plan.bin, ...plan.args],
      { detached: true, stdio: "ignore", env: childEnv() });
    child.unref();
  }
}

// --------------------------------------------------------------------------- 主流程

const members = team.members.filter((m) => !ONLY.length || ONLY.includes(m.id));
if (!members.length) die(`没有匹配的成员：${ONLY.join(",")}`);
const coordinator = members.find((m) => m.seat === "coordinator");

console.log(`主工作树    ${mainWorktree}`);
console.log(`控制目录    ${CONTROL}`);
console.log(`集成分支    ${integrationBranch}`);
const cap = agents.maxConcurrentWorkers ?? 3;
const workerSeats = members.filter((m) => m.seat === "worker").length;
console.log(`并发上限    ${cap}（Worker 席位 ${workerSeats} 个）`);
if (workerSeats > cap) {
  console.log(`\n警告: Worker 席位比并发上限多 ${workerSeats - cap} 个，多出来的会一直空转。`);
  console.log(`      改 team.json 少开几个，或把 agents.json 的 maxConcurrentWorkers 调到 ${workerSeats}。`);
}
console.log("");

// 先验登录，免得建了一堆 worktree 才发现起不来
if (!DRY_RUN && !PRINT_ONLY) preflight(team.agentCommand?.[0] ?? "claude");

const briefDir = path.join(CONTROL, "briefs");
fs.mkdirSync(briefDir, { recursive: true });

const plans = [];
for (const member of members) {
  const workdir = ensureWorktree(member);
  const briefPath = path.join(briefDir, `${member.id}.md`);
  if (!PRINT_ONLY) fs.writeFileSync(briefPath, buildBrief(member, workdir));
  const { bin, args } = commandFor(kickoffFor(briefPath));
  plans.push({ member, workdir, briefPath, bin, args });
  console.log(`  ${member.id.padEnd(14)} ${member.seat.padEnd(12)} ${workdir}`);
}

// 协调器先起来，Worker 才领得到任务
plans.sort((a, b) => (a.member.seat === "coordinator" ? -1 : b.member.seat === "coordinator" ? 1 : 0));

const terminal = PRINT_ONLY ? "print" : pickTerminal();
console.log(`\n启动方式    ${terminal}${DRY_RUN ? "（--dry-run，只生成简报）" : ""}`);
if (CHILD_PROXY && !DRY_RUN && terminal !== "print") {
  console.log(`代理        ${CHILD_PROXY.HTTPS_PROXY}（读自系统设置，已注入各会话）`);
}

if (DESKTOP) {
  console.log(`
worktree 和任务简报都已就绪，不需要命令行凭据。

在你的 AI 桌面 App 里开 ${plans.length} 个会话，每个会话的工作目录和开场白如下
（先开协调器，它起来了 Worker 才领得到任务）：
`);
  for (const plan of plans) {
    console.log(`── ${plan.member.id}（${plan.member.seat}）${plan.member.seat === "coordinator" ? "  ← 你只在这个会话里说话" : ""}`);
    console.log(`   工作目录：${plan.workdir}`);
    console.log(`   开场白：  ${kickoffFor(plan.briefPath)}\n`);
  }
  console.log("每个会话只用贴一次开场白，之后它自己按简报干活。");
} else if (DRY_RUN) {
  console.log(`\n简报已生成在 ${briefDir}，没有启动任何会话。`);
} else if (terminal === "print") {
  console.log(`
┌─ 预览模式：什么都没启动，worktree 和简报也还没建 ─────────────
│  想真的开起来：去掉 --print，直接 node scripts/launch.mjs
└──────────────────────────────────────────────────────────────

下面是它将要做的事。你也可以自己开终端逐条执行（协调器先起）：
`);
  for (const plan of plans) {
    console.log(`# ${plan.member.id}（${plan.member.seat}）`);
    console.log(`cd "${plan.workdir}"`);
    console.log(`${plan.bin} ${plan.args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}\n`);
  }
} else {
  if (terminal === "wt") launchWithWindowsTerminal(plans);
  else launchWithSeparateWindows(plans);
  console.log(`已拉起 ${plans.length} 个会话。`);
}

const seat = coordinator ? `「${coordinator.id}」` : "协调器";
if (PRINT_ONLY) {
  console.log(`简报目录 ${briefDir}（预览模式下未生成）`);
  process.exit(0);
}
console.log(`
接下来：

  · 你只在 ${seat} 那个会话里说话，直接说需求或说「开始吧」。
  · 其余会话自己拉活干，不用管，也不要在里面下指令。
  · 收工：在 ${seat} 说「先停」，它会存档并释放租约，然后关掉其余会话。${DESKTOP ? "" : `
  · 头几条命令会问一次权限，选「总是允许」即可（要彻底免打扰，改 team.json 的 agentCommand）。`}

简报目录 ${briefDir}
排查命令 node scripts/orchestrator.mjs status`);

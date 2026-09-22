#!/usr/bin/env python3
"""多 Agent 项目协调层：可持久化的任务状态机（零依赖）。

事实来源：
  - 共享控制目录 AI_CONTROL_ROOT（backlog/state/agents/ownership + artifacts）
  - Git（分支、提交、diff）——完成与集成由 Git 事实判定，不采信 Agent 自述

并行 worktree 必须共用同一个仓库外的 AI_CONTROL_ROOT。
仓库内的 control/ 只是引导模板，任何写命令都会拒绝直接操作它。
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

UTC = timezone.utc
SCHEMA_VERSION = 2
HOME = Path(__file__).resolve().parents[1]
BOOTSTRAP = (HOME / "control").resolve()

# 占用路径锁（未合入集成分支前，这些路径不允许被其他任务领取）
ACTIVE = {"working", "review", "rework", "approved", "interrupted"}
CLAIMABLE = {"ready", "rework", "interrupted"}
STATUSES = {"ready", "working", "review", "rework", "approved", "done", "blocked", "interrupted"}
PLACEHOLDERS = {
    "", "TASK-ID", "RUN-ID", "run-YYYYMMDD-001", "agent-id", "agent/task-id",
    "commit-sha", "ISO-8601", "pass|fail", "TODO", "-",
}
SHA_RE = re.compile(r"^[0-9a-f]{7,40}$")


# --------------------------------------------------------------------------- 基础设施

def read_pointer(path: Path) -> Path | None:
    if not path.exists():
        return None
    try:
        target = json.loads(path.read_text(encoding="utf-8")).get("controlRoot")
    except json.JSONDecodeError:
        return None
    return Path(target).expanduser().resolve() if target else None


def main_worktree_pointer() -> Path | None:
    """worktree 里没有 RUNTIME.json（它不入库），回主工作树去找同一个指针。"""
    try:
        proc = subprocess.run(["git", "rev-parse", "--git-common-dir"], cwd=str(HOME),
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
    except OSError:
        return None
    if proc.returncode != 0:
        return None
    common = Path(proc.stdout.strip())
    if not common.is_absolute():
        common = (HOME / common).resolve()
    return read_pointer(common.parent / "control" / "RUNTIME.json")


def control_root() -> Path:
    """AI_CONTROL_ROOT > 本目录指针 > 主工作树指针 > 仓库内模板（只读）。"""
    env = os.environ.get("AI_CONTROL_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return read_pointer(BOOTSTRAP / "RUNTIME.json") or main_worktree_pointer() or BOOTSTRAP


CONTROL = control_root()
ARTIFACTS = CONTROL / "artifacts"


def now() -> datetime:
    return datetime.now(UTC)


def stamp(value: datetime | None = None) -> str:
    return (value or now()).isoformat().replace("+00:00", "Z")


def parse_time(value: str | None) -> datetime:
    return datetime.fromisoformat((value or "1970-01-01T00:00:00Z").replace("Z", "+00:00"))


@contextmanager
def mutex(timeout: int = 20, stale_seconds: int = 120):
    CONTROL.mkdir(parents=True, exist_ok=True)
    lock = CONTROL / ".state.lock"
    deadline = time.monotonic() + timeout
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"{os.getpid()} {stamp()}\n".encode())
            os.close(fd)
            break
        except FileExistsError:
            try:
                age = time.time() - lock.stat().st_mtime
            except FileNotFoundError:
                continue
            if age > stale_seconds:
                # 原子抢占：只有 rename 成功的进程才有权删除陈旧锁
                victim = CONTROL / f".state.lock.stale.{uuid.uuid4().hex}"
                try:
                    os.rename(lock, victim)
                    os.unlink(victim)
                    continue
                except OSError:
                    pass
            if time.monotonic() >= deadline:
                raise RuntimeError(f"状态锁未释放（{timeout}s 超时）: {lock}")
            time.sleep(0.2)
    try:
        yield
    finally:
        try:
            lock.unlink()
        except FileNotFoundError:
            pass


def load(name: str) -> dict:
    path = CONTROL / name
    if not path.exists():
        raise RuntimeError(f"缺少控制文件 {path}。先运行 init-runtime，或设置 AI_CONTROL_ROOT。")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{path} 不是合法 JSON: {exc}") from exc
    version = data.get("schemaVersion")
    if version is not None and version > SCHEMA_VERSION:
        raise RuntimeError(f"{name} schemaVersion={version} 高于本脚本支持的 {SCHEMA_VERSION}，请升级协调层")
    return data


def save(name: str, data: dict) -> None:
    path = CONTROL / name
    data["updatedAt"] = stamp()
    tmp = path.with_suffix(path.suffix + f".tmp{os.getpid()}")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def require_runtime() -> None:
    if CONTROL == BOOTSTRAP:
        raise RuntimeError(
            "拒绝写入仓库内的 control/ 模板目录。\n"
            "  先运行: orchestrator init-runtime --path <仓库外目录>\n"
            "  再设置: AI_CONTROL_ROOT=<该目录>（每个 worktree / Agent 都要设置）"
        )


def emit(payload) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


# --------------------------------------------------------------------------- Git

def git(*args: str, cwd: Path | None = None, check: bool = True) -> str:
    try:
        proc = subprocess.run(
            ["git", *args], cwd=str(cwd) if cwd else None,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
    except FileNotFoundError as exc:
        raise RuntimeError("找不到 git 可执行文件；本协调层以 Git 为事实来源") from exc
    if check and proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 失败: {(proc.stderr or proc.stdout).strip()}")
    return proc.stdout.strip()


def git_ok(*args: str, cwd: Path | None = None) -> bool:
    try:
        return subprocess.run(
            ["git", *args], cwd=str(cwd) if cwd else None, capture_output=True
        ).returncode == 0
    except FileNotFoundError as exc:
        raise RuntimeError("找不到 git 可执行文件") from exc


def repo_root() -> Path:
    """当前工作目录所属的 worktree 根目录（worktree 感知，不用脚本所在路径）。"""
    try:
        return Path(git("rev-parse", "--show-toplevel")).resolve()
    except RuntimeError as exc:
        raise RuntimeError(f"当前目录不在 Git worktree 内：{exc}") from exc


# --------------------------------------------------------------------------- 路径匹配

def _segments(value: str) -> list[str]:
    return [s for s in str(value).replace("\\", "/").split("/") if s not in ("", ".")]


def normalize_pattern(pattern: str) -> tuple[str, ...]:
    parts = _segments(pattern)
    if not parts:
        return ("**",)
    last = parts[-1]
    if last != "**" and "*" not in last and "." not in last:
        parts.append("**")  # 裸目录视为前缀
    return tuple(parts)


def _wild(token: str) -> bool:
    return "*" in token or "?" in token or "[" in token


def _token_intersect(left: str, right: str) -> bool:
    wl, wr = _wild(left), _wild(right)
    if not wl and not wr:
        return left == right
    if wl and not wr:
        return fnmatch.fnmatchcase(right, left)
    if wr and not wl:
        return fnmatch.fnmatchcase(left, right)
    return True  # 两侧都带通配符：保守判定为可能冲突


_INTER_MEMO: dict[tuple, bool] = {}


def _intersect(a: tuple[str, ...], b: tuple[str, ...]) -> bool:
    key = (a, b)
    if key in _INTER_MEMO:
        return _INTER_MEMO[key]
    if not a and not b:
        result = True
    elif not a:
        result = all(s == "**" for s in b)
    elif not b:
        result = all(s == "**" for s in a)
    elif a[0] == "**":
        result = _intersect(a[1:], b) or _intersect(a, b[1:])
    elif b[0] == "**":
        result = _intersect(a, b[1:]) or _intersect(a[1:], b)
    elif not _token_intersect(a[0], b[0]):
        result = False
    else:
        result = _intersect(a[1:], b[1:])
    _INTER_MEMO[key] = result
    return result


def patterns_intersect(left: str, right: str) -> bool:
    """两个 glob 是否可能命中同一个文件（保守：拿不准就算冲突）。"""
    return _intersect(normalize_pattern(left), normalize_pattern(right))


def paths_overlap(left: list[str], right: list[str]) -> bool:
    return any(patterns_intersect(a, b) for a in (left or []) for b in (right or []))


def _match(file_parts: list[str], pattern: tuple[str, ...]) -> bool:
    if not pattern:
        return not file_parts
    if pattern[0] == "**":
        if len(pattern) == 1:
            return True
        return any(_match(file_parts[i:], pattern[1:]) for i in range(len(file_parts) + 1))
    if not file_parts:
        return False
    return fnmatch.fnmatchcase(file_parts[0], pattern[0]) and _match(file_parts[1:], pattern[1:])


def path_matches(file_path: str, pattern: str) -> bool:
    """具体文件是否落在 glob 内（用于越界检查，判定必须精确）。"""
    return _match(_segments(file_path), normalize_pattern(pattern))


def file_allowed(file_path: str, patterns: list[str]) -> bool:
    return any(path_matches(file_path, p) for p in patterns or [])


# --------------------------------------------------------------------------- backlog 辅助

def tasks(backlog: dict) -> list[dict]:
    return backlog.setdefault("tasks", [])


def get_task(backlog: dict, task_id: str) -> dict:
    for task in tasks(backlog):
        if task.get("id") == task_id:
            return task
    raise RuntimeError(f"找不到任务: {task_id}")


def done_ids(backlog: dict) -> set[str]:
    """只有真正合入集成分支的任务才算依赖已满足。"""
    return {t["id"] for t in tasks(backlog) if t.get("status") == "done"}


def conflicting(backlog: dict, candidate: dict) -> list[str]:
    return [
        other["id"] for other in tasks(backlog)
        if other.get("id") != candidate.get("id")
        and other.get("status") in ACTIVE
        and paths_overlap(candidate.get("paths", []), other.get("paths", []))
    ]


def log_event(task: dict, event: str, agent: str | None = None, **extra) -> None:
    entry = {"at": stamp(), "event": event}
    if agent:
        entry["agent"] = agent
    entry.update({k: v for k, v in extra.items() if v is not None})
    history = task.setdefault("history", [])
    history.append(entry)
    del history[:-40]
    task["updatedAt"] = stamp()


def owner_patterns(ownership: dict, role: str) -> list[str]:
    return [p for o in ownership.get("owners", []) if o.get("role") == role for p in o.get("paths", [])]


def ownership_warnings(ownership: dict, task: dict) -> list[str]:
    """声明期的粗检（glob 对 glob，只提示）。真正的强制在 complete 时用具体文件判定。"""
    role = task.get("role")
    owned = owner_patterns(ownership, role)
    if not owned:
        return [f"任务 {task.get('id')} 的 role={role} 未在 ownership.json 中定义"]
    return [
        f"任务 {task.get('id')} 的路径 {pattern} 不在 role={role} 的所有权范围内"
        for pattern in task.get("paths", [])
        if not any(patterns_intersect(pattern, o) for o in owned)
    ]


def lease_guard(task: dict) -> None:
    expires = task.get("leaseExpiresAt")
    if expires and parse_time(expires) <= now():
        raise RuntimeError(
            f"租约已于 {expires} 过期，任务可能已被 recover 回收。先执行 heartbeat 或重新 claim-task。"
        )


# --------------------------------------------------------------------------- 命令：初始化 / 校验

def cmd_init_runtime(args) -> None:
    destination = Path(args.path).expanduser().resolve()
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError(f"目标非空，拒绝覆盖: {destination}")
    destination.mkdir(parents=True, exist_ok=True)
    for filename in ("agents.json", "ownership.json", "backlog.json", "state.json", "team.json"):
        shutil.copy2(BOOTSTRAP / filename, destination / filename)
    (destination / "artifacts").mkdir(exist_ok=True)
    (BOOTSTRAP / "RUNTIME.json").write_text(
        json.dumps({"controlRoot": str(destination), "createdAt": stamp()}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if not args.no_git:
        try:
            git("init", "-q", cwd=destination)
            git("add", "-A", cwd=destination)
            git("-c", "user.email=orchestrator@local", "-c", "user.name=orchestrator",
                "commit", "-q", "-m", "chore: 初始化协调层运行时", cwd=destination)
        except RuntimeError as exc:
            print(f"提示: 运行时目录未纳入 Git（{exc}）", file=sys.stderr)
    emit({
        "controlRoot": str(destination),
        "artifacts": str(destination / "artifacts"),
        "pointer": str(BOOTSTRAP / "RUNTIME.json"),
        "next": [
            f"每个 worktree / Agent 设置 AI_CONTROL_ROOT={destination}",
            "把 control/RUNTIME.json 加入 .gitignore（它是本机绝对路径）",
        ],
    })


def cmd_validate(_args) -> None:
    problems: list[str] = []
    warnings: list[str] = []
    backlog = load("backlog.json")
    ownership = load("ownership.json")
    agents = load("agents.json")
    all_tasks = tasks(backlog)

    seen: set[str] = set()
    for task in all_tasks:
        tid = task.get("id")
        if not tid:
            problems.append("存在没有 id 的任务")
            continue
        if tid in seen:
            problems.append(f"任务 id 重复: {tid}")
        seen.add(tid)
        if task.get("status") not in STATUSES:
            problems.append(f"{tid} 状态非法: {task.get('status')}")
        if not task.get("paths"):
            problems.append(f"{tid} 未声明 paths，无法做冲突与越界检查")
        if not task.get("acceptanceCriteria"):
            problems.append(f"{tid} 未声明 acceptanceCriteria，完成时无法验收")
        warnings.extend(ownership_warnings(ownership, task))

    index = {t.get("id"): t for t in all_tasks}
    for task in all_tasks:
        for dep in task.get("dependsOn", []) or []:
            if dep not in index:
                problems.append(f"{task.get('id')} 依赖不存在的任务 {dep}")

    # 依赖环检测
    color: dict[str, int] = {}

    def visit(node: str, trail: list[str]) -> None:
        if color.get(node) == 2:
            return
        if color.get(node) == 1:
            problems.append(f"依赖成环: {' -> '.join(trail + [node])}")
            return
        color[node] = 1
        for dep in index.get(node, {}).get("dependsOn", []) or []:
            if dep in index:
                visit(dep, trail + [node])
        color[node] = 2

    for tid in index:
        visit(tid, [])

    # 活动任务之间不得有路径交集
    active = [t for t in all_tasks if t.get("status") in ACTIVE]
    for i, left in enumerate(active):
        for right in active[i + 1:]:
            if paths_overlap(left.get("paths", []), right.get("paths", [])):
                problems.append(f"活动任务路径冲突: {left['id']} × {right['id']}")

    cap = agents.get("maxConcurrentWorkers", 3)
    working = [t["id"] for t in all_tasks if t.get("status") == "working"]
    if len(working) > cap:
        problems.append(f"在执行任务数 {len(working)} 超过并发上限 {cap}: {working}")

    emit({"controlRoot": str(CONTROL), "ok": not problems, "problems": problems, "warnings": warnings})
    if problems:
        sys.exit(1)


# --------------------------------------------------------------------------- 命令：协调器

def cmd_coordinator_claim(args) -> None:
    require_runtime()
    with mutex():
        state = load("state.json")
        holder = state.get("coordinator")
        if holder and parse_time(holder.get("leaseExpiresAt")) > now() and holder.get("agent") != args.agent:
            raise RuntimeError(f"协调器租约仍属于 {holder['agent']}，到期于 {holder['leaseExpiresAt']}")
        state["coordinator"] = {
            "agent": args.agent,
            "runId": str(uuid.uuid4()),
            "claimedAt": stamp(),
            "leaseExpiresAt": stamp(now() + timedelta(minutes=args.lease_minutes)),
        }
        save("state.json", state)
        emit(state["coordinator"])


def cmd_coordinator_release(args) -> None:
    require_runtime()
    with mutex():
        state = load("state.json")
        if (state.get("coordinator") or {}).get("agent") != args.agent:
            raise RuntimeError("只能释放自己的协调器租约")
        state["coordinator"] = None
        save("state.json", state)


def coordinator_alive(state: dict) -> bool:
    holder = state.get("coordinator")
    return bool(holder) and parse_time(holder.get("leaseExpiresAt")) > now()


# --------------------------------------------------------------------------- 命令：调度

def cmd_next(_args) -> None:
    backlog = load("backlog.json")
    agents = load("agents.json")
    completed = done_ids(backlog)
    cap = agents.get("maxConcurrentWorkers", 3)
    running = sum(1 for t in tasks(backlog) if t.get("status") == "working")
    free = max(cap - running, 0)
    chosen: list[dict] = []
    skipped: list[dict] = []

    for task in tasks(backlog):
        status = task.get("status")
        if status not in CLAIMABLE:
            if status in {"blocked", "review", "approved"}:
                skipped.append({"id": task["id"], "status": status, "reason": {
                    "blocked": f"等待人工裁决: {task.get('blockReason')}",
                    "review": "等待 Reviewer",
                    "approved": "等待合入集成分支（integrate）",
                }[status]})
            continue
        missing = [d for d in task.get("dependsOn", []) or [] if d not in completed]
        if missing:
            skipped.append({"id": task["id"], "reason": f"依赖未合入: {missing}"})
            continue
        clash = conflicting(backlog, task)
        if clash:
            skipped.append({"id": task["id"], "reason": f"路径被活动任务占用: {clash}"})
            continue
        inner = [c["id"] for c in chosen if paths_overlap(task.get("paths", []), c.get("paths", []))]
        if inner:
            skipped.append({"id": task["id"], "reason": f"与本轮已选任务路径冲突: {inner}"})
            continue
        if len(chosen) >= free:
            skipped.append({"id": task["id"], "reason": f"并发已满（{running}/{cap} 在执行）"})
            continue
        chosen.append(task)

    emit({
        "capacity": {"max": cap, "working": running, "free": free},
        "dispatch": [
            {"id": t["id"], "title": t.get("title"), "role": t.get("role"), "paths": t.get("paths"),
             "status": t.get("status"), "acceptanceCriteria": t.get("acceptanceCriteria", [])}
            for t in chosen
        ],
        "skipped": skipped,
    })


def cmd_claim(args) -> None:
    require_runtime()
    root = repo_root()
    branch = args.branch or git("rev-parse", "--abbrev-ref", "HEAD", cwd=root)
    if branch == "HEAD":
        raise RuntimeError("当前处于 detached HEAD；请先 git switch -c agent/<task-id>")
    base = git("rev-parse", "HEAD", cwd=root)
    if git("status", "--porcelain", cwd=root):
        raise RuntimeError("worktree 有未提交改动；领取任务前请保持干净的起点")

    with mutex():
        backlog = load("backlog.json")
        agents = load("agents.json")
        state = load("state.json")
        task = get_task(backlog, args.task)

        if task.get("status") not in CLAIMABLE:
            raise RuntimeError(f"任务当前不可领取: {task.get('status')}")
        missing = [d for d in task.get("dependsOn", []) or [] if d not in done_ids(backlog)]
        if missing:
            raise RuntimeError(f"依赖未完成（必须已合入集成分支）: {missing}")
        clash = conflicting(backlog, task)
        if clash:
            raise RuntimeError(f"路径与活动任务冲突: {clash}")

        cap = agents.get("maxConcurrentWorkers", 3)
        running = [t["id"] for t in tasks(backlog) if t.get("status") == "working" and t["id"] != task["id"]]
        if len(running) >= cap:
            raise RuntimeError(f"已达并发上限 {cap}，在执行: {running}")

        integration = agents.get("integrationBranch", "main")
        if branch == integration:
            raise RuntimeError(f"不能在集成分支 {integration} 上直接开发；请新建 worktree 与 agent/<task-id> 分支")

        if agents.get("requireCoordinatorLease", True) and not coordinator_alive(state):
            raise RuntimeError(
                "没有活动的协调器租约：任务必须由协调器分派。\n"
                "  协调器执行 coordinator-claim，或在 agents.json 设 requireCoordinatorLease=false（单人模式）"
            )

        holder = [t["id"] for t in tasks(backlog)
                  if t.get("branch") == branch and t["id"] != task["id"] and t.get("status") in ACTIVE]
        if holder:
            raise RuntimeError(f"分支 {branch} 已被任务 {holder} 占用，请为本任务新建 worktree/分支")

        problems = ownership_warnings(load("ownership.json"), task)
        run_id = f"run-{now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
        task.update({
            "status": "working",
            "assignee": args.agent,
            "runId": run_id,
            "branch": branch,
            "worktree": str(root),
            "baseCommit": base,
            "headCommit": None,
            "startedAt": stamp(),
            "heartbeatAt": stamp(),
            "leaseExpiresAt": stamp(now() + timedelta(minutes=args.lease_minutes)),
            "attempts": task.get("attempts", 0) + 1,
        })
        log_event(task, "claim", args.agent, branch=branch, baseCommit=base, runId=run_id)
        save("backlog.json", backlog)

    output = ARTIFACTS / task["id"] / run_id
    output.mkdir(parents=True, exist_ok=True)
    shutil.copy2(HOME / "templates" / "handoff.md", output / "handoff.md")
    write_manifest_scaffold(task, output / "manifest.json", args.agent, root)
    emit({
        "task": task["id"], "runId": run_id, "branch": branch, "baseCommit": base,
        "artifactDir": str(output),
        "manifest": str(output / "manifest.json"),
        "handoff": str(output / "handoff.md"),
        "acceptanceCriteria": task.get("acceptanceCriteria", []),
        "paths": task.get("paths", []),
        "ownershipWarnings": problems,
        "note": "完成前用 manifest 命令回填真实 commit / changedFiles / commands / acceptanceEvidence",
    })


def write_manifest_scaffold(task: dict, target: Path, agent: str, root: Path) -> None:
    base = task.get("baseCommit")
    head = git("rev-parse", "HEAD", cwd=root)
    changed = [f for f in git("diff", "--name-only", f"{base}..{head}", cwd=root).splitlines() if f.strip()] \
        if base and base != head else []
    payload = {
        "taskId": task["id"],
        "runId": task.get("runId"),
        "agent": agent,
        "branch": task.get("branch"),
        "baseCommit": base,
        "headCommit": head,
        "changedFiles": changed,
        "commands": [{"command": "", "result": "", "summary": ""}],
        "acceptanceEvidence": [{"criterion": c, "evidence": ""} for c in task.get("acceptanceCriteria", [])],
        "handoff": "handoff.md",
        "createdAt": stamp(),
    }
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cmd_manifest(args) -> None:
    """用当前 Git 事实刷新 manifest 的 commit / changedFiles，保留已填写的命令与验收证据。"""
    require_runtime()
    root = repo_root()
    backlog = load("backlog.json")
    task = get_task(backlog, args.task)
    run_id = task.get("runId")
    if not run_id:
        raise RuntimeError("任务没有 runId，请先 claim-task")
    target = ARTIFACTS / task["id"] / run_id / "manifest.json"
    existing = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
    base = task.get("baseCommit")
    head = git("rev-parse", "HEAD", cwd=root)
    changed = [f for f in git("diff", "--name-only", f"{base}..{head}", cwd=root).splitlines() if f.strip()]
    existing.update({
        "taskId": task["id"], "runId": run_id, "agent": task.get("assignee"),
        "branch": task.get("branch"), "baseCommit": base, "headCommit": head,
        "changedFiles": changed, "handoff": "handoff.md",
        "createdAt": existing.get("createdAt") or stamp(),
    })
    existing.setdefault("commands", [{"command": "", "result": "", "summary": ""}])
    criteria = task.get("acceptanceCriteria", [])
    covered = {e.get("criterion") for e in existing.get("acceptanceEvidence", []) if isinstance(e, dict)}
    existing.setdefault("acceptanceEvidence", [])
    for criterion in criteria:
        if criterion not in covered:
            existing["acceptanceEvidence"].append({"criterion": criterion, "evidence": ""})
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    outside = [f for f in changed if not file_allowed(f, task.get("paths", []))]
    emit({"manifest": str(target), "headCommit": head, "changedFiles": changed,
          "outOfScope": outside, "todo": "填写 commands[].result=pass 与每条 acceptanceEvidence[].evidence"})


TASK_FIELDS = ("id", "title", "role", "paths", "acceptanceCriteria")


def cmd_import_tasks(args) -> None:
    """把一批任务写进 backlog。协调器据此把人类的需求落成可派发的任务。"""
    require_runtime()
    source = Path(args.file).expanduser().resolve()
    if not source.exists():
        raise RuntimeError(f"任务文件不存在: {source}")
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"任务文件不是合法 JSON: {exc}") from exc
    incoming = payload.get("tasks") if isinstance(payload, dict) else payload
    if not isinstance(incoming, list) or not incoming:
        raise RuntimeError("任务文件应为任务数组，或含 tasks 数组的对象")

    added: list[str] = []
    updated: list[str] = []
    with mutex():
        backlog = load("backlog.json")
        ownership = load("ownership.json")
        index = {t.get("id"): t for t in tasks(backlog)}
        problems: list[str] = []
        seen: set[str] = set()

        for raw in incoming:
            tid = raw.get("id")
            label = tid or "<缺少 id>"
            for field in TASK_FIELDS:
                if not raw.get(field):
                    problems.append(f"{label} 缺少 {field}")
            if tid in seen:
                problems.append(f"{label} 在本次导入里重复")
            seen.add(tid)
            if tid in index:
                if not args.replace:
                    problems.append(f"{label} 已存在；确认要覆盖就加 --replace")
                elif index[tid].get("status") not in {"ready", "blocked"}:
                    problems.append(f"{label} 状态为 {index[tid].get('status')}，正在进行中，不能改定义")
        if problems:
            raise RuntimeError("任务未导入：\n  - " + "\n  - ".join(problems))

        for raw in incoming:
            tid = raw["id"]
            fields = {
                "title": raw["title"], "role": raw["role"], "paths": raw["paths"],
                "acceptanceCriteria": raw["acceptanceCriteria"],
                "dependsOn": raw.get("dependsOn", []),
            }
            if tid in index:
                index[tid].update(fields)
                log_event(index[tid], "redefine", args.agent)
                updated.append(tid)
            else:
                task = {"id": tid, **fields, "status": "ready", "assignee": None, "history": []}
                log_event(task, "create", args.agent)
                tasks(backlog).append(task)
                added.append(tid)

        known = {t.get("id") for t in tasks(backlog)}
        dangling = [f"{t['id']} -> {d}" for t in tasks(backlog)
                    for d in t.get("dependsOn", []) or [] if d not in known]
        if dangling:
            raise RuntimeError(f"任务未导入：依赖指向不存在的任务 {dangling}")
        save("backlog.json", backlog)
        warnings = [w for t in tasks(backlog) if t.get("id") in added + updated
                    for w in ownership_warnings(ownership, t)]

    emit({"added": added, "updated": updated, "ownershipWarnings": warnings,
          "next": "跑 validate 确认依赖无环、路径不冲突"})


def cmd_paths(args) -> None:
    """排查路径规则用：文件是否命中 glob，或两个 glob 是否可能冲突。"""
    if args.file is not None:
        if args.pattern is None:
            raise RuntimeError("--file 需要配合 --pattern")
        emit({"file": args.file, "pattern": args.pattern, "match": path_matches(args.file, args.pattern)})
    elif args.a is not None and args.b is not None:
        emit({"a": args.a, "b": args.b, "intersect": patterns_intersect(args.a, args.b)})
    else:
        raise RuntimeError("用法: paths --file <路径> --pattern <glob>  或  paths --a <glob> --b <glob>")


def cmd_verify(args) -> None:
    """执行项目自己的 lint/类型检查/测试，并把真实结果写进本轮 manifest。

    Agent 不能手写 result=pass —— 只有这里跑出来的退出码才算数。
    """
    agents = load("agents.json")
    try:
        root = repo_root()
    except RuntimeError:
        root = HOME

    problems = [doc for doc in agents.get("requiredDocs", []) if not (root / doc).exists()]
    commands = agents.get("verifyCommands", [])
    results: list[dict] = []
    failed = bool(problems)

    if not commands:
        problems.append("agents.json.verifyCommands 为空：协调层无法产生可信证据，请填入本项目的 lint/测试命令")
        failed = True

    for item in commands:
        command = item.get("command") if isinstance(item, dict) else str(item)
        if not command:
            continue
        proc = subprocess.run(command, shell=True, cwd=str(root), capture_output=True,
                              text=True, encoding="utf-8", errors="replace")
        output = ((proc.stdout or "") + (proc.stderr or "")).strip().splitlines()
        summary = (output[-1][:200] if output else f"exit={proc.returncode}")
        ok = proc.returncode == 0
        results.append({
            "command": command, "result": "pass" if ok else "fail",
            "summary": summary, "exitCode": proc.returncode,
            "recordedBy": "verify", "at": stamp(),
        })
        if not ok:
            failed = True
            if item.get("stopOnFail", True) if isinstance(item, dict) else True:
                break

    recorded = None
    if args.task and CONTROL != BOOTSTRAP:
        backlog = load("backlog.json")
        task = get_task(backlog, args.task)
        if task.get("runId"):
            target = ARTIFACTS / task["id"] / task["runId"] / "manifest.json"
            if target.exists():
                manifest = json.loads(target.read_text(encoding="utf-8"))
                manifest["commands"] = results
                target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                recorded = str(target)

    emit({"repo": str(root), "ok": not failed, "problems": problems,
          "results": results, "recordedInto": recorded})
    if failed:
        sys.exit(1)


def cmd_heartbeat(args) -> None:
    require_runtime()
    with mutex():
        backlog = load("backlog.json")
        task = get_task(backlog, args.task)
        if task.get("assignee") != args.agent or task.get("status") != "working":
            raise RuntimeError(f"任务不属于 {args.agent} 或不在 working（当前 {task.get('status')}/{task.get('assignee')}）")
        task["heartbeatAt"] = stamp()
        task["leaseExpiresAt"] = stamp(now() + timedelta(minutes=args.lease_minutes))
        task["updatedAt"] = stamp()
        save("backlog.json", backlog)
        emit({"task": task["id"], "leaseExpiresAt": task["leaseExpiresAt"]})


# --------------------------------------------------------------------------- 证据门禁

def verify_git_evidence(task: dict, manifest: dict) -> list[str]:
    problems: list[str] = []
    try:
        root = repo_root()
    except RuntimeError as exc:
        return [str(exc)]

    base, head = manifest.get("baseCommit"), manifest.get("headCommit")
    if not SHA_RE.match(str(base or "")):
        problems.append(f"baseCommit 不是合法 SHA: {base}")
    if not SHA_RE.match(str(head or "")):
        problems.append(f"headCommit 不是合法 SHA: {head}")
    if task.get("baseCommit") and base and not task["baseCommit"].startswith(str(base)):
        problems.append(f"baseCommit 与领取任务时记录的 {task['baseCommit'][:12]} 不一致")
    if problems:
        return problems

    for sha in (base, head):
        if not git_ok("cat-file", "-e", f"{sha}^{{commit}}", cwd=root):
            problems.append(f"提交在当前 worktree 中不存在: {sha}")
    if problems:
        return problems

    if git("rev-parse", str(base), cwd=root) == git("rev-parse", str(head), cwd=root):
        problems.append("headCommit 等于 baseCommit：本轮没有产生任何提交")
        return problems
    if not git_ok("merge-base", "--is-ancestor", str(base), str(head), cwd=root):
        problems.append("baseCommit 不是 headCommit 的祖先：分支基线被改写")
    if git("status", "--porcelain", cwd=root):
        problems.append("worktree 存在未提交改动：完成定义要求代码已提交")

    actual = git("rev-parse", "HEAD", cwd=root)
    if not actual.startswith(str(head)):
        problems.append(f"当前 HEAD {actual[:12]} 与 manifest.headCommit {str(head)[:12]} 不一致")
    if task.get("branch"):
        current = git("rev-parse", "--abbrev-ref", "HEAD", cwd=root)
        if current != task["branch"]:
            problems.append(f"当前分支 {current} 与任务记录的 {task['branch']} 不一致")

    changed = [f for f in git("diff", "--name-only", f"{base}..{head}", cwd=root).splitlines() if f.strip()]
    if not changed:
        problems.append("base..head 之间没有文件变更")
    declared = set(manifest.get("changedFiles") or [])
    if declared != set(changed):
        problems.append(
            f"manifest.changedFiles 与 git diff 不一致；漏报 {sorted(set(changed) - declared)[:5]}，"
            f"多报 {sorted(declared - set(changed))[:5]}"
        )
    outside = [f for f in changed if not file_allowed(f, task.get("paths", []))]
    if outside:
        problems.append(f"改动越界，不在任务 paths {task.get('paths')} 内: {outside[:8]}")

    ownership = load("ownership.json")
    owned = owner_patterns(ownership, task.get("role"))
    if owned:
        trespass = [f for f in changed if not file_allowed(f, owned)]
        if trespass:
            problems.append(f"改动超出 role={task.get('role')} 的所有权范围: {trespass[:8]}")
    for entry in ownership.get("owners", []):
        if entry.get("role") == task.get("role"):
            continue
        locked = [f for f in changed if file_allowed(f, entry.get("exclusive", []))]
        if locked:
            problems.append(f"改动命中 role={entry['role']} 的单写者专属路径，必须由其处理: {locked[:8]}")
    return problems


def verify_evidence(task: dict, manifest_path: Path, agent: str) -> list[str]:
    if not manifest_path.exists():
        return [f"证据文件不存在: {manifest_path}"]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"证据不是合法 JSON: {exc}"]

    def placeholder(value) -> bool:
        return value is None or (isinstance(value, str) and value.strip() in PLACEHOLDERS)

    problems: list[str] = []
    for field in ("taskId", "runId", "agent", "branch", "baseCommit", "headCommit"):
        if placeholder(manifest.get(field)):
            problems.append(f"manifest.{field} 仍是占位值或空")
    if manifest.get("taskId") not in (None, task["id"]):
        problems.append(f"manifest.taskId={manifest.get('taskId')} 与任务 {task['id']} 不符")
    if task.get("runId") and manifest.get("runId") != task["runId"]:
        problems.append(f"manifest.runId 与本次运行 {task['runId']} 不符（可能提交了旧的证据）")
    if manifest.get("agent") != agent:
        problems.append(f"manifest.agent={manifest.get('agent')} 与提交者 {agent} 不符")
    if task.get("branch") and manifest.get("branch") != task["branch"]:
        problems.append(f"manifest.branch 与任务分支 {task['branch']} 不符")

    commands = manifest.get("commands") or []
    real = [c for c in commands if isinstance(c, dict) and not placeholder(c.get("command"))]
    if not real:
        problems.append("manifest.commands 为空：至少需要一条真实执行过的验证命令（测试 / verify）")
    for command in real:
        if str(command.get("result", "")).strip().lower() != "pass":
            problems.append(f"命令未通过，不允许完成: {command.get('command')} -> {command.get('result')}")
    if load("agents.json").get("requireRecordedVerify", True) and \
            not any(c.get("recordedBy") == "verify" for c in real):
        problems.append("commands 里没有 verify 记录的结果：请运行 `orchestrator verify --task <id>` 由工具写入真实退出码")

    criteria = [c for c in task.get("acceptanceCriteria", []) if str(c).strip()]
    evidence = [e for e in (manifest.get("acceptanceEvidence") or []) if isinstance(e, dict)]
    index = {str(e.get("criterion", "")).strip(): e.get("evidence") for e in evidence}
    for criterion in criteria:
        key = str(criterion).strip()
        if key not in index:
            problems.append(f"验收条件缺少证据条目: {criterion}")
        elif placeholder(index[key]):
            problems.append(f"验收条件证据为空: {criterion}")

    handoff = manifest_path.parent / (manifest.get("handoff") or "handoff.md")
    template = HOME / "templates" / "handoff.md"
    if not handoff.exists():
        problems.append(f"缺少交接记录: {handoff}")
    elif template.exists() and handoff.read_text(encoding="utf-8").strip() == template.read_text(encoding="utf-8").strip():
        problems.append("handoff.md 与模板完全相同：未写入可接力的事实")

    problems.extend(verify_git_evidence(task, manifest))
    return problems


def cmd_complete(args) -> None:
    require_runtime()
    with mutex():
        backlog = load("backlog.json")
        task = get_task(backlog, args.task)
        if task.get("status") != "working" or task.get("assignee") != args.agent:
            raise RuntimeError(f"只能完成自己正在执行的任务（当前 {task.get('status')}/{task.get('assignee')}）")
        lease_guard(task)

        run_id = task.get("runId")
        default = ARTIFACTS / task["id"] / str(run_id) / "manifest.json"
        manifest_path = Path(args.evidence).expanduser().resolve() if args.evidence else default
        problems = verify_evidence(task, manifest_path, args.agent)
        if problems:
            raise RuntimeError("证据未通过，任务保持 working：\n  - " + "\n  - ".join(problems))

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        task.update({
            "status": "review",
            "evidence": str(manifest_path),
            "headCommit": manifest.get("headCommit"),
            "completedBy": args.agent,
            "completedAt": stamp(),
            "leaseExpiresAt": None,
        })
        log_event(task, "complete", args.agent, headCommit=manifest.get("headCommit"))
        save("backlog.json", backlog)
        emit({"task": task["id"], "status": "review", "headCommit": task["headCommit"],
              "evidence": task["evidence"]})


# --------------------------------------------------------------------------- 审查 / 集成 / 阻塞

def cmd_review(args) -> None:
    require_runtime()
    with mutex():
        backlog = load("backlog.json")
        agents = load("agents.json")
        task = get_task(backlog, args.task)
        if task.get("status") != "review":
            raise RuntimeError(f"只有 review 状态可审查，当前 {task.get('status')}")
        if task.get("completedBy") == args.agent and not agents.get("allowSelfReview", False):
            raise RuntimeError("不允许自审：实施者与审查者必须不同（agents.json.allowSelfReview 可放开）")

        task["review"] = {"agent": args.agent, "result": args.result, "note": args.note, "at": stamp()}
        if args.result == "approve":
            task["status"] = "approved"
            task["approvedAt"] = stamp()
        else:
            rounds = task.get("reworkCount", 0) + 1
            task["reworkCount"] = rounds
            limit = agents.get("maxReworkRounds", 2)
            if rounds > limit:
                task["status"] = "blocked"
                task["blockReason"] = f"连续 {rounds} 轮审查未通过（上限 {limit}），需人工裁决：{args.note}"
            else:
                task["status"] = "rework"
                task["leaseExpiresAt"] = stamp(now() + timedelta(minutes=agents.get("workerLeaseMinutes", 45)))
        log_event(task, f"review:{args.result}", args.agent, note=args.note, status=task["status"])
        save("backlog.json", backlog)
        emit({"task": task["id"], "status": task["status"], "reworkCount": task.get("reworkCount", 0)})


def cmd_integrate(args) -> None:
    require_runtime()
    root = repo_root()
    with mutex():
        backlog = load("backlog.json")
        agents = load("agents.json")
        task = get_task(backlog, args.task)
        if task.get("status") != "approved":
            raise RuntimeError(f"只有 approved 状态可集成，当前 {task.get('status')}")
        target = args.into or agents.get("integrationBranch", "main")
        head = task.get("headCommit")
        if not head:
            raise RuntimeError("任务没有 headCommit，无法确认是否合入")
        if not git_ok("rev-parse", "--verify", target, cwd=root):
            raise RuntimeError(f"集成分支不存在或未拉取: {target}")
        if not git_ok("merge-base", "--is-ancestor", head, target, cwd=root):
            raise RuntimeError(
                f"{head[:12]} 尚未合入 {target}：请先合并 PR 并在本 worktree 更新该分支（git fetch）"
            )
        merge_commit = git("rev-parse", target, cwd=root)
        task.update({
            "status": "done", "assignee": None, "leaseExpiresAt": None,
            "integrationBranch": target, "mergeCommit": merge_commit, "integratedAt": stamp(),
        })
        log_event(task, "integrate", args.agent, branch=target, mergeCommit=merge_commit)
        save("backlog.json", backlog)
        emit({"task": task["id"], "status": "done", "integrationBranch": target, "mergeCommit": merge_commit})


def cmd_block(args) -> None:
    require_runtime()
    with mutex():
        backlog = load("backlog.json")
        task = get_task(backlog, args.task)
        task.update({"status": "blocked", "blockReason": args.reason, "assignee": None, "leaseExpiresAt": None})
        log_event(task, "block", args.agent, reason=args.reason)
        save("backlog.json", backlog)
    emit({"task": args.task, "status": "blocked",
          "next": "把 选项 / 影响 / 推荐方案 / 截止时间 追加到 docs/decisions.md 并交人裁决"})


def cmd_unblock(args) -> None:
    require_runtime()
    with mutex():
        backlog = load("backlog.json")
        task = get_task(backlog, args.task)
        if task.get("status") != "blocked":
            raise RuntimeError(f"任务不在 blocked，当前 {task.get('status')}")
        task.update({"status": args.to, "blockReason": None, "decision": args.decision,
                     "reworkCount": 0 if args.to == "ready" else task.get("reworkCount", 0)})
        log_event(task, "unblock", args.agent, decision=args.decision, status=args.to)
        save("backlog.json", backlog)
        emit({"task": task["id"], "status": task["status"]})


# --------------------------------------------------------------------------- 恢复 / 观测

def cmd_recover(args) -> None:
    require_runtime()
    report: dict[str, list] = {"interrupted": [], "staleReview": [], "waitingIntegration": [], "coordinator": None}
    with mutex():
        backlog = load("backlog.json")
        state = load("state.json")
        cutoff = now() - timedelta(minutes=args.stale_minutes)
        for task in tasks(backlog):
            status = task.get("status")
            if status == "working" and parse_time(task.get("heartbeatAt")) < cutoff:
                task.update({
                    "status": "interrupted", "interruptedAt": stamp(), "assignee": None,
                    "leaseExpiresAt": None,
                    "recoveryNote": f"租约超时；从分支 {task.get('branch')} 的最近提交与 artifacts/{task['id']}/{task.get('runId')} 恢复",
                })
                log_event(task, "interrupt", None, branch=task.get("branch"))
                report["interrupted"].append({"id": task["id"], "branch": task.get("branch"),
                                              "runId": task.get("runId")})
            elif status == "review" and parse_time(task.get("completedAt")) < cutoff:
                report["staleReview"].append({"id": task["id"], "since": task.get("completedAt")})
            elif status == "approved" and parse_time(task.get("approvedAt")) < cutoff:
                report["waitingIntegration"].append({"id": task["id"], "since": task.get("approvedAt")})
        save("backlog.json", backlog)

        holder = state.get("coordinator")
        if holder and parse_time(holder.get("leaseExpiresAt")) <= now():
            report["coordinator"] = f"协调器租约已过期（{holder.get('agent')}），可被接管"
            state["coordinator"] = None
            save("state.json", state)
    emit(report)


def cmd_checkpoint(args) -> None:
    require_runtime()
    with mutex():
        state = load("state.json")
        entries = state.setdefault("checkpoints", [])
        entries.append({"at": stamp(), "agent": args.agent, "summary": args.summary, "nextAction": args.next_action})
        del entries[:-50]
        save("state.json", state)


def cmd_status(_args) -> None:
    backlog = load("backlog.json")
    counts: dict[str, int] = {}
    for task in tasks(backlog):
        counts[task.get("status", "?")] = counts.get(task.get("status", "?"), 0) + 1
    state = load("state.json")
    emit({
        "controlRoot": str(CONTROL),
        "bootstrapMode": CONTROL == BOOTSTRAP,
        "coordinator": state.get("coordinator"),
        "counts": counts,
        "tasks": [{
            "id": t.get("id"), "status": t.get("status"), "assignee": t.get("assignee"),
            "branch": t.get("branch"), "lease": t.get("leaseExpiresAt"),
            "blockReason": t.get("blockReason"),
        } for t in tasks(backlog)],
        "lastCheckpoint": (state.get("checkpoints") or [None])[-1],
    })


def cmd_show(args) -> None:
    backlog = load("backlog.json")
    task = get_task(backlog, args.task)
    run_id = task.get("runId")
    artifact_dir = ARTIFACTS / task["id"] / run_id if run_id else None
    emit({
        "task": task,
        "artifactDir": str(artifact_dir) if artifact_dir else None,
        "handoff": str(artifact_dir / "handoff.md") if artifact_dir else None,
        "resume": [
            f"git switch {task.get('branch')}" if task.get("branch") else "尚未分配分支",
            f"git log --oneline {task.get('baseCommit', '')}..HEAD" if task.get("baseCommit") else "",
            f"读取 {artifact_dir / 'handoff.md'}" if artifact_dir else "",
        ],
    })


def cmd_archive(args) -> None:
    """把共享控制目录（状态 + 工件）提交一次，让协调层本身也有历史。"""
    require_runtime()
    if not (CONTROL / ".git").exists():
        raise RuntimeError(f"{CONTROL} 不是 Git 仓库；用 init-runtime 创建或手动 git init")
    git("add", "-A", cwd=CONTROL)
    if not git("status", "--porcelain", cwd=CONTROL):
        emit({"archived": False, "reason": "无变化"})
        return
    git("-c", "user.email=orchestrator@local", "-c", "user.name=orchestrator",
        "commit", "-q", "-m", args.message, cwd=CONTROL)
    emit({"archived": True, "commit": git("rev-parse", "HEAD", cwd=CONTROL), "controlRoot": str(CONTROL)})


# --------------------------------------------------------------------------- CLI

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="orchestrator", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init-runtime", help="创建仓库外共享控制目录")
    init.add_argument("--path", required=True)
    init.add_argument("--no-git", action="store_true", help="不把运行时目录纳入 Git")
    init.set_defaults(func=cmd_init_runtime)

    sub.add_parser("validate", help="校验 backlog / ownership / 依赖环 / 并发").set_defaults(func=cmd_validate)
    sub.add_parser("status", help="总览").set_defaults(func=cmd_status)
    sub.add_parser("next", help="给出可分派任务与被跳过的原因").set_defaults(func=cmd_next)

    show = sub.add_parser("show", help="单任务全量事实（中断恢复用）")
    show.add_argument("--task", required=True)
    show.set_defaults(func=cmd_show)

    cc = sub.add_parser("coordinator-claim"); cc.add_argument("--agent", required=True)
    cc.add_argument("--lease-minutes", type=int, default=20); cc.set_defaults(func=cmd_coordinator_claim)
    cr = sub.add_parser("coordinator-release"); cr.add_argument("--agent", required=True)
    cr.set_defaults(func=cmd_coordinator_release)

    claim = sub.add_parser("claim-task", help="在当前 worktree 领取任务")
    claim.add_argument("--task", required=True); claim.add_argument("--agent", required=True)
    claim.add_argument("--branch"); claim.add_argument("--lease-minutes", type=int, default=45)
    claim.set_defaults(func=cmd_claim)

    man = sub.add_parser("manifest", help="按当前 Git 事实刷新 manifest")
    man.add_argument("--task", required=True); man.set_defaults(func=cmd_manifest)

    ver = sub.add_parser("verify", help="执行项目校验命令并把真实结果写入 manifest")
    ver.add_argument("--task"); ver.set_defaults(func=cmd_verify)

    imp = sub.add_parser("import-tasks", help="把一批任务写进 backlog")
    imp.add_argument("--file", required=True); imp.add_argument("--agent", required=True)
    imp.add_argument("--replace", action="store_true", help="允许覆盖已存在且未开工的任务")
    imp.set_defaults(func=cmd_import_tasks)

    pm = sub.add_parser("paths", help="排查路径归属与冲突判定")
    pm.add_argument("--file"); pm.add_argument("--pattern")
    pm.add_argument("--a"); pm.add_argument("--b"); pm.set_defaults(func=cmd_paths)

    hb = sub.add_parser("heartbeat"); hb.add_argument("--task", required=True)
    hb.add_argument("--agent", required=True); hb.add_argument("--lease-minutes", type=int, default=45)
    hb.set_defaults(func=cmd_heartbeat)

    comp = sub.add_parser("complete", help="提交证据送审（证据不合格会被拒绝）")
    comp.add_argument("--task", required=True); comp.add_argument("--agent", required=True)
    comp.add_argument("--evidence"); comp.set_defaults(func=cmd_complete)

    rev = sub.add_parser("review"); rev.add_argument("--task", required=True)
    rev.add_argument("--agent", required=True)
    rev.add_argument("--result", choices=["approve", "reject"], required=True)
    rev.add_argument("--note", required=True); rev.set_defaults(func=cmd_review)

    integ = sub.add_parser("integrate", help="确认已合入集成分支后置为 done")
    integ.add_argument("--task", required=True); integ.add_argument("--agent", required=True)
    integ.add_argument("--into"); integ.set_defaults(func=cmd_integrate)

    blk = sub.add_parser("block"); blk.add_argument("--task", required=True)
    blk.add_argument("--agent", required=True); blk.add_argument("--reason", required=True)
    blk.set_defaults(func=cmd_block)

    unb = sub.add_parser("unblock"); unb.add_argument("--task", required=True)
    unb.add_argument("--agent", required=True); unb.add_argument("--decision", required=True)
    unb.add_argument("--to", choices=["ready", "rework"], default="ready"); unb.set_defaults(func=cmd_unblock)

    rec = sub.add_parser("recover"); rec.add_argument("--stale-minutes", type=int, default=45)
    rec.set_defaults(func=cmd_recover)

    cp = sub.add_parser("checkpoint"); cp.add_argument("--agent", required=True)
    cp.add_argument("--summary", required=True); cp.add_argument("--next-action", required=True)
    cp.set_defaults(func=cmd_checkpoint)

    arc = sub.add_parser("archive", help="提交共享控制目录的快照")
    arc.add_argument("--message", default="chore: 协调层状态快照"); arc.set_defaults(func=cmd_archive)
    return p


def main() -> None:
    args = build_parser().parse_args()
    try:
        args.func(args)
    except RuntimeError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()

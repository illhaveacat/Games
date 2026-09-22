# 兼容壳：真正的校验逻辑在 orchestrator verify（跨平台，会把真实退出码写入 manifest）。
# 用法: pwsh -File scripts/verify.ps1 [-Task AUTH-010]
param([string]$Task)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$args = @('verify')
if ($Task) { $args += @('--task', $Task) }

if (Get-Command node -ErrorAction SilentlyContinue) {
  & node (Join-Path $root 'scripts/orchestrator.mjs') @args
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  & python (Join-Path $root 'scripts/orchestrator.py') @args
} else {
  throw '需要 node 或 python 才能运行协调层校验'
}
exit $LASTEXITCODE

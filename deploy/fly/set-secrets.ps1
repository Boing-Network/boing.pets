# Generate the shared-world owner key and session secret, store the owner key
# outside the repo, and hand both to Fly without printing them.
#
#   pwsh deploy/fly/set-secrets.ps1 [-App boing-living-pets] [-RotateSession]
#
# Re-running keeps an existing owner key file (so the owner link stays valid)
# and only creates a new session secret with -RotateSession or on first run.
param(
  [string]$App = "boing-living-pets",
  [string]$OwnerKeyFile = (Join-Path $HOME ".boing\living-pets-owner.key"),
  [switch]$RotateSession,
  [switch]$Stage
)
$ErrorActionPreference = "Stop"

function New-Secret([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($buffer)
  $rng.Dispose()
  # base64url without padding: safe in URLs and env files.
  return [Convert]::ToBase64String($buffer).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$dir = Split-Path $OwnerKeyFile
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
if (Test-Path $OwnerKeyFile) {
  $owner = (Get-Content $OwnerKeyFile -Raw).Trim()
} else {
  $owner = New-Secret 32
  Set-Content -Path $OwnerKeyFile -Value $owner -NoNewline
  # Only the current user may read it.
  icacls $OwnerKeyFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
}

$existing = fly secrets list -a $App --json | ConvertFrom-Json
$hasSession = @($existing | Where-Object { $_.Name -eq "LIVING_PETS_MP_SECRET" }).Count -gt 0
$lines = @("LIVING_PETS_MP_OWNER_KEY=$owner")
if ($RotateSession -or -not $hasSession) {
  $lines += "LIVING_PETS_MP_SECRET=$(New-Secret 48)"
}
# `fly secrets import` reads NAME=value lines from stdin: nothing on the
# command line, nothing echoed. Write raw bytes so no encoder can add a BOM
# (Windows PowerShell pipes prefix U+FEFF, which Fly rejects).
# .NET Framework opens the child's stdin with Console.InputEncoding and writes
# its preamble; a BOM-less encoding keeps the first name clean.
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = (Get-Command fly).Source
$psi.Arguments = "secrets import -a $App" + $(if ($Stage) { " --stage" } else { "" })
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$proc = [System.Diagnostics.Process]::Start($psi)
$bytes = [System.Text.Encoding]::ASCII.GetBytes(($lines -join "`n") + "`n")
$proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$proc.StandardInput.Close()
$null = $proc.StandardOutput.ReadToEnd()
$err = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()
[Array]::Clear($bytes, 0, $bytes.Length)
if ($proc.ExitCode -ne 0) {
  # Fly's errors name the secret, never its value.
  throw "fly secrets import failed (exit $($proc.ExitCode)): $err"
}
Write-Output "secrets set on $App; owner key saved at $OwnerKeyFile"
# Sync .env.local -> Vercel (production + preview + development).
# Production/preview NEXT_PUBLIC_APP_URL -> https://brokai.digroup.lt

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$productionUrl = "https://brokai.digroup.lt"
$vars = @{}
Get-Content ".env.local" | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $name = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $vars[$name] = $value
}

$sensitive = @("SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")

foreach ($target in @("production", "preview", "development")) {
  foreach ($name in $vars.Keys) {
    $value = $vars[$name]
    if ($name -eq "NEXT_PUBLIC_APP_URL" -and $target -in @("production", "preview")) {
      $value = $productionUrl
    }
    $args = @("env", "add", $name, $target, "--value", $value, "--force", "--yes")
    if ($sensitive -contains $name) { $args += "--sensitive" }
    Write-Host "[$target] $name"
    & npx vercel @args
    if ($LASTEXITCODE -ne 0) { throw "vercel env add failed for $name ($target)" }
  }
}

Write-Host "Done. Vercel env synced from .env.local"

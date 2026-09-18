# One-time Vercel production setup: env from .env.local + single deploy.
# Usage: .\scripts\vercel-setup-once.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$envFile = Join-Path $PWD ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Error ".env.local not found"
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()
  if ($key) { $vars[$key] = $val }
}

# Production URL (domain will be attached later)
$vars["NEXT_PUBLIC_APP_URL"] = "https://brokai.digroup.lt"

$keys = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "ALLOW_DIRECT_LOGIN"
)

foreach ($key in $keys) {
  if (-not $vars.ContainsKey($key)) {
    Write-Warning "Skipping missing key: $key"
    continue
  }
  Write-Host "Setting $key ..."
  if ($key -eq "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
    npx vercel env add $key production --type config --force --yes --value $vars[$key]
  } else {
    $vars[$key] | npx vercel env add $key production --force
  }
}

Write-Host "Deploying production (once) ..."
npx vercel deploy --prod --yes

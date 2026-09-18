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

$sensitive = @("SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "OPENAI_API_KEY", "AI_GATEWAY_API_KEY", "CRON_SECRET", "RESEND_API_KEY")
$optionalKeys = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "ALLOW_DIRECT_LOGIN",
  "OPENAI_API_KEY",
  "AI_GATEWAY_API_KEY",
  "INVOICE_OCR_MODEL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET"
)

foreach ($target in @("production", "preview", "development")) {
  foreach ($name in $optionalKeys) {
    if (-not $vars.ContainsKey($name)) { continue }
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

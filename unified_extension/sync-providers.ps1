# Re-copy individual extensions into unified_extension/providers after you edit them.
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $base

$map = @{
  'Bajaj_extension' = 'bajaj'
  'icici_extension' = 'icici'
  'Sompo_extension' = 'sompo'
  'orential' = 'oriental'
}

foreach ($entry in $map.GetEnumerator()) {
  $src = Join-Path $root $entry.Key
  $dest = Join-Path $base "providers\$($entry.Value)"
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing: $src"
    continue
  }
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Copy-Item $src $dest -Recurse -Force
  Write-Host "Synced $($entry.Key) -> providers/$($entry.Value)"
}

Write-Host "Done. Re-apply popup.html hub-nav patches if you overwrote those files."

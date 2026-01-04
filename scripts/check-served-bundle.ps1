$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:5000'

$idx = Invoke-WebRequest -UseBasicParsing "$base/" -TimeoutSec 10
Write-Output "INDEX_STATUS=$($idx.StatusCode)"

$m = [regex]::Match($idx.Content, 'src="(/assets/index-[^"]+\.js)"')
if (-not $m.Success) {
  Write-Output 'NO_JS_MATCH'
  exit 1
}

$jsPath = $m.Groups[1].Value
Write-Output "JS_PATH=$jsPath"

$js = Invoke-WebRequest -UseBasicParsing ("$base$jsPath") -TimeoutSec 10
Write-Output "JS_STATUS=$($js.StatusCode) LEN=$($js.Content.Length)"
Write-Output "HAS_Argentina=$($js.Content.Contains('Argentina'))"
Write-Output "HAS_Uruguay=$($js.Content.Contains('Uruguay'))"

Write-Output 'DIST_ASSETS:'
Get-ChildItem .\dist\assets\index-*.js | Select-Object Name,Length | Format-Table | Out-String | Write-Output

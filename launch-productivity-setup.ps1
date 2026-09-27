$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:5173/"

Set-Location $project

try {
  $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
  if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
    Start-Process $url
    exit 0
  }
} catch {
  # The local server is not running yet.
}

Start-Process powershell.exe -WindowStyle Minimized -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", "cd `"$project`"; npm run dev"
)

Start-Sleep -Seconds 3
Start-Process $url

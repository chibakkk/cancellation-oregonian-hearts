param(
  [int]$TimeoutSeconds = 180,
  [switch]$KeepRunning,
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectName = Split-Path $RepoRoot -Leaf

function Get-DockerExecutable {
  $command = Get-Command docker -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $dockerDesktopPath = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
  if (Test-Path $dockerDesktopPath) {
    $dockerBin = Split-Path $dockerDesktopPath -Parent
    $env:PATH = "$dockerBin;$env:PATH"
    return $dockerDesktopPath
  }

  throw "Docker CLI was not found. Install Docker Desktop or add docker.exe to PATH."
}

function Invoke-DockerCompose {
  param([string[]]$ComposeArgs)

  & $Docker "compose" "--project-name" $ProjectName "-f" "docker-compose.yml" "-f" "docker-compose.local.yml" @ComposeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($ComposeArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Read-HttpText {
  param([string]$Url)

  $response = Invoke-WebRequest -UseBasicParsing -Uri $Url
  if ($response.Content -is [byte[]]) {
    return [System.Text.Encoding]::UTF8.GetString($response.Content)
  }
  return [string]$response.Content
}

function Wait-ForJson {
  param(
    [string]$Url,
    [scriptblock]$Assert
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null

  while ((Get-Date) -lt $deadline) {
    try {
      $body = Read-HttpText $Url
      $json = $body | ConvertFrom-Json
      & $Assert $json
      return $json
    } catch {
      $lastError = $_
      Start-Sleep -Seconds 2
    }
  }

  throw "Timed out waiting for $Url. Last error: $lastError"
}

function Wait-ForText {
  param(
    [string]$Url,
    [string]$Expected
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null

  while ((Get-Date) -lt $deadline) {
    try {
      $body = Read-HttpText $Url
      if ($body.Trim() -eq $Expected) {
        return
      }
      $lastError = "Unexpected response: $body"
    } catch {
      $lastError = $_
    }
    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for $Url. Last error: $lastError"
}

function Wait-ForStatus {
  param(
    [string]$Url,
    [int]$ExpectedStatusCode
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url
      if ($response.StatusCode -eq $ExpectedStatusCode) {
        return
      }
      $lastError = "Unexpected status: $($response.StatusCode)"
    } catch {
      $lastError = $_
    }
    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for $Url. Last error: $lastError"
}

$Docker = Get-DockerExecutable
Set-Location $RepoRoot

Write-Host "Using Docker: $Docker"
& $Docker --version
& $Docker compose version

try {
  if ($NoBuild) {
    Invoke-DockerCompose @("up", "-d")
  } else {
    Invoke-DockerCompose @("up", "--build", "-d")
  }

  $ready = Wait-ForJson "http://127.0.0.1:3001/ready" {
    param($json)
    if ($json.ok -ne $true) {
      throw "Server is not ready"
    }
    if ([string]$json.stateStore -notlike "redis-rooms:*") {
      throw "State store is not Redis-backed: $($json.stateStore)"
    }
    if ([string]$json.rateLimitStore -notlike "redis-rate-limit:*") {
      throw "Rate limit store is not Redis-backed: $($json.rateLimitStore)"
    }
  }

  Wait-ForText "http://127.0.0.1:8080/health" "ok"
  Wait-ForStatus "http://127.0.0.1:8080/" 200

  Invoke-DockerCompose @("ps")

  Write-Host ""
  Write-Host "Compose smoke test passed."
  Write-Host "State store: $($ready.stateStore)"
  Write-Host "Rate limit store: $($ready.rateLimitStore)"
} finally {
  if ($KeepRunning) {
    Write-Host "Keeping Compose services running."
  } else {
    Write-Host "Stopping Compose services."
    try {
      Invoke-DockerCompose @("down")
    } catch {
      Write-Warning $_
    }
  }
}

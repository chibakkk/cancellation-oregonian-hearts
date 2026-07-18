param(
  [Parameter(Mandatory = $true)]
  [string]$ClientUrl,

  [Parameter(Mandatory = $true)]
  [string]$ServerUrl,

  [int]$TimeoutSeconds = 120,
  [switch]$SkipReadiness
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ClientWorkspace = Join-Path $RepoRoot "client"

function Normalize-Origin {
  param([string]$Url)

  $uri = [Uri]$Url
  if ($uri.Scheme -notin @("http", "https")) {
    throw "URL must start with http:// or https://: $Url"
  }

  return $uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd("/")
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

$ClientOrigin = Normalize-Origin $ClientUrl
$ServerOrigin = Normalize-Origin $ServerUrl

Write-Host "Public client: $ClientOrigin"
Write-Host "Public server: $ServerOrigin"

Wait-ForStatus "$ClientOrigin/" 200

if (-not $SkipReadiness) {
  Wait-ForJson "$ServerOrigin/health" {
    param($json)
    if ($json.ok -ne $true) {
      throw "Server health endpoint did not return ok=true"
    }
  } | Out-Null

  $ready = Wait-ForJson "$ServerOrigin/ready" {
    param($json)
    if ($json.ok -ne $true) {
      throw "Server readiness endpoint did not return ok=true"
    }
    if ([string]$json.stateStore -notlike "redis-rooms:*") {
      throw "State store is not Redis-backed: $($json.stateStore)"
    }
    if ([string]$json.rateLimitStore -notlike "redis-rate-limit:*") {
      throw "Rate limit store is not Redis-backed: $($json.rateLimitStore)"
    }
  }

  Write-Host "State store: $($ready.stateStore)"
  Write-Host "Rate limit store: $($ready.rateLimitStore)"
}

Push-Location $ClientWorkspace
try {
  $env:COMPOSE_CLIENT_URL = $ClientOrigin
  npm run test:e2e:compose
  if ($LASTEXITCODE -ne 0) {
    throw "Public E2E failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
  Remove-Item Env:\COMPOSE_CLIENT_URL -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Public URL E2E passed."

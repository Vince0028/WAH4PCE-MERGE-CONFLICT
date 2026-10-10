# ADAPT iPaaS - Go Mapper Startup Script
# Run this to start the Go deterministic mapping microservice on port 4000

Write-Host "[Go Mapper] Building and starting deterministic mapper..." -ForegroundColor Cyan

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

if (-not (Test-Path "go-mapper.exe")) {
    Write-Host "[Go Mapper] Building binary..." -ForegroundColor Yellow
    go build -o go-mapper.exe .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[Go Mapper] Build failed!"
        exit 1
    }
    Write-Host "[Go Mapper] Build complete." -ForegroundColor Green
}

$env:GO_MAPPER_PORT = "4000"
Write-Host "[Go Mapper] Starting on http://localhost:4000" -ForegroundColor Green
Write-Host "[Go Mapper] POST http://localhost:4000/transform  (deterministic transform)" -ForegroundColor Gray
Write-Host "[Go Mapper] GET  http://localhost:4000/health     (health check)" -ForegroundColor Gray
.\go-mapper.exe

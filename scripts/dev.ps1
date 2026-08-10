$ErrorActionPreference = "SilentlyContinue"

Write-Host "Killing processes on port 8000..." -ForegroundColor Yellow
$processes8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $processes8000) {
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    Write-Host "  Killed process $p on port 8000" -ForegroundColor Gray
}

Write-Host "Killing processes on port 3000..." -ForegroundColor Yellow
$processes3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $processes3000) {
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    Write-Host "  Killed process $p on port 3000" -ForegroundColor Gray
}

Start-Sleep -Seconds 1

Write-Host "`nStarting backend server..." -ForegroundColor Cyan
Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000" -WorkingDirectory "$PSScriptRoot\backend" -NoNewWindow

Write-Host "Starting frontend server..." -ForegroundColor Cyan
Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "$PSScriptRoot\frontend" -NoNewWindow

Write-Host "`nDev servers started on ports 8000 (backend) and 3000 (frontend)." -ForegroundColor Green

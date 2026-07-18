[CmdletBinding()]
param(
    [switch]$KeepInfrastructure
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot

function Get-DescendantProcesses {
    param(
        [int]$RootProcessId,
        [object[]]$Processes
    )

    $descendants = [System.Collections.Generic.List[object]]::new()
    $pendingIds = [System.Collections.Generic.Queue[int]]::new()
    $pendingIds.Enqueue($RootProcessId)

    while ($pendingIds.Count -gt 0) {
        $parentId = $pendingIds.Dequeue()
        foreach ($child in $Processes | Where-Object { $_.ParentProcessId -eq $parentId }) {
            $descendants.Add($child)
            $pendingIds.Enqueue([int]$child.ProcessId)
        }
    }

    return $descendants.ToArray()
}

function Test-HireScopeServiceTree {
    param(
        [object]$RootProcess,
        [object[]]$Processes
    )

    $descendants = Get-DescendantProcesses -RootProcessId $RootProcess.ProcessId -Processes $Processes
    return @($descendants | Where-Object {
        $_.CommandLine -like "*$ProjectRoot*" -and
        $_.CommandLine -match 'apps[\\/](api|worker)[\\/]src[\\/]main\.ts|apps[\\/]web[\\/].*next|next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js'
    }).Count -gt 0
}

Push-Location $ProjectRoot
try {
    Write-Host 'Stopping HireScope AI development services...' -ForegroundColor Cyan

    $allProcesses = @(Get-CimInstance Win32_Process)
    $serviceRoots = @(
        $allProcesses |
            Where-Object {
                $_.Name -eq 'cmd.exe' -and
                $_.CommandLine -match 'pnpm\.cmd.*(?:api:dev|worker:dev|@hirescope/web\s+dev)'
            } |
            Where-Object { Test-HireScopeServiceTree -RootProcess $_ -Processes $allProcesses }
    )

    if ($serviceRoots.Count -eq 0) {
        Write-Host 'No running HireScope AI Web/API/Worker development processes were found.' -ForegroundColor Yellow
    }
    else {
        foreach ($serviceRoot in $serviceRoots) {
            Write-Host "Stopping process tree PID $($serviceRoot.ProcessId)..."
            & taskkill.exe /PID $serviceRoot.ProcessId /T /F *> $null
            if ($LASTEXITCODE -notin @(0, 128)) {
                throw "Failed to stop process tree PID $($serviceRoot.ProcessId) (exit code $LASTEXITCODE)."
            }
        }
    }

    if (-not $KeepInfrastructure) {
        Write-Host 'Stopping local PostgreSQL and Redis containers...'
        & docker.exe compose stop postgres redis
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to stop Docker infrastructure (exit code $LASTEXITCODE)."
        }
    }
    else {
        Write-Host 'Keeping PostgreSQL and Redis running.'
    }

    Start-Sleep -Seconds 1
    $remainingProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -like "*$ProjectRoot*" -and
        $_.CommandLine -match 'apps[\\/](api|worker)[\\/]src[\\/]main\.ts|apps[\\/]web[\\/].*next|next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js'
    })
    if ($remainingProcesses.Count -gt 0) {
        throw "Some HireScope AI development processes are still running: $($remainingProcesses.ProcessId -join ', ')"
    }

    Write-Host "`nHireScope AI development services are stopped." -ForegroundColor Green
    if (-not $KeepInfrastructure) {
        Write-Host 'PostgreSQL/Redis data is preserved in Docker volumes.'
    }
}
catch {
    Write-Host "`nStop failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}

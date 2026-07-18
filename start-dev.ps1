[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$WebPort = 4200,

    [ValidateRange(10, 300)]
    [int]$DockerTimeoutSeconds = 120,

    [switch]$SkipInstall,
    [switch]$SkipMigrations,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$LogRoot = Join-Path $env:TEMP 'hirescope-ai-runtime'
$RunLogDirectory = Join-Path $LogRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
$script:StartedProcesses = @()

function Write-Step {
    param([string]$Message)

    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-NativeCommand {
    param(
        [string]$FilePath,
        [string[]]$CommandArguments,
        [string]$Description
    )

    & $FilePath @CommandArguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed (exit code $LASTEXITCODE)."
    }
}

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Name,
        [string]$DefaultValue
    )

    $pattern = '^\s*' + [Regex]::Escape($Name) + '\s*=\s*(.*)\s*$'
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match $pattern) {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }

    return $DefaultValue
}

function Test-TcpPort {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutMilliseconds = 500
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync($HostName, $Port)
        return $connectTask.Wait($TimeoutMilliseconds) -and $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Test-PortCanBind {
    param([int]$Port)

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $listener) {
            $listener.Stop()
        }
    }
}

function Test-LocalNextDevOnPort {
    param([int]$Port)

    try {
        $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
        foreach ($listener in $listeners) {
            $processId = $listener.OwningProcess
            for ($depth = 0; $depth -lt 8 -and $processId -gt 0; $depth++) {
                $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
                if ($null -eq $process) {
                    break
                }
                if (
                    $process.CommandLine -match 'HireScope' -and
                    $process.CommandLine -match 'next(?:\.cmd)?["'']?\s+dev|next-server|next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js'
                ) {
                    return $true
                }
                $processId = $process.ParentProcessId
            }
        }
    }
    catch {
        return $false
    }

    return $false
}

function Resolve-WebPort {
    param([int]$RequestedPort)

    if (Test-LocalNextDevOnPort -Port $RequestedPort) {
        return [PSCustomObject]@{ Port = $RequestedPort; Reuse = $true }
    }
    if (Test-PortCanBind -Port $RequestedPort) {
        return [PSCustomObject]@{ Port = $RequestedPort; Reuse = $false }
    }

    foreach ($candidate in 5400..5410) {
        if ($candidate -eq $RequestedPort) {
            continue
        }
        if (Test-LocalNextDevOnPort -Port $candidate) {
            return [PSCustomObject]@{ Port = $candidate; Reuse = $true }
        }
        if (Test-PortCanBind -Port $candidate) {
            return [PSCustomObject]@{ Port = $candidate; Reuse = $false }
        }
    }

    throw "Web port $RequestedPort is unavailable and no fallback port from 5400 through 5410 can be used."
}

function Wait-TcpPort {
    param(
        [string]$Name,
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-TcpPort -HostName $HostName -Port $Port) {
            return
        }
        Start-Sleep -Seconds 1
    }

    throw "$Name did not listen on ${HostName}:$Port within $TimeoutSeconds seconds."
}

function Get-HttpStatusCode {
    param([string]$Uri)

    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 5
        return [int]$response.StatusCode
    }
    catch {
        if ($null -ne $_.Exception.Response) {
            return [int]$_.Exception.Response.StatusCode
        }
        return $null
    }
}

function Wait-HttpStatus {
    param(
        [string]$Name,
        [string]$Uri,
        [int[]]$ExpectedStatuses,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastStatus = $null
    while ((Get-Date) -lt $deadline) {
        $lastStatus = Get-HttpStatusCode -Uri $Uri
        if ($ExpectedStatuses -contains $lastStatus) {
            return $lastStatus
        }
        Start-Sleep -Seconds 2
    }

    $statusText = if ($null -eq $lastStatus) { 'no response' } else { $lastStatus }
    throw "$Name health check failed at $Uri (last status: $statusText)."
}

function Get-WorkerProcesses {
    try {
        return @(
            Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop |
                Where-Object {
                    $_.CommandLine -match 'apps[\\/]worker[\\/]src[\\/]main\.ts' -or
                    $_.CommandLine -match 'worker:dev'
                }
        )
    }
    catch {
        return @()
    }
}

function Start-LoggedProcess {
    param(
        [string]$Name,
        [string[]]$CommandArguments
    )

    $stdoutPath = Join-Path $RunLogDirectory "$Name.stdout.log"
    $stderrPath = Join-Path $RunLogDirectory "$Name.stderr.log"
    $process = Start-Process `
        -FilePath $script:PnpmPath `
        -ArgumentList $CommandArguments `
        -WorkingDirectory $ProjectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru

    $script:StartedProcesses += [PSCustomObject]@{
        Name = $Name
        Process = $process
        Stdout = $stdoutPath
        Stderr = $stderrPath
    }
    Write-Host "Started $Name (launcher PID $($process.Id))."
}

function Show-RecentLogs {
    foreach ($started in $script:StartedProcesses) {
        foreach ($path in @($started.Stdout, $started.Stderr)) {
            if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 0) {
                Write-Host "`n--- $path ---" -ForegroundColor Yellow
                Get-Content -LiteralPath $path -Tail 30
            }
        }
    }
}

function Stop-StartedProcesses {
    foreach ($started in $script:StartedProcesses) {
        try {
            if (-not $started.Process.HasExited) {
                & taskkill.exe /PID $started.Process.Id /T /F *> $null
            }
        }
        catch {
            # Best-effort cleanup only; the original startup error is more useful.
        }
    }
}

function Test-DockerReady {
    & $script:DockerPath info *> $null
    return $LASTEXITCODE -eq 0
}

function Wait-DockerReady {
    param([int]$TimeoutSeconds)

    if (Test-DockerReady) {
        return
    }

    $desktopCandidates = @(
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
    )
    $dockerDesktop = $desktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($null -eq $dockerDesktop) {
        throw 'Docker Engine is not ready and Docker Desktop could not be found.'
    }

    Write-Host 'Docker Engine is not ready. Starting Docker Desktop...'
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        if (Test-DockerReady) {
            return
        }
    }

    throw "Docker Engine did not become ready within $TimeoutSeconds seconds."
}

function Wait-ComposeHealth {
    param([int]$TimeoutSeconds = 60)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $allHealthy = $true
        foreach ($service in @('postgres', 'redis')) {
            $containerId = (& $script:DockerPath compose ps -q $service 2>$null | Select-Object -First 1)
            if ([string]::IsNullOrWhiteSpace($containerId)) {
                $allHealthy = $false
                break
            }

            $status = (& $script:DockerPath inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId 2>$null)
            if ($status -notin @('healthy', 'running')) {
                $allHealthy = $false
                break
            }
        }

        if ($allHealthy) {
            return
        }
        Start-Sleep -Seconds 2
    }

    throw 'PostgreSQL or Redis did not become healthy in time.'
}

Push-Location $ProjectRoot
try {
    Write-Host 'HireScope AI development startup' -ForegroundColor Green
    Write-Host "Project: $ProjectRoot"

    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $nodeCommand) {
        throw 'Node.js is not installed or is not available in PATH.'
    }
    $nodeMajor = [int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) {
        throw "Node.js 22 or newer is required. Current version: $(& $nodeCommand.Source --version)"
    }

    $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $pnpmCommand) {
        $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
    }
    if ($null -eq $pnpmCommand) {
        throw 'pnpm is not installed or is not available in PATH.'
    }
    $script:PnpmPath = $pnpmCommand.Source

    $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
    if ($null -eq $dockerCommand) {
        $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    }
    if ($null -eq $dockerCommand) {
        throw 'Docker is not installed or is not available in PATH.'
    }
    $script:DockerPath = $dockerCommand.Source

    $envPath = Join-Path $ProjectRoot '.env'
    if (-not (Test-Path -LiteralPath $envPath)) {
        $envExamplePath = Join-Path $ProjectRoot '.env.example'
        if (-not (Test-Path -LiteralPath $envExamplePath)) {
            throw '.env and .env.example are both missing.'
        }
        Copy-Item -LiteralPath $envExamplePath -Destination $envPath
        Write-Host 'Created .env from .env.example. Review local secrets before using AI or OSS features.' -ForegroundColor Yellow
    }

    $apiHost = Get-DotEnvValue -Path $envPath -Name 'API_HOST' -DefaultValue '127.0.0.1'
    $apiPortText = Get-DotEnvValue -Path $envPath -Name 'API_PORT' -DefaultValue '4201'
    $nodeEnvironment = Get-DotEnvValue -Path $envPath -Name 'NODE_ENV' -DefaultValue 'development'
    $authCookieSecure = Get-DotEnvValue -Path $envPath -Name 'AUTH_COOKIE_SECURE' -DefaultValue '__MISSING__'
    if ($authCookieSecure -eq '__MISSING__' -and -not (Test-Path Env:AUTH_COOKIE_SECURE)) {
        if ($nodeEnvironment -eq 'development') {
            # Older local .env files predate this required development-only setting.
            $env:AUTH_COOKIE_SECURE = 'false'
            Write-Host 'Using AUTH_COOKIE_SECURE=false for this local HTTP development run.' -ForegroundColor Yellow
        }
        else {
            throw 'AUTH_COOKIE_SECURE is missing. Only development mode receives a local HTTP default.'
        }
    }
    $apiPort = 0
    if (-not [int]::TryParse($apiPortText, [ref]$apiPort) -or $apiPort -lt 1 -or $apiPort -gt 65535) {
        throw "Invalid API_PORT in .env: $apiPortText"
    }

    $webPortResolution = Resolve-WebPort -RequestedPort $WebPort
    if ($webPortResolution.Port -ne $WebPort) {
        Write-Host "Web port $WebPort is occupied by another process; using $($webPortResolution.Port) instead." -ForegroundColor Yellow
        $WebPort = $webPortResolution.Port
    }
    $reuseExistingWeb = $webPortResolution.Reuse
    $env:CORS_ALLOWED_ORIGINS = "http://localhost:$WebPort,http://127.0.0.1:$WebPort"

    if (-not $SkipInstall -and (-not (Test-Path 'node_modules') -or -not (Test-Path 'node_modules\.modules.yaml'))) {
        Write-Step 'Installing workspace dependencies'
        Invoke-NativeCommand -FilePath $script:PnpmPath -CommandArguments @('install', '--frozen-lockfile') -Description 'pnpm install'
    }

    Write-Step 'Checking Docker and starting PostgreSQL/Redis'
    Wait-DockerReady -TimeoutSeconds $DockerTimeoutSeconds
    Invoke-NativeCommand -FilePath $script:PnpmPath -CommandArguments @('infra:up') -Description 'Infrastructure startup'
    Wait-ComposeHealth

    $apiAlreadyRunning = Test-TcpPort -HostName $apiHost -Port $apiPort
    $workerProcesses = Get-WorkerProcesses
    if (-not $apiAlreadyRunning -and $workerProcesses.Count -eq 0) {
        Write-Step 'Generating Prisma Client'
        Invoke-NativeCommand -FilePath $script:PnpmPath -CommandArguments @('db:generate') -Description 'Prisma Client generation'
    }

    if (-not $SkipMigrations) {
        Write-Step 'Applying pending database migrations'
        Invoke-NativeCommand -FilePath $script:PnpmPath -CommandArguments @('db:deploy') -Description 'Database migration'
    }

    New-Item -ItemType Directory -Path $RunLogDirectory -Force | Out-Null
    $env:API_ORIGIN = "http://${apiHost}:$apiPort"

    Write-Step 'Starting API, Worker, and Web'
    if ($apiAlreadyRunning) {
        Write-Host "API is already listening on ${apiHost}:$apiPort; reusing it."
    }
    else {
        Start-LoggedProcess -Name 'api' -CommandArguments @('api:dev')
    }

    if ($workerProcesses.Count -gt 0) {
        Write-Host "Worker is already running (PID $($workerProcesses[0].ProcessId)); reusing it."
    }
    else {
        Start-LoggedProcess -Name 'worker' -CommandArguments @('worker:dev')
    }

    if ($reuseExistingWeb) {
        Write-Host "Web is already listening on 127.0.0.1:$WebPort; reusing it."
    }
    else {
        Start-LoggedProcess -Name 'web' -CommandArguments @('--filter', '@hirescope/web', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', "$WebPort")
    }

    Write-Step 'Waiting for services and running health checks'
    Wait-TcpPort -Name 'API' -HostName $apiHost -Port $apiPort
    Wait-TcpPort -Name 'Web' -HostName '127.0.0.1' -Port $WebPort

    $webUrl = "http://127.0.0.1:$WebPort"
    $apiUrl = "http://${apiHost}:$apiPort/api/v1/auth/me"
    $proxyUrl = "$webUrl/api/v1/auth/me"
    $webStatus = Wait-HttpStatus -Name 'Web' -Uri $webUrl -ExpectedStatuses @(200)
    $apiStatus = Wait-HttpStatus -Name 'API' -Uri $apiUrl -ExpectedStatuses @(401)
    $proxyStatus = Wait-HttpStatus -Name 'Web-to-API proxy' -Uri $proxyUrl -ExpectedStatuses @(401)

    $workerProcesses = Get-WorkerProcesses
    if ($workerProcesses.Count -eq 0) {
        throw 'Worker process was not detected after startup.'
    }

    Write-Host "`nHireScope AI is ready." -ForegroundColor Green
    Write-Host "Web:       $webUrl (HTTP $webStatus)"
    Write-Host "API:       http://${apiHost}:$apiPort (auth probe HTTP $apiStatus)"
    Write-Host "Proxy:     $proxyUrl (HTTP $proxyStatus)"
    Write-Host "Worker:    running (PID $($workerProcesses[0].ProcessId))"
    Write-Host "Logs:      $RunLogDirectory"

    if (-not $NoBrowser) {
        Start-Process $webUrl | Out-Null
    }
}
catch {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    Show-RecentLogs
    Stop-StartedProcesses
    Write-Host "`nLogs: $RunLogDirectory" -ForegroundColor Yellow
    exit 1
}
finally {
    Pop-Location
}

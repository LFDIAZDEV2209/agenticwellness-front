param(
    [string]$WorkspaceRoot = (Resolve-Path "$PSScriptRoot/../../../..").Path,
    [string]$BackendSource = '',
    [string]$EvidenceDirectory = '',
    [string]$AppUrl = 'http://127.0.0.1:5182',
    [string]$ErpUrl = 'http://127.0.0.1:3071',
    [string]$UiMetadata = ''
)
$ErrorActionPreference = 'Stop'
$qa411Repo = (Resolve-Path "$PSScriptRoot/../..").Path
if (-not $BackendSource) { $BackendSource = Join-Path $WorkspaceRoot '.tmp/back-f4-412-e0a9c29' }
if (-not $EvidenceDirectory) {
    $EvidenceDirectory = Join-Path $WorkspaceRoot ('openspec/changes/organizar-experiencia-bienestar/revision-4.11/' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))
}
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
$qa411Owned = @()
$qa411Exit = 1

function Stop-Qa411Simulation($Owned) {
    $qa411Root = Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.Id)"
    if (-not $qa411Root) { return }
    if ($qa411Root.CommandLine -notlike '*postman*simulation run*' -or $qa411Root.CommandLine -notlike "*--port $($Owned.Port)*") {
        throw "No coincide el proceso propio $($Owned.Id); no se detiene"
    }
    $qa411Tree = @(Get-CimInstance Win32_Process)
    $qa411Ids = @([uint32]$Owned.Id)
    do {
        $qa411Children = @($qa411Tree | Where-Object { $_.ParentProcessId -in $qa411Ids -and $_.ProcessId -notin $qa411Ids })
        $qa411Ids += @($qa411Children | ForEach-Object { $_.ProcessId })
    } while ($qa411Children.Count -gt 0)
    [array]::Reverse($qa411Ids)
    foreach ($qa411Id in $qa411Ids) {
        $qa411Current = Get-CimInstance Win32_Process -Filter "ProcessId=$qa411Id"
        $qa411Original = $qa411Tree | Where-Object ProcessId -eq $qa411Id
        if ($qa411Current -and $qa411Current.CreationDate -eq $qa411Original.CreationDate) {
            Stop-Process -Id $qa411Id -ErrorAction SilentlyContinue
        }
    }
}

try {
    # Previews de UI ya existentes: este runner no los arranca ni los detiene.
    foreach ($qa411Url in @($AppUrl,$ErpUrl)) {
        $qa411Uri = [Uri]$qa411Url
        if ($qa411Uri.Host -notin @('127.0.0.1','localhost')) { throw '4.11 UI solo admite previews locales' }
        Invoke-WebRequest -Uri $qa411Url -TimeoutSec 20 -UseBasicParsing | Out-Null
    }
    # Nunca arrancar/reiniciar API, Auth, AI, APP o Gateway. Puertos ocupados => detener este runner.
    if (Get-NetTCPConnection -State Listen -LocalPort 4552,4553 -ErrorAction SilentlyContinue) {
        throw '4552/4553 ocupado: no se mata ni se reutiliza un proveedor ajeno'
    }
    foreach ($qa411Simulation in @(@{Name='patient-summary';Port=4552},@{Name='weekly-suggestions';Port=4553})) {
        $qa411Name = $qa411Simulation.Name
        $qa411Process = Start-Process -FilePath (Get-Command postman.exe).Source `
            -ArgumentList @('simulation','run',"postman/simulations/$qa411Name.sim.yaml",'--port',"$($qa411Simulation.Port)",'--output','ndjson','--no-history') `
            -WorkingDirectory $BackendSource -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $EvidenceDirectory "$qa411Name.ndjson") `
            -RedirectStandardError (Join-Path $EvidenceDirectory "$qa411Name.err")
        $qa411Owned += @{Id=$qa411Process.Id;Port=$qa411Simulation.Port;Name=$qa411Name}
    }
    $qa411Deadline = (Get-Date).AddSeconds(25)
    foreach ($qa411Simulation in $qa411Owned) {
        $qa411Log = Join-Path $EvidenceDirectory "$($qa411Simulation.Name).ndjson"
        while (-not (Select-String -LiteralPath $qa411Log -SimpleMatch '"event":"listening"' -Quiet -ErrorAction SilentlyContinue)) {
            if ((Get-Date) -ge $qa411Deadline) { throw 'Proveedor Postman propio no llegó a listening' }
            Start-Sleep -Milliseconds 200
        }
    }
    $env:COP_WORKSPACE_ROOT = $WorkspaceRoot
    $env:COP_F4_SOURCE = $BackendSource
    $env:COP_411_EVIDENCE = $EvidenceDirectory
    $env:E2E_APP_BASE_URL = $AppUrl
    $env:E2E_BASE_URL = $ErpUrl
    if ($UiMetadata) { $env:COP411_UI_METADATA = $UiMetadata }
    $env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $EvidenceDirectory 'playwright.json'
    Push-Location $qa411Repo
    try {
        & corepack yarn exec playwright test --config playwright.program-phase4-real.config.ts --reporter=list,json
        $qa411Exit = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    foreach ($qa411Simulation in $qa411Owned) { Stop-Qa411Simulation $qa411Simulation }
    $qa411Result = @{exitCode=$qa411Exit;apiAndDbOnly=$false;uiPending=($qa411Exit -ne 0);sharedStackManaged=$false;ownedSimulations=$qa411Owned;appUrl=$AppUrl;erpUrl=$ErpUrl}
    [IO.File]::WriteAllText((Join-Path $EvidenceDirectory 'runner.json'),($qa411Result | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
}
exit $qa411Exit

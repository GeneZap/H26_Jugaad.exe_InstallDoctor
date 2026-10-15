param(
    [string]$Model = "gemma4:26b-a4b-it-q4_K_M",
    [ValidateSet("hermes", "ollama", "none")]
    [string]$Provider = "hermes",
    [string]$Python = "",
    [string]$ModelSource = "",
    [string]$ModelLicense = "",
    [ValidateRange(30, 3600)]
    [int]$ModelTimeout = 600,
    [switch]$SetupOnly
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Executable failed (exit $LASTEXITCODE). Setup stopped; fix this step before retrying."
    }
}

function Test-SupportedPython {
    param([string]$Executable)
    try {
        & $Executable -c "import sys; sys.exit(0 if (3,12) <= sys.version_info[:2] <= (3,13) else 1)" 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Test-DockerReady {
    try {
        & docker info *> $null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
    if ($Python) {
        if (-not (Test-SupportedPython $Python)) { throw "-Python must identify a working Python 3.12 or 3.13 executable." }
        Invoke-Checked -Executable $Python -Arguments @("-m", "venv", ".venv")
    } else {
        $selectedPython = $null
        if (Get-Command py -ErrorAction SilentlyContinue) {
            foreach ($version in @("3.12", "3.13")) {
                try {
                    $candidate = & py "-$version" -c "import sys; print(sys.executable)" 2>$null
                    if ($LASTEXITCODE -eq 0 -and $candidate -and (Test-SupportedPython "$candidate")) {
                        $selectedPython = "$candidate"
                        break
                    }
                } catch { continue }
            }
        }
        if (-not $selectedPython -and (Get-Command python -ErrorAction SilentlyContinue)) {
            if (Test-SupportedPython "python") { $selectedPython = "python" }
        }
        if ($selectedPython) {
            Invoke-Checked -Executable $selectedPython -Arguments @("-m", "venv", ".venv")
        } elseif (Get-Command uv -ErrorAction SilentlyContinue) {
            Invoke-Checked -Executable "uv" -Arguments @("python", "install", "3.12")
            Invoke-Checked -Executable "uv" -Arguments @("venv", "--python", "3.12", "--seed", ".venv")
        } else {
            throw "Python 3.12/3.13 not found. Run 'py -0p' to inspect installations; install Python 3.12, or supply -Python 'C:\path\python.exe'. Then rerun this script."
        }
    }
}
if (-not (Test-SupportedPython $venvPython)) {
    throw "Existing .venv is unusable or is not Python 3.12/3.13. Rename it before rerunning; this script will not delete it."
}
Invoke-Checked -Executable $venvPython -Arguments @("-m", "pip", "install", "-e", ".[dev]")

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git must be installed and available on PATH for repository cloning." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Install Docker Desktop, then reopen PowerShell." }
if (-not (Test-DockerReady)) {
    Write-Host "Starting Docker Desktop (up to 60 seconds)..."
    try { & docker desktop start --timeout 60 } catch { Write-Host $_ }
    if (-not (Test-DockerReady)) {
        throw "Docker engine is unavailable. Open Docker Desktop, select Linux containers, and wait for Engine running. Rerun this script after 'docker info' shows a Server section."
    }
}
$image = if ($env:INSTALLDOCTOR_DOCKER_IMAGE) { $env:INSTALLDOCTOR_DOCKER_IMAGE } else { "python:3.12-slim" }
$imageReady = $false
try {
    & docker image inspect $image *> $null
    $imageReady = ($LASTEXITCODE -eq 0)
} catch { $imageReady = $false }
if (-not $imageReady) { Invoke-Checked -Executable "docker" -Arguments @("pull", $image) }

if ($Provider -ne "none") {
    if ($Provider -eq "hermes") {
        $hermesCommand = if ($env:INSTALLDOCTOR_HERMES_BIN) { $env:INSTALLDOCTOR_HERMES_BIN } else { "hermes" }
        if (-not (Get-Command $hermesCommand -ErrorAction SilentlyContinue)) {
            throw "Hermes is not on PATH. Install it using https://hermes-agent.nousresearch.com/docs/getting-started/quickstart then reopen PowerShell. -Provider ollama is direct-model development mode; -Provider none supports analysis only."
        }
    }
    $endpoint = if ($env:INSTALLDOCTOR_OLLAMA_URL) { $env:INSTALLDOCTOR_OLLAMA_URL.TrimEnd('/') } else { "http://127.0.0.1:11434" }
    if (([uri]$endpoint).Host -notin @("127.0.0.1", "localhost", "[::1]", "::1")) {
        throw "Only a loopback Ollama endpoint is supported; hosted inference is not enabled."
    }
    try { $tags = Invoke-RestMethod -Uri "$endpoint/api/tags" -TimeoutSec 15 } catch {
        throw "Cannot reach Ollama at $endpoint. Start the Ollama application and rerun this script."
    }
    if ($Model -notin @($tags.models | ForEach-Object { $_.name })) {
        throw "Model '$Model' is not installed at $endpoint. Check 'ollama list' and supply the exact tag using -Model."
    }
    if ($Model -eq "gemma4:26b-a4b-it-q4_K_M") {
        if (-not $ModelSource) { $ModelSource = "https://ollama.com/library/gemma4:26b-a4b-it-q4_K_M" }
        if (-not $ModelLicense) { $ModelLicense = "Apache-2.0" }
    }
    if (-not $ModelSource -or -not $ModelLicense) {
        throw "For a different model, supply -ModelSource and -ModelLicense with its verified source/version and applicable terms."
    }
}

$env:INSTALLDOCTOR_AI_PROVIDER = $Provider
$env:INSTALLDOCTOR_RUNNER = "docker"
$env:INSTALLDOCTOR_MODEL = $Model
$env:INSTALLDOCTOR_MODEL_SOURCE = $ModelSource
$env:INSTALLDOCTOR_MODEL_LICENSE = $ModelLicense
$env:INSTALLDOCTOR_MODEL_TIMEOUT = "$ModelTimeout"
Write-Host "Prerequisites ready. Provider=$Provider; model=$Model; worker=Docker/Python 3.12."
if ($SetupOnly) { return }
Write-Host "Starting API: http://127.0.0.1:8000/docs"
Invoke-Checked -Executable $venvPython -Arguments @("-m", "uvicorn", "install_doctor.api:app", "--host", "127.0.0.1", "--port", "8000")

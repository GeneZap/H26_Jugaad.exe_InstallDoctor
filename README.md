# InstallDoctor — Jugaad.exe

Integrated Next.js workbench and FastAPI maintenance backend. Submit a public Python repository,
compare installations, inspect baseline tests, request a repair, verify a separate candidate and download evidence.

## Run on Windows

Use two terminals from the repository root. Backend with Token Factory:

```powershell
$nebiusCredential = Read-Host "Token Factory API key" -AsSecureString
$env:NEBIUS_API_KEY = [System.Net.NetworkCredential]::new("", $nebiusCredential).Password
powershell -ExecutionPolicy Bypass -File .\backend\start.ps1 -Provider nebius
```

Or start local Gemma with `-Provider ollama`, or the local Hermes adapter with `-Provider hermes`.
Docker Desktop is required for target installation/tests. Nebius is an explicitly hosted development mode;
it sends repository context and log excerpts to Token Factory and bypasses Hermes. Check event eligibility
before using hosted inference for submission. No API keys belong in frontend configuration.

Frontend, in a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000. The frontend proxies `/api/*` to http://127.0.0.1:8000 by default;
no frontend environment file is required. Stop any earlier server on port 3000 first.
Paste `https://github.com/rishrek/LinkWatch`, select Dependency Repair or Dependency Analysis,
then start the job. The report polls live results, displays elapsed/phase time and exports evidence.
A completed job is not automatically a verified repair: read the verification verdict.

Backend details: [backend/README.md](backend/README.md). API: [backend/docs/API.md](backend/docs/API.md).
Frontend details: [frontend/README.md](frontend/README.md). Validation: [backend/docs/VALIDATION.md](backend/docs/VALIDATION.md).

## Branches

- `feat/hermes-maintenance-agent-skill`: updated maintenance backend including Nebius and Ollama diagnostics.
- `frontend`: original frontend work.
- `integration/install-doctor-fullstack`: combined implementation and integration fixes.
- `feature/install-doctor-backend`: earlier backend baseline.

The root application preserves the organizer's [LinkWatch](https://github.com/rishrek/LinkWatch),
commit f52f3930c8e7c33d934ccf614955a38e26984bd5, with MIT attribution.
This repository is not a native GitHub fork; confirm organizer acceptance.

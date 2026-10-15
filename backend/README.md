# InstallDoctor backend

Original Track 2 maintenance capability: inspect dependencies, reproduce failures, ask a local model
for a minimal repair, verify a candidate independently, and export a Dependency Exit Capsule.
Hermes is the default AI adapter. Direct Ollama is a development alternative.

## Windows setup

Keep the backend environment separate from LinkWatch's older dependencies. The API supports
Python 3.12 or 3.13; the repository-under-test worker stays on Python 3.12 in Docker.

From the **repository root**:

```powershell
powershell -ExecutionPolicy Bypass -File .\backend\start.ps1
```

If your prompt already ends in **\backend**, run this instead (do not run `cd backend` again):

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

The launcher selects installed Python 3.12/3.13, creates `.venv`, installs the backend,
checks Git/Docker, attempts to start Docker Desktop, ensures the worker image exists, and checks
Hermes and the installed Ollama model. A failed prerequisite stops setup. If neither Python is
installed but `uv` is available, it installs Python 3.12 through uv. Otherwise install Python 3.12
or pass `-Python "C:\path\to\python.exe"`. Use `py -0p` to see registered Python installations.
An unusable existing `.venv` is reported rather than deleted.

Default configuration matches the team's installed model:

- Model: `gemma4:26b-a4b-it-q4_K_M`, local Ollama, Hermes adapter.
- Source/version: https://ollama.com/library/gemma4:26b-a4b-it-q4_K_M ; license: Apache-2.0.
- Docker worker: `python:3.12-slim`; model timeout: 600 seconds (not an inference-speed guarantee).

For a different model, supply `-Model`, `-ModelSource` and `-ModelLicense`.
Use `-ModelTimeout 900` to allow longer local inference, or `-SetupOnly` to check prerequisites without
starting the server. `-Provider ollama` bypasses Hermes for development; `-Provider none` supports
analysis only and does not make an AI-repair claim. These options do not enable hosted inference.

If Docker still fails, open Docker Desktop, use Linux containers, and wait for **Engine running**.
`docker info` must show a working Server section. A listed Docker CLI alone is insufficient.
Ollama model installation is separate from Hermes installation; see the Hermes section below.

The underlying server command, after prerequisites and environment settings are ready, is:

```powershell
.\.venv\Scripts\python.exe -m uvicorn install_doctor.api:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs, check /api/health, then submit /api/jobs.
Do not use --reload during execution: restarts interrupt jobs. This is a local, unauthenticated demo
service; do not expose it publicly. Environment settings are read at startup. The launcher sets them
for its own process and child server; running it in a separate PowerShell process does not configure
the parent terminal.

Linux/macOS: create a Python 3.12 environment, install `-e '.[dev]'`, export the settings above,
and run `python -m uvicorn install_doctor.api:app --host 127.0.0.1 --port 8000`.

## Hermes

Install and test Hermes using https://hermes-agent.nousresearch.com/docs/getting-started/quickstart
and https://hermes-agent.nousresearch.com/docs/guides/local-ollama-setup.
Use the exact installed model tag and configure its required context length for your Hermes version.
The adapter calls noninteractive Hermes with a query file, explicit custom local endpoint/model,
two-turn limit, disabled toolsets and ignored user configuration. The backend owns edits and tests;
Hermes supplies evidence-based diagnosis and a structured patch proposal. Check `hermes chat --help`
if an installed version rejects flags. CLI/model failures produce blocked jobs, never fake repairs.
No hosted fallback is enabled by this application.

skills/repair-dependencies contains the reusable skill. Install the folder using your Hermes version's
user-skill mechanism. The backend CLI must be installed in the environment Hermes uses.
The API adapter does not require the skill to be installed. CLI: `install-doctor <github-url>`;
append `--analyze-only` to run without an AI proposal.

## Execution location and boundaries

The backend clones into `.install-doctor/<job-id>/source` on the computer running the API.
Candidate source is separate. Docker receives read-only input, copies it into temporary container
storage, and runs installation/tests with CPU, memory and process limits. Network remains enabled
for package installation. Evidence stays in the job's evidence directory.

Docker is the default with no silent fallback. For a reviewed repository only,
INSTALLDOCTOR_RUNNER=trusted-local uses fresh virtual environments. Set INSTALLDOCTOR_PYTHON to
your Python 3.12 executable (commonly `python` on Windows after selecting 3.12). This executes
repository code on the backend host: a virtual environment is NOT a security sandbox.
This prototype is not a hardened hostile-code multi-tenant service, even in Docker mode.

## Supported behaviour

- Public GitHub HTTPS repository URLs only; no private credentials or arbitrary command input.
- Python 3.12, root requirements.txt/pyproject.toml and pytest.
- Dynamic manifest/import inspection. Different ranges are drift unless an exact-pin conflict is established.
- Source-derived whitespace contract probes for explicit version-1 string configuration.
- Hash-checked candidate changes; no original-test or pytest-configuration edits.
- Candidate installation, dependency checks, tests and original inferred contracts on requested routes.
- One proposal per job. Unresolved failures, skipped probes and remaining manifest conflicts remain visible.

No guaranteed arbitrary bug repair, complete dynamic import analysis, vulnerability scoring, upstream PRs
or universal behaviour equivalence is claimed. The selected model's source/version/terms must be configured.

## Frontend integration and evidence

See docs/API.md and /docs. Render a URL input, stage timeline, observed findings, AI proposal,
baseline/candidate comparison, patch and capsule downloads. Job completion is not repair verification.

```json
{"repository_url":"https://github.com/rishrek/LinkWatch","mode":"repair","compare_installations":true}
```

Mode analyze captures findings/baselines without invoking a model. Capsule ZIP contains JSON/Markdown
reports, logs, package versions, test results, AI prompt/output when invoked, proposal/patch when available,
and controller-computed evidence checksums. Original source and virtual environments are not zipped.

## Tests, rules and attribution

Run `.venv\Scripts\python.exe -m pytest tests -q` on Windows. See docs/VALIDATION.md for actual checks
and integration limitations. Mocked model tests are not live AI runs.

Original LinkWatch starter and MIT attribution are preserved at root; see UPSTREAM.md. Our contribution
is backend/, including inspection, verification, patch validation, API and skill. This separately created
team repository is not a native fork; confirm organizer acceptance. The handbook conflicts on cloud use:
obtain clarification before using hosted/paid services, including credit-funded APIs.

References: https://agentskills.io/specification ; https://hermes-agent.nousresearch.com/docs/ ;
https://docs.ollama.com/api/chat ; https://pydantic.dev/docs/validation/latest/get-started/migration/ ;
https://jinja.palletsprojects.com/en/stable/changes/ .

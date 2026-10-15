# Frontend API

Base: http://127.0.0.1:8000. OpenAPI schema: /openapi.json. Interactive requests: /docs.
CORS defaults: localhost:5173, 127.0.0.1:5173 and localhost:3000. Configure INSTALLDOCTOR_CORS_ORIGINS if needed.

| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | Backend/runner availability and AI configuration |
| POST | /api/jobs | Start a job; 202 with Job object |
| GET | /api/jobs | Recent jobs |
| GET | /api/jobs/{id} | Current snapshot |
| GET | /api/jobs/{id}/events?after=0 | Events after a sequence number |
| POST | /api/jobs/{id}/cancel | Request cancellation |
| GET | /api/jobs/{id}/artifacts/{name} | Download a listed artifact |

POST body:
```json
{"repository_url":"https://github.com/rishrek/LinkWatch","mode":"repair","compare_installations":true}
```

Use mode analyze or repair. Only github.com owner/repository HTTPS URLs are accepted; no credentials,
query strings, local paths, private repositories or custom shell commands.

Poll /api/jobs/{id} every 1-2 seconds. Stop on completed/blocked/failed/cancelled.
Phases: queued, cloning, inspecting, baseline, proposing, patching, verifying, exporting and final status.
Events have sequence, time, phase and message. Routes can repeat a phase.

Job fields: id, request, status, phase, timestamps, source_commit, events, findings, baseline, candidate,
proposal, verdict, error and artifacts. Findings include an ID, kind, status, message and path/dependency.
Execution records include route, Python/packages, steps (argv, exit_code, duration_seconds, log),
pytest counts (tests/failures/errors/skipped), source-derived probes and blockers.

Verdicts: analysis_only, needs_review, verified_for_executed_checks. A completed job is not automatically
a verified repair. Preserve observed / AI-proposed / execution-verified distinctions in the UI.

```javascript
const base = 'http://127.0.0.1:8000';
const response = await fetch(`${base}/api/jobs`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({repository_url: repoUrl, mode: 'repair', compare_installations: true})
});
if (!response.ok) throw new Error(await response.text());
const job = await response.json();
const snapshot = await fetch(`${base}/api/jobs/${job.id}`).then(r => r.json());
const download = `${base}/api/jobs/${job.id}/artifacts/capsule.zip`;
```

Only request names in artifacts; 404 can mean not ready. Preview .json with response.json(),
repair.patch/report.md with response.text(). Safely render model/repository text, never raw innerHTML.

Suggested UI: repository input, stage timeline, findings list, baseline/candidate comparison,
AI rationale, diff viewer, limitation panel and capsule download.
The clone is on the backend computer. With the backend on your laptop it uses your local Docker engine.
Do not expose this unauthenticated prototype publicly. Cloud hosting requires organizer clarification.


Health additionally reports `inference_location` (`local` or `hosted`) and, for Nebius,
`api_key_configured` (boolean, never the key). This is a configuration check, not a credential test.
An explicitly selected `nebius` provider uses hosted Token Factory inference; the runner remains local.
`ai-metadata.json` is exported for direct Ollama/Nebius responses, including finish reason and usage.
Empty final content or token-limit truncation blocks the job before patching.

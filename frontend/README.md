# InstallDoctor Frontend V1

A modern, professional frontend for **InstallDoctor** — an AI-powered software dependency maintenance and repository analysis platform built by **Team Jugaad.exe** for the Hacktoberfest Hack Day challenge.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure backend URL (optional — defaults to http://localhost:8000)
cp .env.example .env.local

# 3. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Connecting to the Backend

The frontend communicates with the InstallDoctor FastAPI backend. Start the backend first:

```bash
cd backend/
pip install -e .
uvicorn install_doctor.api:app --reload --port 8000
```

The backend CORS configuration already allows `http://localhost:3000`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend API base URL |

## Backend API Contract

The frontend integrates with these backend endpoints:

| Method | Endpoint | Purpose |
|--------|----------|--------|
| `GET` | `/api/health` | Backend health check (runner, AI status) |
| `POST` | `/api/jobs` | Create analysis/repair job |
| `GET` | `/api/jobs` | List all jobs (sorted by date) |
| `GET` | `/api/jobs/{id}` | Get job details and results |
| `GET` | `/api/jobs/{id}/events?after=N` | Poll job progress events |
| `POST` | `/api/jobs/{id}/cancel` | Cancel a running job |
| `GET` | `/api/jobs/{id}/artifacts/{name}` | Download report artifacts |

### Create Job Request

```json
{
  "repository_url": "https://github.com/owner/repo",
  "mode": "repair",
  "compare_installations": true
}
```

- `mode`: `"repair"` (full AI pipeline) or `"analyze"` (inspect only)
- `compare_installations`: Test both requirements.txt and pyproject.toml routes

### Job Status Values

| Status | Description |
|--------|------------|
| `queued` | Job created, waiting to start |
| `running` | Analysis in progress |
| `completed` | Analysis finished successfully |
| `blocked` | Analysis stopped due to an error |
| `cancelled` | User cancelled the job |

### Available Artifacts

| Artifact | Format | Description |
|----------|--------|-------------|
| `capsule.json` | JSON | Full Dependency Exit Capsule |
| `report.md` | Markdown | Human-readable report |
| `capsule.zip` | ZIP | Bundle of all evidence files |
| `checksums.json` | JSON | File integrity checksums |

## Architecture

```
Frontend (Next.js :3000)  →  Backend (FastAPI :8000)  →  Analysis Pipeline
     │                              │
     ├─ New Analysis page           ├─ Clone repository
     ├─ Report History page         ├─ Inspect manifests & imports
     └─ Maintenance Report page     ├─ Baseline execution (Docker/venv)
                                    ├─ AI proposal (Hermes/Ollama)
                                    ├─ Patch validation & candidate test
                                    └─ Export Dependency Exit Capsule
```

## Project Structure

```
installdoctor-frontend-v1/
├── app/
│   ├── layout.tsx          # Root layout with sidebar & topnav
│   ├── page.tsx            # New Analysis page
│   ├── globals.css         # Complete application styles
│   ├── history/
│   │   └── page.tsx        # Report History page
│   └── report/
│       └── [id]/
│           └── page.tsx    # Maintenance Report page
├── components/
│   ├── Sidebar.tsx         # Navigation sidebar
│   ├── TopNav.tsx          # Top breadcrumb bar
│   ├── StatusBadge.tsx     # Job status pill
│   ├── ErrorBanner.tsx     # Dismissible error/info banners
│   ├── LoadingSpinner.tsx  # Loading indicator
│   ├── EmptyState.tsx      # Empty state placeholder
│   ├── TaskCard.tsx        # Selectable task card
│   ├── HowItWorks.tsx      # Pipeline explanation panel
│   ├── RecentReports.tsx   # Recent jobs table
│   └── RawJsonViewer.tsx   # Collapsible JSON viewer
├── lib/
│   └── api.ts              # Centralized API client
├── types/
│   └── index.ts            # TypeScript types matching backend
├── .env.example            # Environment configuration
├── package.json
├── tsconfig.json
├── next.config.js
└── README.md
```

## Key Design Decisions

1. **Backend is the source of truth**: Report history comes from the backend database, not localStorage. Reports persist across browser restarts.

2. **Nested Job.request**: The backend's Job model has a nested `request` field containing `repository_url`, `mode`, and `compare_installations`. The frontend accesses these as `job.request.repository_url`, etc.

3. **Mode mapping**: The backend supports `"repair"` (full pipeline with AI) and `"analyze"` (inspection only). The frontend's task cards map directly to these modes.

4. **Status-based polling**: While a job is running (`queued` or `running`), the report page polls `/api/jobs/{id}/events?after=N` every 3 seconds to fetch new execution events. Polling stops automatically when a terminal status (`completed`, `blocked`, `failed`, or `cancelled`) is reached.

5. **Responsible AI disclosure**: AI proposals are explicitly labeled as machine-generated recommendations, never claimed as verified facts until candidate execution tests confirm them.

6. **Robust error boundaries and degradation**: Graceful empty and error states ensure the frontend remains functional even when the backend is offline or slow.

## Verification & Testing

- Type-checked with TypeScript (`tsc --noEmit`)
- Responsive design tested across desktop and mobile layouts
- Error handling verified for network timeouts, 422 validation errors, and 429 queue full responses

## License

Built for Hacktoberfest Hack Day by **Team Jugaad.exe**.

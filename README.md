# InstallDoctor

Hacktoberfest 2026 team workspace for InstallDoctor, an AI-powered software dependency maintenance and repository analysis platform.

## Frontend

The Next.js frontend is in [`frontend/`](./frontend/). To run it locally:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The app expects the FastAPI backend at `http://localhost:8000` by default. Set `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` to use a different backend URL. See [`frontend/README.md`](./frontend/README.md) for the API contract and frontend details.

## Project branches

- Frontend: `frontend`
- Backend: `feature/install-doctor-backend`

Organizer target: https://github.com/rishrek/LinkWatch

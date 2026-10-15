# InstallDoctor frontend

Next.js workbench integrated with the FastAPI backend on `integration/install-doctor-fullstack`.

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. Start the backend in a separate terminal using the root README.
No environment file is needed by default: browser `/api/*` requests are proxied by Next.js to
http://127.0.0.1:8000. To change that server-side target set `INSTALLDOCTOR_BACKEND_URL` in `.env.local`
and restart Next.js. An existing `NEXT_PUBLIC_API_BASE_URL` overrides the proxy for browser calls;
remove it to use the default proxy. Never expose a provider API key via frontend variables.

The sidebar displays configured AI provider/model, hosted vs local inference and runner availability.
The form accepts a public GitHub repository, analysis/repair selection and installation comparison.
Report pages refresh full snapshots every two seconds, show total and current-phase elapsed time,
findings, baseline/candidate test and contract results, proposed file contents, verification verdict,
artifact downloads and raw JSON. Failed steps/probes do not receive a green run card, and skipped tests
are excluded from the passed count. Only a recorded verification verdict establishes repair success.

`npm run typecheck` checks TypeScript. `npm run build` produces a production build;
`npm start` serves it. `npm run lint` currently runs TypeScript checking (no ESLint configuration).

Frontend uses React text rendering for repository/model content rather than raw HTML. Job state and
history come from the backend, not localStorage. Hosted inference is configured in the backend terminal.

// ============================================================
// InstallDoctor API Client
// ============================================================
// Centralized HTTP client for the FastAPI backend.
//
// BACKEND CONNECTION:
//   The backend runs at NEXT_PUBLIC_API_BASE_URL (default http://localhost:8000).
//   Start the backend with:
//     cd backend/
//     pip install -e .
//     uvicorn install_doctor.api:app --reload --port 8000
//
// CORS:
//   The backend allows origins: localhost:5173, localhost:3000
//   Next.js dev server runs on port 3000 by default — no proxy needed.
//
// ENDPOINT MAPPING:
//   checkHealth()            → GET  /api/health
//   createJob(body)          → POST /api/jobs  (202 Accepted)
//   listJobs()               → GET  /api/jobs
//   getJob(id)               → GET  /api/jobs/{id}
//   getJobEvents(id, after)  → GET  /api/jobs/{id}/events?after=N
//   cancelJob(id)            → POST /api/jobs/{id}/cancel
//   getArtifactUrl(id, name) → GET  /api/jobs/{id}/artifacts/{name}
//
// JOB SHAPE NOTE:
//   The Job object has a nested `request` field:
//     job.request.repository_url  (NOT job.repository_url)
//     job.request.mode            (NOT job.mode)
// ============================================================

import type {
  Job,
  HealthResponse,
  EventsResponse,
  CancelResponse,
  CreateJobBody,
} from '@/types';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// --------------- Error class ---------------

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// --------------- Internal helpers ---------------

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  } catch (err) {
    throw new ApiError(
      0,
      `Network error: Unable to reach the backend at ${url}. Is the server running?`,
      err
    );
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      /* response may not be JSON */
    }
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? (body as { detail: string }).detail
        : response.statusText;
    throw new ApiError(response.status, `API error ${response.status}: ${detail}`, body);
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// --------------- Public API functions ---------------

/**
 * GET /api/health
 * Returns backend health including runner availability and AI config.
 */
export async function checkHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health');
}

/**
 * POST /api/jobs
 * Creates a new analysis/repair job.
 *
 * @param body.repository_url - Public GitHub HTTPS URL
 * @param body.mode - "analyze" (inspect only) or "repair" (full pipeline with AI)
 * @param body.compare_installations - Compare requirements.txt vs pyproject.toml routes
 *
 * Returns 202 with the created Job object.
 * Returns 422 for invalid repository URL.
 * Returns 429 if the job queue is full (max 5 concurrent).
 */
export async function createJob(body: CreateJobBody): Promise<Job> {
  return request<Job>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * GET /api/jobs
 * Lists all jobs sorted by created_at descending.
 */
export async function listJobs(): Promise<Job[]> {
  const data = await request<unknown>('/api/jobs');
  return Array.isArray(data) ? data : [];
}

/**
 * GET /api/jobs/{id}
 * Fetches a single job by ID (32-char hex).
 */
export async function getJob(id: string): Promise<Job> {
  return request<Job>(`/api/jobs/${encodeURIComponent(id)}`);
}

/**
 * GET /api/jobs/{id}/events?after=N
 * Fetches new events since sequence number `after`.
 * Returns { status, phase, events: [...] }
 */
export async function getJobEvents(
  id: string,
  after: number = 0
): Promise<EventsResponse> {
  return request<EventsResponse>(
    `/api/jobs/${encodeURIComponent(id)}/events?after=${after}`
  );
}

/**
 * POST /api/jobs/{id}/cancel
 * Requests cancellation of a running or queued job.
 */
export async function cancelJob(id: string): Promise<CancelResponse> {
  return request<CancelResponse>(
    `/api/jobs/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' }
  );
}

/**
 * Constructs the URL for downloading a job artifact.
 * Artifacts include: capsule.json, report.md, capsule.zip, checksums.json
 *
 * Use this URL with fetch() or for download links.
 * The backend serves artifacts from: GET /api/jobs/{id}/artifacts/{name}
 */
export function getArtifactUrl(jobId: string, artifactName: string): string {
  return `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactName)}`;
}

/**
 * Fetches the capsule.json artifact for a completed job.
 * This is the Dependency Exit Capsule with full evidence.
 *
 * Falls back to constructing report data from the job object itself
 * if the artifact is not available.
 */
export async function getCapsule(jobId: string): Promise<Record<string, unknown>> {
  try {
    return await request<Record<string, unknown>>(
      `/api/jobs/${encodeURIComponent(jobId)}/artifacts/capsule.json`
    );
  } catch {
    // Fallback: return the job object which contains findings, verdict, etc.
    const job = await getJob(jobId);
    return job as unknown as Record<string, unknown>;
  }
}

/**
 * Downloads an artifact as a Blob for file saving.
 */
export async function downloadArtifact(
  jobId: string,
  artifactName: string
): Promise<Blob> {
  const url = getArtifactUrl(jobId, artifactName);
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Failed to download artifact: ${artifactName}`
    );
  }
  return response.blob();
}

// --------------- Helper: extract repo name ---------------

/**
 * Extracts "owner/repo" from a GitHub URL for display.
 * e.g. "https://github.com/rishrek/LinkWatch.git" → "rishrek/LinkWatch"
 */
export function extractRepoName(url: string): string {
  const match = url.match(
    /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/
  );
  return match ? `${match[1]}/${match[2]}` : url;
}

// --------------- Helper: mode display label ---------------

/**
 * Converts backend mode to a human-readable label.
 */
export function modeLabel(mode: string): string {
  switch (mode) {
    case 'repair':
      return 'Dependency Repair';
    case 'analyze':
      return 'Dependency Analysis';
    default:
      return mode;
  }
}

// --------------- Helper: status display ---------------

/**
 * Returns a human-readable status label.
 * Backend uses "blocked" where the frontend spec says "failed".
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'blocked':
      return 'Blocked';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

/**
 * Returns true if the job is in a terminal state (no more updates expected).
 */
export function isTerminal(status: string): boolean {
  return ['completed', 'blocked', 'failed', 'cancelled'].includes(status);
}

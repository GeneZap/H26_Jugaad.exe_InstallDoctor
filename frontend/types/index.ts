// ============================================================
// InstallDoctor Frontend Types
// ============================================================
// These types mirror the backend's Pydantic models (backend/install_doctor/models.py)
// and API response shapes (backend/install_doctor/api.py).
//
// BACKEND API MAPPING:
//   POST /api/jobs  body: { repository_url, mode: "analyze"|"repair", compare_installations? }
//   GET  /api/jobs   → Job[]
//   GET  /api/jobs/{id}  → Job
//   GET  /api/jobs/{id}/events?after=N  → { status, phase, events }
//   POST /api/jobs/{id}/cancel  → { id, cancellation_requested }
//   GET  /api/jobs/{id}/artifacts/{name}  → File (capsule.json, report.md, capsule.zip)
//   GET  /api/health  → HealthResponse
//
// The backend's Job model has a NESTED `request` field containing
// repository_url, mode, and compare_installations — NOT flat fields.
// ============================================================

/** Job statuses as defined in backend models.py */
export type JobStatus = 'queued' | 'running' | 'completed' | 'blocked' | 'failed' | 'cancelled';

/** Maps to backend JobRequest (models.py) */
export interface JobRequest {
  repository_url: string;
  mode: 'analyze' | 'repair';
  compare_installations: boolean;
}

/**
 * Maps to backend Job (models.py)
 * Note: repository_url and mode are inside the nested `request` field.
 */
export interface Job {
  id: string; // 32-char hex from uuid4().hex
  request: JobRequest;
  status: JobStatus;
  phase: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  events: JobEvent[];
  findings: Finding[];
  baseline: ExecutionRun[];
  candidate: ExecutionRun[];
  proposal: Proposal | null;
  verdict: Verdict | null;
  error: string | null;
  artifacts: string[];
  source_commit: string | null;
}

/** Job event as stored in Job.events (service.py) */
export interface JobEvent {
  sequence: number;
  time: string;
  phase: string;
  message: string;
}

/** Events endpoint response shape (api.py GET /api/jobs/{id}/events) */
export interface EventsResponse {
  status: JobStatus;
  phase: string;
  events: JobEvent[];
}

/** Inspection finding (inspection.py) */
export interface Finding {
  id: string; // e.g. "F001"
  kind: string; // "manifest_conflict" | "manifest_drift" | "private_api" | "legacy_configuration" | "unsupported_requirement"
  status: string; // "observed"
  path?: string;
  line?: number;
  message: string;
  dependency?: string;
  declarations?: Array<{
    name: string;
    specifier: string;
    marker: string;
    path: string;
  }>;
}

/** Execution step within a run (worker.py) */
export interface ExecutionStep {
  name: string; // "install" | "dependency-check" | "tests" | "probes"
  argv: string[];
  exit_code: number;
  duration_seconds: number;
  log: string; // relative path to log file
}

/** Test results from pytest (worker.py) */
export interface TestResults {
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
}

/** Probe result (worker.py) */
export interface ProbeResult {
  contract: {
    module: string;
    class: string;
    fields: string[];
    path: string;
    line: number;
    expected: string;
    basis: string;
  };
  status: string; // "passed" | "failed" | "skipped"
  reason?: string;
  values?: Record<string, string>;
  mismatched_fields?: string[];
}

/** Single execution run for a route (runner.py result) */
export interface ExecutionRun {
  route: string; // "requirements" | "package"
  python?: string;
  runner?: string;
  execution_exit_code?: number;
  evidence_directory?: string;
  steps: ExecutionStep[];
  packages?: Record<string, string>;
  tests?: TestResults | null;
  probes?: ProbeResult[];
  blocked?: string;
  contract_count?: number;
}

/** AI-proposed change (models.py Change) */
export interface ProposedChange {
  path: string;
  original_sha256: string;
  content: string;
  reason: string;
}

/** AI proposal (models.py Proposal) */
export interface Proposal {
  summary: string;
  diagnosis: string;
  evidence_refs: string[];
  changes: ProposedChange[];
  limitations: string[];
}

/** Verification verdict route check (patching.py) */
export interface VerdictRoute {
  route: string;
  passed: boolean;
  tests: TestResults | null;
  test_count_preserved: boolean;
  skips_not_increased: boolean;
  all_inferred_contracts_verified: boolean;
}

/** Verification verdict (patching.py) */
export interface Verdict {
  status: 'verified_for_executed_checks' | 'needs_review' | 'analysis_only';
  routes?: VerdictRoute[];
  scope?: string;
  message?: string;
  remaining_manifest_conflict?: boolean;
}

/** Health endpoint response (api.py GET /api/health) */
export interface HealthResponse {
  status: string;
  runner: string;
  runner_available: boolean;
  ai_provider: string;
  model: string;
  hermes_installed: boolean;
  model_configured: boolean;
  local_service: boolean;
  inference_location?: 'local' | 'hosted';
  api_key_configured?: boolean | null;
  runner_warning: string | null;
}

/** Cancel endpoint response */
export interface CancelResponse {
  id: string;
  cancellation_requested: boolean;
}

/** Capsule artifact (reporting.py export) */
export interface Capsule {
  schema_version: string;
  job: Job;
  ai: {
    provider: string;
    model: string;
    access_method: string;
    model_source: string;
    model_license: string;
  };
  inspection: {
    findings: Finding[];
    declarations: Array<{ name: string; specifier: string; marker: string; path: string }>;
    usages: Array<{ path: string; line: number; module: string; statement: string }>;
    contracts: Array<Record<string, unknown>>;
    files: Record<string, { sha256: string; content: string }>;
    limitations: string[];
  };
  evidence_policy: {
    observed: string;
    ai_proposed: string;
    execution_verified: string;
  };
  limitations: string[];
}

// ============================================================
// Frontend-only types (not from backend)
// ============================================================

/** Task definition for the UI task selection cards */
export interface TaskDefinition {
  id: string;
  backendMode: 'analyze' | 'repair';
  title: string;
  description: string;
  icon: string; // emoji
  details: string[];
  available: boolean; // whether the backend supports this mode
}

/** Create job request body sent to POST /api/jobs */
export interface CreateJobBody {
  repository_url: string;
  mode: 'analyze' | 'repair';
  compare_installations?: boolean;
}

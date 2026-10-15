'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Job } from '@/types';
import {
  getJob,
  cancelJob,
  getArtifactUrl,
  extractRepoName,
  modeLabel,
  isTerminal,
  ApiError,
} from '@/lib/api';
import { elapsed, passedTests, runPassed } from '@/lib/report';
import StatusBadge from '@/components/StatusBadge';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSpinner from '@/components/LoadingSpinner';
import RawJsonViewer from '@/components/RawJsonViewer';

/**
 * Maintenance Report Page
 *
 * BACKEND INTEGRATION:
 *   GET /api/jobs/{id}         → fetch job data (findings, baseline, candidate, proposal, verdict)
 *   GET /api/jobs/{id}/events  → poll for progress while running
 *   POST /api/jobs/{id}/cancel → cancel a running job
 *   GET /api/jobs/{id}/artifacts/{name} → download capsule.json, report.md, capsule.zip
 *
 * POLLING STRATEGY:
 *   While job status is 'queued' or 'running':
 *     1. Poll events every 3s with ?after=lastSequence
 *     2. When status becomes terminal, fetch full job data once more
 *     3. Clean up interval on unmount
 *   No fabricated progress percentages — only real backend phases are shown.
 *
 * REPORT SECTIONS:
 *   The report displays ONLY data returned by the backend.
 *   Missing sections show explicit "not available" messages.
 *   AI proposals are clearly labeled as recommendations.
 *   Test results are shown only when the backend provides them.
 */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ReportPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Fetch job data
  const fetchJob = useCallback(async () => {
    try {
      const data = await getJob(jobId);
      setJob(data);
      setError(null);
      return data;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load job details.'
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Poll complete snapshots so baseline/proposal/candidate sections update while running.
  // Recursive timeout avoids overlapping requests; cleanup also handles StrictMode remounts.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setJob(null);
    const poll = async () => {
      try {
        const data = await getJob(jobId);
        if (!active) return;
        setJob(data);
        setError(null);
        setLoading(false);
        if (!isTerminal(data.status)) timer = setTimeout(poll, 2000);
      } catch (err) {
        if (!active) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Unable to refresh job');
        timer = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [jobId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cancel job
  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelJob(jobId);
      await fetchJob();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    } finally {
      setCancelling(false);
    }
  };

  // Export JSON
  const handleExport = () => {
    if (!job) return;
    const blob = new Blob([JSON.stringify(job, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `installdoctor-report-${jobId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <LoadingSpinner size="large" message="Loading report…" />;
  }

  if (error && !job) {
    return (
      <div>
        <ErrorBanner message={error} onRetry={fetchJob} />
        <Link href="/history" className="btn btn-secondary">
          ← Back to History
        </Link>
      </div>
    );
  }

  if (!job) return null;

  const isRunning = !isTerminal(job.status);
  const repoName = extractRepoName(job.request.repository_url);
  const end = isRunning ? now : Date.parse(job.updated_at);
  const phaseEvent = [...job.events].reverse().find(event => event.phase === job.phase);

  return (
    <div>
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      )}

      {/* Report Header */}
      <div className="page-header">
        <h2>Maintenance Report</h2>
        <p>
          {repoName} — {modeLabel(job.request.mode)}
        </p>
        <div className="page-header-actions">
          <Link href="/history" className="btn btn-secondary">
            ← Back to History
          </Link>
          <button className="btn btn-secondary" onClick={handleExport}>
            📥 Export JSON
          </button>
          {isRunning && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling…' : '✕ Cancel Job'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="report-summary-cards mb-4">
        <div className="summary-card">
          <div className="summary-card-label">Repository</div>
          <div className="summary-card-value">{repoName}</div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
            {job.request.repository_url}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Task</div>
          <div className="summary-card-value">{modeLabel(job.request.mode)}</div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Job ID: {job.id.slice(0, 12)}…
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Status</div>
          <div className="summary-card-value">
            <StatusBadge status={job.status} />
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {job.source_commit ? `Commit: ${job.source_commit.slice(0, 8)}` : ''}
            {job.created_at ? ` • ${formatDate(job.created_at)}` : ''}
          </div>
        </div>
      </div>

      <div className="card mb-4" aria-live="off">
        <strong>Elapsed: {elapsed(job.created_at, end)}</strong>
        <span style={{ marginLeft: 20 }}>Phase: {job.phase}</span>
        {isRunning && phaseEvent && <span style={{ marginLeft: 20 }}>
          Time in phase: {elapsed(phaseEvent.time, now)}
        </span>}
      </div>

      {/* Error info */}
      {job.error && (
        <ErrorBanner
          message={`Job error: ${job.error}`}
          type="warning"
        />
      )}

      {/* Running: Event Log */}
      {isRunning && (
        <div className="report-section">
          <h3 className="report-section-title">Live Progress</h3>
          <div className="flex-between mb-4">
            <StatusBadge status={job.status} />
            <span className="text-muted" style={{ fontSize: 13 }}>
              Phase: {job.phase}
            </span>
          </div>
          {job.events.length > 0 && (
            <div className="event-log">
              {job.events.map((event) => (
                <div className="event-item" key={event.sequence}>
                  <span className="event-time">
                    {formatTime(event.time)}
                  </span>
                  <span className="event-phase">{event.phase}</span>
                  <span className="event-message">{event.message}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ textAlign: 'center', padding: 16 }}>
            <LoadingSpinner size="small" message="Job in progress… refreshing every 2 seconds" />
          </div>
        </div>
      )}

      {/* Event Log (completed jobs) */}
      {!isRunning && job.events.length > 0 && (
        <div className="report-section">
          <h3 className="report-section-title">Execution Log</h3>
          <div className="event-log">
            {job.events.map((event) => (
              <div className="event-item" key={event.sequence}>
                <span className="event-time">{formatTime(event.time)}</span>
                <span className="event-phase">{event.phase}</span>
                <span className="event-message">{event.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings */}
      {job.findings.length > 0 && (
        <div className="report-section">
          <h3 className="report-section-title">
            Findings ({job.findings.length})
          </h3>
          {job.findings.map((finding) => (
            <div className="finding-card" key={finding.id}>
              <div className="finding-header">
                <span className="finding-id">{finding.id}</span>
                <span className="finding-kind">{finding.kind?.replace(/_/g, ' ')}</span>
              </div>
              <p className="finding-message">{finding.message}</p>
              <div className="finding-meta">
                {finding.path && <span>📄 {finding.path}</span>}
                {finding.line && <span> : line {finding.line}</span>}
                {finding.dependency && <span> • 📦 {finding.dependency}</span>}
              </div>
              {finding.declarations && finding.declarations.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  {finding.declarations.map((d: any, i: number) => (
                    <div key={i}>
                      {d.path}: {d.name}{d.specifier || ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Baseline Execution */}
      {job.baseline.length > 0 && (
        <div className="report-section">
          <h3 className="report-section-title">Baseline Execution</h3>
          <div className="verification-grid">
            {job.baseline.map((run, i) => (
              <div
                className={`verification-card ${runPassed(run) ? 'passed' : 'failed'}`}
                key={i}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Route: {run.route}
                </div>
                {run.blocked && (
                  <p className="text-error" style={{ fontSize: 13 }}>
                    ⚠️ {run.blocked}
                  </p>
                )}
                {run.tests && (
                  <div style={{ fontSize: 13, marginTop: 8 }}>
                    <span>✓ {passedTests(run)} passed</span>
                    {(run.tests.failures || 0) > 0 && (
                      <span className="text-error"> • ✕ {run.tests.failures} failed</span>
                    )}
                    {(run.tests.errors || 0) > 0 && (
                      <span className="text-error"> • ⚠ {run.tests.errors} errors</span>
                    )}
                    {(run.tests.skipped || 0) > 0 && (
                      <span className="text-muted"> • ⊘ {run.tests.skipped} skipped</span>
                    )}
                  </div>
                )}
                {run.steps && run.steps.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    {run.steps.map((step, si) => (
                      <div key={si}>
                        {step.exit_code === 0 ? '✓' : '✕'} {step.name}
                        <span style={{ marginLeft: 4 }}>({step.duration_seconds}s)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Proposal */}
      {job.proposal && (
        <div className="report-section">
          <h3 className="report-section-title">
            AI Repair Proposal
            <span className="text-muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
              (AI-generated recommendation — not verified until execution)
            </span>
          </h3>

          {/* Summary & Diagnosis */}
          <div className="card mb-4">
            <h4 style={{ fontWeight: 600, marginBottom: 8 }}>Summary</h4>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>{job.proposal.summary}</p>
            <h4 style={{ fontWeight: 600, marginTop: 16, marginBottom: 8 }}>Diagnosis</h4>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>{job.proposal.diagnosis}</p>
            {job.proposal.evidence_refs.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Evidence references:</span>
                <ul style={{ margin: '4px 0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {job.proposal.evidence_refs.map((ref, i) => (
                    <li key={i}>{ref}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Proposed Changes */}
          {job.proposal.changes.length > 0 ? (
            <div>
              <h4 style={{ fontWeight: 600, marginBottom: 12 }}>
                Proposed File Changes ({job.proposal.changes.length})
              </h4>
              {job.proposal.changes.map((change, i) => (
                <div className="change-card card" key={i}>
                  <div className="change-path">📄 {change.path}</div>
                  <div className="change-reason">{change.reason}</div>
                  <details style={{ marginTop: 8 }}>
                    <summary>Proposed file contents</summary>
                    <pre style={{ overflow: 'auto', maxHeight: 360, whiteSpace: 'pre-wrap' }}>{change.content}</pre>
                  </details>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                    Original SHA-256: {change.original_sha256.slice(0, 16)}…
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <p className="text-muted" style={{ fontSize: 13 }}>
                The AI did not propose any file changes. See proposal limitations below.
              </p>
            </div>
          )}

          {/* Proposal Limitations */}
          {job.proposal.limitations.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontWeight: 600, marginBottom: 8 }}>Proposal Limitations</h4>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
                {job.proposal.limitations.map((lim, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Candidate Execution */}
      {job.candidate.length > 0 && (
        <div className="report-section">
          <h3 className="report-section-title">Candidate Execution (After Repair)</h3>
          <div className="verification-grid">
            {job.candidate.map((run, i) => (
              <div
                className={`verification-card ${runPassed(run) ? 'passed' : 'failed'}`}
                key={i}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Route: {run.route}
                </div>
                {run.blocked && (
                  <p className="text-error" style={{ fontSize: 13 }}>
                    ⚠️ {run.blocked}
                  </p>
                )}
                {run.tests && (
                  <div style={{ fontSize: 13, marginTop: 8 }}>
                    <span>✓ {passedTests(run)} passed</span>
                    {(run.tests.failures || 0) > 0 && (
                      <span className="text-error"> • ✕ {run.tests.failures} failed</span>
                    )}
                    {(run.tests.errors || 0) > 0 && (
                      <span className="text-error"> • ⚠ {run.tests.errors} errors</span>
                    )}
                    {(run.tests.skipped || 0) > 0 && (
                      <span className="text-muted"> • ⊘ {run.tests.skipped} skipped</span>
                    )}
                  </div>
                )}
                {run.steps && run.steps.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    {run.steps.map((step, si) => (
                      <div key={si}>
                        {step.exit_code === 0 ? '✓' : '✕'} {step.name}
                        <span style={{ marginLeft: 4 }}>({step.duration_seconds}s)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verdict */}
      {job.verdict && (
        <div className="report-section">
          <h3 className="report-section-title">Verification Verdict</h3>
          <div
            className={`verdict-banner ${
              job.verdict.status === 'verified_for_executed_checks'
                ? 'verified'
                : job.verdict.status === 'analysis_only'
                ? 'analysis'
                : 'review'
            }`}
          >
            {job.verdict.status === 'verified_for_executed_checks'
              ? '✅ Verified for executed checks'
              : job.verdict.status === 'analysis_only'
              ? 'ℹ️ Analysis only — no repair or verification claimed'
              : '⚠️ Needs review — verification incomplete or issues detected'}
            {job.verdict.message && (
              <div style={{ marginTop: 4, fontWeight: 400, fontSize: 13 }}>
                {job.verdict.message}
              </div>
            )}
          </div>
          {job.verdict.scope && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
              Scope: {job.verdict.scope}
            </p>
          )}
          {job.verdict.routes && job.verdict.routes.length > 0 && (
            <div className="verification-grid" style={{ marginTop: 12 }}>
              {job.verdict.routes.map((route, i) => (
                <div
                  className={`verification-card ${route.passed ? 'passed' : 'review'}`}
                  key={i}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    Route: {route.route} — {route.passed ? '✅ Passed' : '⚠️ Review'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <div>Test count preserved: {route.test_count_preserved ? '✓' : '✕'}</div>
                    <div>Skips not increased: {route.skips_not_increased ? '✓' : '✕'}</div>
                    <div>Contracts verified: {route.all_inferred_contracts_verified ? '✓' : '✕'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Artifacts */}
      {job.artifacts.length > 0 && (
        <div className="report-section">
          <h3 className="report-section-title">Artifacts</h3>
          <div className="card">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {job.artifacts.map((name) => (
                <a
                  key={name}
                  href={getArtifactUrl(job.id, name)}
                  className="btn btn-sm btn-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  📎 {name}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Raw JSON */}
      <div className="report-section">
        <RawJsonViewer data={job} title="View Raw Job JSON" />
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { Job } from '@/types';
import { listJobs, extractRepoName, modeLabel } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

/**
 * Report History Page
 *
 * BACKEND INTEGRATION:
 *   GET /api/jobs → fetches all jobs sorted by created_at desc
 *
 * Jobs are the authoritative source from the backend database.
 * The frontend does NOT store jobs in localStorage — it always
 * fetches from the backend to ensure persistence across restarts.
 */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function actionLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'View Report';
    case 'running':
    case 'queued':
      return 'View Progress';
    default:
      return 'View Details';
  }
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listJobs();
      setJobs(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load report history. Is the backend running?'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div>
      <div className="page-header">
        <h2>Report History</h2>
        <p>
          Access previous analyses, review results, and revisit maintenance
          decisions.
        </p>
        <div className="page-header-actions">
          <button
            className="btn btn-secondary"
            onClick={fetchJobs}
            disabled={loading}
          >
            🔄 Refresh
          </button>
          <Link href="/" className="btn btn-primary">
            + New Analysis
          </Link>
          {!loading && (
            <span className="text-muted" style={{ fontSize: 13, alignSelf: 'center' }}>
              {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} total
            </span>
          )}
        </div>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={fetchJobs}
        />
      )}

      {loading ? (
        <LoadingSpinner message="Loading report history…" />
      ) : jobs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="📋"
            title="No reports yet"
            description="Start your first analysis to see results here. Reports are persisted by the backend and survive page refreshes."
            actionLabel="Start First Analysis"
            onAction={() => (window.location.href = '/')}
          />
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Task</th>
                <th>Created</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="table-repo">
                    {extractRepoName(job.request.repository_url)}
                  </td>
                  <td>{modeLabel(job.request.mode)}</td>
                  <td>{formatDate(job.created_at)}</td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="table-actions">
                    <Link
                      href={`/report/${job.id}`}
                      className="btn btn-sm btn-primary"
                    >
                      {actionLabel(job.status)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

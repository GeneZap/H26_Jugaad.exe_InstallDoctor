'use client';

import Link from 'next/link';
import type { Job } from '@/types';
import StatusBadge from './StatusBadge';
import EmptyState from './EmptyState';
import { extractRepoName, modeLabel } from '@/lib/api';

/**
 * RecentReports shows the 3 most recent jobs at the bottom of the New Analysis page.
 *
 * BACKEND INTEGRATION:
 *   Data comes from GET /api/jobs (fetched by the parent page).
 *   Job fields used:
 *     - job.id → link to /report/{id}
 *     - job.request.repository_url → display repo name
 *     - job.request.mode → display task type
 *     - job.status → status badge
 *     - job.created_at → formatted date
 */

interface RecentReportsProps {
  jobs: Job[];
  loading: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function RecentReports({ jobs, loading }: RecentReportsProps) {
  const recent = jobs.slice(0, 3);

  return (
    <div className="card" style={{ marginTop: 28 }}>
      <div className="card-header">
        <h3 className="card-title">Recent Reports</h3>
        {jobs.length > 0 && (
          <Link href="/history" className="btn btn-sm btn-secondary">
            View All Reports
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Loading recent reports…
        </p>
      ) : recent.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No reports yet"
          description="Submit your first repository analysis above to get started."
        />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Repository</th>
              <th>Task</th>
              <th>Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((job) => (
              <tr key={job.id}>
                <td className="table-repo">
                  {extractRepoName(job.request.repository_url)}
                </td>
                <td>{modeLabel(job.request.mode)}</td>
                <td>{formatDate(job.created_at)}</td>
                <td>
                  <StatusBadge status={job.status} />
                </td>
                <td>
                  <Link
                    href={`/report/${job.id}`}
                    className="btn btn-sm btn-primary"
                  >
                    {job.status === 'completed'
                      ? 'View Report'
                      : job.status === 'running' || job.status === 'queued'
                      ? 'View Progress'
                      : 'View Details'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

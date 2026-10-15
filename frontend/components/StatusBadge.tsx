'use client';

import type { JobStatus } from '@/types';

/**
 * StatusBadge displays a colored pill for job statuses.
 *
 * BACKEND MAPPING:
 *   The backend uses these statuses (models.py Job.status):
 *   'queued' | 'running' | 'completed' | 'blocked' | 'failed' | 'cancelled'
 *
 *   Note: The backend uses 'blocked' where many UIs say 'failed'.
 *   This badge supports both for display flexibility.
 */

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  blocked: 'Blocked',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

interface StatusBadgeProps {
  status: JobStatus | string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] || status;
  return (
    <span className={`status-badge status-${status}`}>
      {label}
    </span>
  );
}

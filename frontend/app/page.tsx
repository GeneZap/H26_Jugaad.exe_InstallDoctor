'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Job, TaskDefinition } from '@/types';
import { createJob, listJobs, ApiError } from '@/lib/api';
import TaskCard from '@/components/TaskCard';
import HowItWorks from '@/components/HowItWorks';
import RecentReports from '@/components/RecentReports';
import ErrorBanner from '@/components/ErrorBanner';
import LoadingSpinner from '@/components/LoadingSpinner';

/**
 * New Analysis Page — main entry point.
 *
 * BACKEND INTEGRATION:
 *   On submit → POST /api/jobs { repository_url, mode, compare_installations }
 *   On mount  → GET /api/jobs (for recent reports)
 *
 * The backend validates the repository_url independently (models.py normalize_repo_url).
 * Frontend validation is for UX only, not a security boundary.
 */

const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/;

const TASKS: TaskDefinition[] = [
  {
    id: 'repair',
    backendMode: 'repair',
    title: 'Dependency Repair',
    description:
      'Full pipeline: inspect dependencies, establish baseline, generate AI repair proposal, verify changes, and produce a Dependency Exit Capsule.',
    icon: '🔧',
    available: true,
    details: [
      'Inspect dependency manifests and imports',
      'Record baseline installation and test results',
      'Request AI-generated repair proposal',
      'Validate and apply proposed changes',
      'Verify candidate against original tests',
      'Generate Dependency Exit Capsule',
    ],
  },
  {
    id: 'analyze',
    backendMode: 'analyze',
    title: 'Dependency Analysis',
    description:
      'Inspection and baseline only. Identify conflicts, drift, and legacy configurations without attempting AI repair.',
    icon: '🔍',
    available: true,
    details: [
      'Inspect manifests, imports, and contracts',
      'Record baseline installation results',
      'Identify conflicts and version drift',
      'Report findings without AI repair',
      'No changes applied to repository',
    ],
  },
  {
    id: 'general',
    backendMode: 'repair',
    title: 'General Maintenance',
    description:
      'Broader code maintenance analysis. Coming soon.',
    icon: '🛠️',
    available: false,
    details: ['Coming soon: broader maintenance tasks'],
  },
];

export default function NewAnalysisPage() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState('https://github.com/rishrek/LinkWatch');
  const [selectedTask, setSelectedTask] = useState<string>('repair');
  const [compareInstallations, setCompareInstallations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  // Fetch recent jobs on mount
  const fetchJobs = useCallback(async () => {
    try {
      setJobsLoading(true);
      const data = await listJobs();
      setJobs(data);
    } catch {
      // Non-critical: recent reports may not load if backend is down
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Validate URL on change
  const handleUrlChange = (value: string) => {
    setRepoUrl(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setUrlError(null);
    } else if (!GITHUB_URL_PATTERN.test(trimmed)) {
      setUrlError('Please enter a valid GitHub repository URL (https://github.com/owner/repo)');
    } else {
      setUrlError(null);
    }
  };

  // Submit analysis
  const handleSubmit = async () => {
    const trimmed = repoUrl.trim();
    if (!GITHUB_URL_PATTERN.test(trimmed)) {
      setUrlError('Please enter a valid GitHub repository URL');
      return;
    }
    if (!selectedTask) {
      setError('Please select a maintenance task');
      return;
    }

    const task = TASKS.find((t) => t.id === selectedTask);
    if (!task || !task.available) {
      setError('Selected task is not available');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      /**
       * BACKEND: POST /api/jobs
       * Body: { repository_url, mode, compare_installations }
       *
       * The backend (models.py) validates:
       *   - repository_url must match GitHub HTTPS pattern
       *   - mode must be "analyze" or "repair"
       *   - compare_installations defaults to true
       *
       * Returns 202 with created Job object.
       * Returns 422 if URL validation fails.
       * Returns 429 if job queue is full (max 5 concurrent).
       */
      const job = await createJob({
        repository_url: trimmed,
        mode: task.backendMode,
        compare_installations: compareInstallations,
      });

      // Navigate to the report/progress page
      router.push(`/report/${job.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setUrlError('Invalid repository URL. The backend requires a public https://github.com/owner/repo URL.');
        } else if (err.status === 429) {
          setError('Job queue is full. Please wait for a running job to complete.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to create analysis job. Is the backend running?');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = GITHUB_URL_PATTERN.test(repoUrl.trim()) && selectedTask && TASKS.find(t => t.id === selectedTask)?.available;

  return (
    <div>
      <div className="page-header">
        <h2>New Analysis</h2>
        <p>
          Analyze your repository, investigate maintenance risks, and generate
          evidence-backed reports.
        </p>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={undefined}
        />
      )}

      <div className="analysis-grid">
        {/* Left column: Form */}
        <div>
          {/* Repository URL input */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Repository</h3>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="repo-url">
                GitHub Repository URL
              </label>
              <input
                id="repo-url"
                type="text"
                className={`form-input ${urlError ? 'error' : ''}`}
                value={repoUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://github.com/owner/repo"
                disabled={submitting}
                aria-describedby="repo-hint"
              />
              {urlError && <p className="form-error">{urlError}</p>}
              <p className="form-hint" id="repo-hint">
                Enter a public GitHub repository URL. Repository access
                permissions may affect analysis results.
              </p>
            </div>

            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={compareInstallations}
                onChange={(e) => setCompareInstallations(e.target.checked)}
                disabled={submitting}
              />
              Compare requirements.txt and pyproject.toml installation routes
            </label>
          </div>

          {/* Task selection */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Maintenance Task</h3>
            </div>
            <div className="task-grid">
              {TASKS.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  selected={selectedTask === task.id}
                  onSelect={setSelectedTask}
                />
              ))}
            </div>
          </div>

          {/* Submit button */}
          <button
            className="btn btn-primary"
            style={{ marginTop: 16, width: '100%', padding: '14px 20px', fontSize: 15 }}
            onClick={handleSubmit}
            disabled={!isValid || submitting}
          >
            {submitting ? (
              <>
                <span className="spinner small" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} />
                Starting Analysis…
              </>
            ) : (
              '🚀 Start Analysis'
            )}
          </button>

          {/* Responsible Maintenance notice */}
          <div className="responsible-notice">
            <strong>⚖️ Responsible Maintenance:</strong> AI-generated
            recommendations are proposals, not verified facts. Proposed changes
            must be reviewed by a developer. Test results reflect only the
            checks that were actually executed. Do not assume a dependency is
            outdated, vulnerable, or unmaintained unless evidence supports
            that conclusion.
          </div>
        </div>

        {/* Right column: How It Works */}
        <div>
          <HowItWorks />
        </div>
      </div>

      {/* Recent Reports */}
      <RecentReports jobs={jobs} loading={jobsLoading} />
    </div>
  );
}

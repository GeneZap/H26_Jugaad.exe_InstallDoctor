import type { ExecutionRun } from '@/types';

export function passedTests(run: ExecutionRun): number {
  const t = run.tests;
  return t ? Math.max(0, t.tests - t.failures - t.errors - t.skipped) : 0;
}

export function runPassed(run: ExecutionRun): boolean {
  const required = ['install', 'dependency-check', 'tests', 'probes'];
  return !run.blocked && required.every(name => run.steps.some(step => step.name === name)) &&
    run.steps.every(step => step.exit_code === 0) && !!run.tests && run.tests.tests > 0 &&
    run.tests.failures === 0 && run.tests.errors === 0 &&
    (run.probes || []).every(probe => probe.status === 'passed');
}

export function elapsed(start: string, end: number): string {
  const seconds = Math.max(0, Math.floor((end - Date.parse(start)) / 1000));
  if (!Number.isFinite(seconds)) return 'Unavailable';
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

'use client';

import type { TaskDefinition } from '@/types';

/**
 * TaskCard renders a selectable task option for the New Analysis form.
 *
 * BACKEND MAPPING:
 *   Each task maps to a backend `mode` field (models.py JobRequest.mode):
 *   - "repair"  → Full pipeline: clone, inspect, baseline, AI proposal, patch, verify
 *   - "analyze" → Inspection and baseline only, no AI repair attempted
 *
 *   The `backendMode` field on TaskDefinition stores the actual mode string
 *   sent to POST /api/jobs.
 */

interface TaskCardProps {
  task: TaskDefinition;
  selected: boolean;
  onSelect: (taskId: string) => void;
}

export default function TaskCard({ task, selected, onSelect }: TaskCardProps) {
  return (
    <button
      className={`task-card ${selected ? 'selected' : ''} ${!task.available ? 'disabled' : ''}`}
      onClick={() => task.available && onSelect(task.id)}
      disabled={!task.available}
      aria-pressed={selected}
      aria-label={`Select task: ${task.title}`}
      type="button"
    >
      {selected && (
        <span className="task-card-check" aria-hidden="true">
          ✓
        </span>
      )}
      <div className="task-card-icon">{task.icon}</div>
      <h3 className="task-card-title">{task.title}</h3>
      <p className="task-card-desc">{task.description}</p>
      <ul className="task-card-details">
        {task.details.map((detail, i) => (
          <li key={i}>{detail}</li>
        ))}
      </ul>
      {!task.available && (
        <span className="text-muted" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
          Coming soon
        </span>
      )}
    </button>
  );
}

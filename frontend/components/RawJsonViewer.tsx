'use client';

import { useState } from 'react';

/**
 * Collapsible raw JSON viewer for inspecting backend responses.
 * Shows the actual data returned by the backend — never fabricated.
 */

interface RawJsonViewerProps {
  data: unknown;
  title?: string;
}

export default function RawJsonViewer({
  data,
  title = 'View Raw Report JSON',
}: RawJsonViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  return (
    <div className="json-viewer">
      <button
        className="json-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? '▼' : '▶'} {title}
      </button>
      {expanded && (
        <div className="json-container">
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

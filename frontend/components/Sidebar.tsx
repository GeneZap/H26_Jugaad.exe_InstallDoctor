'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { checkHealth, listJobs, API_BASE_URL } from '@/lib/api';

/**
 * Sidebar component with navigation, job count, and backend status.
 *
 * BACKEND INTEGRATION:
 *   - GET /api/health → checks if backend is reachable, shows runner/AI status
 *   - GET /api/jobs → counts total jobs for the badge
 *
 * The sidebar polls health every 30 seconds to detect backend restarts.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);
  const [jobCount, setJobCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      await checkHealth();
      setConnected(true);
    } catch {
      setConnected(false);
    }
    try {
      const jobs = await listJobs();
      setJobCount(jobs.length);
    } catch {
      /* keep previous count */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Toggle body class for mobile overlay
  useEffect(() => {
    const el = document.getElementById('app-layout');
    if (el) {
      if (sidebarOpen) {
        el.classList.add('sidebar-open');
      } else {
        el.classList.remove('sidebar-open');
      }
    }
  }, [sidebarOpen]);

  return (
    <>
      {/* Mobile header */}
      <div className="mobile-header">
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>InstallDoctor</span>
        <div style={{ width: 32 }} />
      </div>

      {/* Overlay for mobile */}
      <div
        className="sidebar-overlay"
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className="sidebar" role="navigation" aria-label="Main navigation">
        <div className="sidebar-logo">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ID
          </div>
          <h1>InstallDoctor</h1>
        </div>

        <nav className="sidebar-nav">
          <Link
            href="/"
            className={`sidebar-nav-item ${pathname === '/' ? 'active' : ''}`}
          >
            <span className="nav-icon">🔬</span>
            New Analysis
          </Link>
          <Link
            href="/history"
            className={`sidebar-nav-item ${
              pathname === '/history' ? 'active' : ''
            }`}
          >
            <span className="nav-icon">📋</span>
            Report History
            {jobCount > 0 && (
              <span className="nav-badge">{jobCount}</span>
            )}
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span
              className={`status-dot ${connected ? 'connected' : 'disconnected'}`}
            />
            {connected ? 'Backend Connected' : 'Backend Disconnected'}
          </div>
          <div className="sidebar-url">{API_BASE_URL}</div>
        </div>
      </aside>
    </>
  );
}

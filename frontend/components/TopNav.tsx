'use client';

import { usePathname } from 'next/navigation';

/**
 * Top navigation bar with breadcrumb and workspace label.
 * Uses Next.js usePathname() to determine current context.
 */

function getBreadcrumb(pathname: string): { label: string; title: string } {
  if (pathname === '/') {
    return { label: 'Dashboard', title: 'New Analysis' };
  }
  if (pathname === '/history') {
    return { label: 'Dashboard → History', title: 'Report History' };
  }
  if (pathname.startsWith('/report/')) {
    const id = pathname.split('/')[2] || '';
    return {
      label: `Dashboard → History → Report`,
      title: `Report ${id.slice(0, 8)}…`,
    };
  }
  return { label: 'Dashboard', title: 'InstallDoctor' };
}

export default function TopNav() {
  const pathname = usePathname();
  const { label, title } = getBreadcrumb(pathname);

  return (
    <div className="topnav">
      <div>
        <div className="topnav-breadcrumb">{label}</div>
      </div>
      <div className="topnav-right">
        <span className="topnav-workspace">Local Workspace</span>
        <div className="topnav-avatar" aria-label="User profile">
          JE
        </div>
      </div>
    </div>
  );
}

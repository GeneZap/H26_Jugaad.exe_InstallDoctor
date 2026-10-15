import './globals.css';
import type { Metadata } from 'next';
import Sidebar from '@/components/Sidebar';
import TopNav from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'InstallDoctor — AI-Powered Dependency Maintenance',
  description:
    'Analyze repositories, identify risky dependencies, propose maintenance changes, verify results, and generate evidence-backed reports.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* 
          APP LAYOUT
          ----------
          The layout uses a CSS grid (.app-layout) with:
          - Left sidebar: persistent on desktop, slide-out on mobile
          - Main area: topnav + scrollable content
          
          The Sidebar fetches backend health (GET /api/health) and job count
          (GET /api/jobs) independently.
        */}
        <div className="app-layout" id="app-layout">
          <Sidebar />
          <div className="main-area">
            <TopNav />
            <main className="main-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

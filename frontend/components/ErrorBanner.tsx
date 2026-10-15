'use client';

/**
 * Dismissible error/warning/info banner.
 * Used throughout the app for API errors, validation messages, and notices.
 */

interface ErrorBannerProps {
  message: string;
  type?: 'error' | 'warning' | 'info';
  onDismiss?: () => void;
  onRetry?: () => void;
}

export default function ErrorBanner({
  message,
  type = 'error',
  onDismiss,
  onRetry,
}: ErrorBannerProps) {
  return (
    <div className={`error-banner ${type}`} role="alert">
      <div className="error-banner-content">
        <span>{type === 'error' ? '⚠️' : type === 'warning' ? '⚡' : 'ℹ️'}</span>{' '}
        {message}
      </div>
      <div className="error-banner-actions">
        {onRetry && (
          <button className="btn btn-sm btn-secondary" onClick={onRetry}>
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

'use client';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
}

export default function LoadingSpinner({
  size = 'medium',
  message,
}: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner-container">
      <div className={`spinner ${size}`} role="status" aria-label="Loading" />
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
}

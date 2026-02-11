type LoadingSpinnerProps = {
  className?: string
  label?: string
}

export default function LoadingSpinner({ className = '', label = 'Loading' }: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white ${className}`}
    >
      <span className="sr-only">{label}</span>
    </span>
  )
}

interface Props {
  /** 0–100; null = indeterminado. */
  value: number | null;
  label: string;
}

export function ProgressBar({ value, label }: Props) {
  const clamped = value === null ? null : Math.min(100, Math.max(0, value));
  return (
    <div className="progress">
      <div className="progress-header">
        <span>{label}</span>
        {clamped !== null && <span className="progress-value">{Math.round(clamped)}%</span>}
      </div>
      <div
        className={`progress-track${clamped === null ? ' indeterminate' : ''}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped === null ? undefined : Math.round(clamped)}
      >
        <div className="progress-fill" style={clamped === null ? undefined : { width: `${clamped}%` }} />
      </div>
    </div>
  );
}

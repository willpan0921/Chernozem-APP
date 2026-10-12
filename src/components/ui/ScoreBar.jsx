// WHAT THIS FILE DOES
// A labelled horizontal bar showing a score from 0 to 1, like
// "Soil value ———— 0.88".
//
// WHAT IT RECEIVES
// label - text on the left
// value - a number from 0 to 1
// tone  - "green" (default), "red", "blue" or "amber"
// show  - the text on the right; defaults to the value with 2 decimals

export default function ScoreBar({ label, value, tone = "green", show }) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`score-bar score-bar-${tone}`}>
      <span>{label}</span>
      <div className="score-bar-track" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} aria-label={label}>
        <div className="score-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="score-bar-value">{show ?? value.toFixed(2)}</span>
    </div>
  );
}

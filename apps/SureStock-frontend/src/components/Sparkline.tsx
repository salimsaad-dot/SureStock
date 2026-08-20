import { Line, LineChart, ResponsiveContainer } from 'recharts'
import type { StatTone } from './StatCard'

// Tailwind/recharts both need literal values, not `bg-*` classes — these
// resolve through the CSS custom properties in lib/tokens.css, so a
// sparkline still adapts correctly in dark mode without extra logic.
const TONE_STROKE: Record<StatTone, string> = {
  neutral: 'var(--ink-faint)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
}

export interface SparklineProps {
  data: number[]
  tone: StatTone
}

/** A decorative trend line inside a StatCard — no axes, grid, or tooltip; the number itself is the real data point. */
export function Sparkline({ data, tone }: SparklineProps) {
  const points = data.map((value, i) => ({ i, value }))

  return (
    <div className="h-8 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="value" stroke={TONE_STROKE[tone]} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

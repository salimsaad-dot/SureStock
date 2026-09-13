import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { PaymentBreakdownItem, PaymentMethod } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'

// Three colorblind-validated chart hues (Blueprint §02) plus a plain
// gray for the least-common tender — gray carries no hue to confuse,
// so it's safe to add without re-running the validator.
const METHOD_COLOR: Record<PaymentMethod, string> = {
  CASH: 'var(--chart-1)',
  MOBILE_MONEY: 'var(--chart-2)',
  CARD: 'var(--chart-3)',
  ACCOUNT: 'var(--ink-faint)',
}
const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Card',
  ACCOUNT: 'Account',
}

export function PaymentMethodDonut({ data }: { data: PaymentBreakdownItem[] }) {
  const total = data.reduce((sum, d) => sum + d.total, 0)

  if (data.length === 0) {
    return <p className="flex h-64 items-center justify-center text-ink-muted">No payments in this range.</p>
  }

  return (
    // Below sm, the chart gets its own full-width row (a fixed h-48, not
    // squeezed by the legend) and the legend stacks underneath — the old
    // side-by-side flex-row with a flex-none legend forced the pie chart
    // into a shrinking sliver on a phone. Each legend line also wraps its
    // amount onto a second line if it doesn't fit, instead of overflowing.
    <div className="flex flex-col gap-4 sm:h-64 sm:flex-row sm:items-center">
      <div className="h-48 sm:h-full sm:flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="method" innerRadius="60%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.method} fill={METHOD_COLOR[d.method]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => [formatPesewas(Number(value)), METHOD_LABEL[item.payload.method as PaymentMethod]]}
              contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-2 sm:flex-none">
        {data.map((d) => (
          <li key={d.method} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-display text-[12.5px]">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: METHOD_COLOR[d.method] }} />
            <span className="text-ink">{METHOD_LABEL[d.method]}</span>
            <span className="text-ink-faint">
              {formatPesewas(d.total)} ({total > 0 ? ((d.total / total) * 100).toFixed(1) : '0.0'}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

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
    <div className="flex h-64 items-center gap-4">
      <div className="h-full flex-1">
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
      <ul className="flex flex-none flex-col gap-2">
        {data.map((d) => (
          <li key={d.method} className="flex items-center gap-2 font-display text-[12.5px]">
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

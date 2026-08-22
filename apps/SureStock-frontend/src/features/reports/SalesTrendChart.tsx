import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReportsTrendPoint } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'

const DATE_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export function SalesTrendChart({ data }: { data: ReportsTrendPoint[] }) {
  const points = data.map((d) => ({ ...d, label: DATE_LABEL.format(new Date(`${d.date}T00:00:00`)) }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => formatPesewas(v).replace('GH₵ ', '')}
            tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={(value) => formatPesewas(Number(value))}
            contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="totalSales" stroke="var(--accent)" strokeWidth={2} fill="url(#salesTrendFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

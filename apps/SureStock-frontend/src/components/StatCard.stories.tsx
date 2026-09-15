import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertTriangle, Package, TrendingUp, XCircle } from 'lucide-react'
import { StatCard } from './StatCard'

const meta: Meta<typeof StatCard> = {
  title: 'Components/StatCard',
  component: StatCard,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof StatCard>

export const TotalProducts: Story = {
  args: {
    icon: <Package className="h-5 w-5" />,
    label: 'Total Products',
    value: 128,
    sublabel: 'All products in store',
    tone: 'accent',
    active: true,
  },
}

export const InStock: Story = {
  args: {
    icon: <Package className="h-5 w-5" />,
    label: 'In Stock',
    value: 94,
    sublabel: 'Products available',
    tone: 'success',
  },
}

export const LowStock: Story = {
  args: {
    icon: <AlertTriangle className="h-5 w-5" />,
    label: 'Low Stock',
    value: 12,
    sublabel: 'Need restocking',
    tone: 'warning',
  },
}

export const OutOfStock: Story = {
  args: {
    icon: <XCircle className="h-5 w-5" />,
    label: 'Out of Stock',
    value: 22,
    sublabel: 'Currently unavailable',
    tone: 'danger',
  },
}

/** Dashboard's headline figures (Revenue/Gross profit) — a tinted background, colored border, and tone-colored value, instead of the plain white default every other stat card uses. */
export const Emphasis: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        icon={<TrendingUp className="h-5 w-5" />}
        label="Revenue today"
        value="GH₵ 1,240.00"
        tone="accent"
        emphasis
        comparison={{ changePct: 12.4, goodDirectionUp: true, rangeLabel: 'vs last week' }}
      />
      <StatCard
        icon={<TrendingUp className="h-5 w-5" />}
        label="Gross profit"
        value="GH₵ 480.00"
        tone="success"
        emphasis
        comparison={{ changePct: 8.1, goodDirectionUp: true, rangeLabel: 'vs last week' }}
      />
    </div>
  ),
}

export const Row: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-3">
      <StatCard icon={<Package className="h-5 w-5" />} label="Total Products" value={128} sublabel="All products in store" tone="accent" active />
      <StatCard icon={<Package className="h-5 w-5" />} label="In Stock" value={94} sublabel="Products available" tone="success" />
      <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Low Stock" value={12} sublabel="Need restocking" tone="warning" />
      <StatCard icon={<XCircle className="h-5 w-5" />} label="Out of Stock" value={22} sublabel="Currently unavailable" tone="danger" />
    </div>
  ),
}

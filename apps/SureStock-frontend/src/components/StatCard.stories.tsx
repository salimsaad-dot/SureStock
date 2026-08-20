import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertTriangle, Package, XCircle } from 'lucide-react'
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

import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import { Pill } from './Pill'
import { Button } from './Button'
import { PageHeader } from './PageHeader'

const meta: Meta<typeof PageHeader> = {
  title: 'Components/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof PageHeader>

export const PageBare: Story = {
  args: {
    variant: 'page',
    title: 'Dashboard',
    subtitle: "Today's overview of your shop.",
  },
}

export const PageWithActions: Story = {
  args: {
    variant: 'page',
    title: 'Inventory',
    subtitle: 'Manage products, stock levels and catalogue information.',
    actions: (
      <>
        <Button variant="secondary">Import</Button>
        <Button>New product</Button>
      </>
    ),
  },
}

export const Detail: Story = {
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
  args: {
    variant: 'detail',
    title: 'Smoke Test Rice 5kg',
    subtitle: 'SKU SMOKE-RICE-5K',
    backTo: '/inventory',
    backLabel: 'Back to inventory',
    statusPill: <Pill variant="success">Active</Pill>,
  },
}

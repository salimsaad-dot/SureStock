import type { Meta, StoryObj } from '@storybook/react-vite'
import { PackageOpen } from 'lucide-react'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof EmptyState>

export const Default: Story = {
  args: {
    message: 'No purchase orders yet.',
    action: <Button size="default">Create purchase order</Button>,
  },
}

export const WithIcon: Story = {
  args: {
    icon: <PackageOpen className="h-5 w-5" aria-hidden="true" />,
    message: 'No purchase orders yet.',
    action: <Button size="default">Create purchase order</Button>,
  },
}

export const MessageOnly: Story = {
  args: {
    message: 'No results match your filters.',
  },
}

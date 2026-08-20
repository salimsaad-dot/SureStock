import type { Meta, StoryObj } from '@storybook/react-vite'
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

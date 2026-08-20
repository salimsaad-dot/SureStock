import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Charge GH₵ 24.50' },
}
export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = { args: { variant: 'primary' } }
export const Secondary: Story = { args: { variant: 'secondary', children: 'Hold' } }
export const Danger: Story = { args: { variant: 'danger', children: 'Refund' } }
export const Loading: Story = { args: { variant: 'primary', isLoading: true, children: 'Saving…' } }
export const Disabled: Story = { args: { variant: 'secondary', disabled: true, children: 'Unavailable' } }
export const SpeedMode: Story = { args: { variant: 'primary', size: 'speed', children: 'Charge GH₵ 24.50' } }

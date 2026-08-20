import type { Meta, StoryObj } from '@storybook/react-vite'
import { Pill } from './Pill'

const meta: Meta<typeof Pill> = {
  title: 'Components/Pill',
  component: Pill,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Pill>

export const InStock: Story = { args: { variant: 'success', children: 'In stock' } }
export const Low: Story = { args: { variant: 'warning', children: 'Low' } }
export const Out: Story = { args: { variant: 'danger', children: 'Out' } }

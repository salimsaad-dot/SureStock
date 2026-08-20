import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextInput } from './TextInput'

const meta: Meta<typeof TextInput> = {
  title: 'Components/TextInput',
  component: TextInput,
  tags: ['autodocs'],
  args: { label: 'Cost price', placeholder: 'Search or scan…' },
}
export default meta
type Story = StoryObj<typeof TextInput>

export const Default: Story = {}
export const Disabled: Story = { args: { value: 'MIL-400', disabled: true } }
export const WithError: Story = {
  args: { label: 'Cost price', defaultValue: 'abc', error: "Cost price 'abc' is not a valid amount" },
}

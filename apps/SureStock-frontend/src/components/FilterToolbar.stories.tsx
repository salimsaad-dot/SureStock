import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextInput } from './TextInput'
import { FilterToolbar } from './FilterToolbar'

const meta: Meta<typeof FilterToolbar> = {
  title: 'Components/FilterToolbar',
  component: FilterToolbar,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof FilterToolbar>

function SelectField({ label }: { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[13px] font-medium text-ink">{label}</span>
      <select className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink">
        <option>All</option>
      </select>
    </label>
  )
}

export const Default: Story = {
  args: {
    children: (
      <>
        <TextInput label="Search" placeholder="Search by name or SKU" />
        <SelectField label="Category" />
        <SelectField label="Status" />
      </>
    ),
  },
}

export const WithClear: Story = {
  args: {
    onClear: () => {},
    children: (
      <>
        <TextInput label="Search" placeholder="Search by name or SKU" defaultValue="rice" />
        <SelectField label="Category" />
      </>
    ),
  },
}

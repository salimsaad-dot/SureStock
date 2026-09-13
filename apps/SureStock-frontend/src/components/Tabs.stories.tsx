import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Tabs } from './Tabs'

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Tabs>

const TAB_ITEMS = [
  { key: 'transactions', label: 'Transactions' },
  { key: 'shifts', label: 'Till shifts' },
]

function Demo() {
  const [active, setActive] = useState('transactions')
  return <Tabs tabs={TAB_ITEMS} active={active} onChange={setActive} />
}

export const Interactive: Story = {
  render: () => <Demo />,
}

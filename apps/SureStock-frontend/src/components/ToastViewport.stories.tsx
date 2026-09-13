import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'
import { ToastViewport } from './ToastViewport'
import { useToast } from '../lib/toast-store'

const meta: Meta = {
  title: 'Components/Toast',
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj

function Demo() {
  const show = useToast()
  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => show('Product saved.')}>Show toast</Button>
      <Button onClick={() => show('Purchase order received.', 'success')}>Show success toast</Button>
      <Button variant="secondary" onClick={() => show('Stock is running low on 3 items.', 'warning')}>
        Show warning toast
      </Button>
      <Button variant="danger" onClick={() => show('3 sales failed — tap to review', 'error')}>
        Show error toast
      </Button>
      <ToastViewport />
    </div>
  )
}

export const Interactive: Story = {
  render: () => <Demo />,
}

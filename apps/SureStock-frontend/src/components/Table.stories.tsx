import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from './Table'

const meta: Meta = {
  title: 'Components/Table',
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj

const rows = [
  { sku: 'BRD-SML', name: 'Sugar Bread Loaf — Small', stock: 5 },
  { sku: 'MIL-400', name: 'Milk 400ml', stock: 22 },
  { sku: 'RCE-5KG', name: 'Rice 5kg bag', stock: 0 },
]

export const WithData: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Stock</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.sku}>
            <TableCell className="font-mono">{r.sku}</TableCell>
            <TableCell>{r.name}</TableCell>
            <TableCell className="font-mono tabular-nums">{r.stock}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}

export const Loading: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Stock</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableSkeleton rows={4} columns={3} />
      </TableBody>
    </Table>
  ),
}

export const Empty: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Stock</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty
          columns={3}
          message="No products match these filters."
          action={<Button size="default">Clear filters</Button>}
        />
      </TableBody>
    </Table>
  ),
}

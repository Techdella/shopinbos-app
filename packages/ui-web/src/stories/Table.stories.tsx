import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge, Table, type Column } from '../index';

interface Row {
  number: string;
  customer: string;
  total: string;
  status: 'Paid' | 'Pending';
}

const rows: Row[] = [
  { number: 'SB-1047', customer: 'Kemi O.', total: '₦15,500', status: 'Paid' },
  { number: 'SB-1046', customer: 'Halima M.', total: '₦38,500', status: 'Pending' },
  { number: 'SB-1045', customer: 'Seun D.', total: '₦18,500', status: 'Paid' },
];

const columns: Column<Row>[] = [
  {
    key: 'number',
    header: 'Order',
    cell: (r) => <span className="font-semibold">{r.number}</span>,
  },
  { key: 'customer', header: 'Customer', cell: (r) => r.customer },
  {
    key: 'status',
    header: 'Payment',
    cell: (r) => <Badge tone={r.status === 'Paid' ? 'ok' : 'warn'}>{r.status}</Badge>,
  },
  { key: 'total', header: 'Total', align: 'right', cell: (r) => r.total },
];

const meta = {
  title: 'Data/Table',
  component: Table<Row>,
  args: { columns, rows, rowKey: (r: Row) => r.number, caption: 'Orders' },
} satisfies Meta<typeof Table<Row>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Orders: Story = {};
export const Empty: Story = {
  args: { rows: [], empty: 'No orders yet. Share your store to get the first one.' },
};

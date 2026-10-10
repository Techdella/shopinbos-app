import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../index';

const meta = { title: 'Basics/Badge', component: Badge } satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge tone="ok">Paid</Badge>
      <Badge tone="warn">Pending transfer</Badge>
      <Badge tone="accent">Low stock</Badge>
      <Badge tone="info">Dropship</Badge>
      <Badge tone="ai">Draft ready</Badge>
      <Badge tone="ink">Live</Badge>
      <Badge>WhatsApp</Badge>
    </div>
  ),
};

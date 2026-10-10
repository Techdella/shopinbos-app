import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, Stat } from '../index';

const meta = {
  title: 'Data/Stat',
  component: Stat,
  args: { label: 'Orders', value: '12' },
} satisfies Meta<typeof Stat>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tiles: Story = {
  render: () => (
    <div className="grid max-w-xl grid-cols-3 gap-3">
      <Card>
        <Stat label="Orders" value="12" delta="+3 vs yesterday" trend="up" />
      </Card>
      <Card>
        <Stat label="Visits" value="418" delta="−4%" trend="down" />
      </Card>
      <Card>
        <Stat label="Chats" value="27" />
      </Card>
    </div>
  ),
};

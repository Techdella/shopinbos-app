import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Card } from '../index';

const meta = { title: 'Basics/Card', component: Card } satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Paper: Story = {
  args: {
    className: 'max-w-sm',
    children: (
      <>
        <p className="text-sm text-sub">Your shop made</p>
        <p className="text-2xl font-bold">₦86,400 today</p>
      </>
    ),
  },
};
export const Peggy: Story = {
  args: {
    tone: 'ai',
    className: 'max-w-sm',
    children: (
      <div className="flex flex-col gap-3">
        <p className="font-semibold">Peggy: 3 replies are ready for you to check.</p>
        <Button variant="ai" size="sm">
          Review drafts
        </Button>
      </div>
    ),
  },
};
export const LowStock: Story = {
  args: { tone: 'accent', className: 'max-w-sm', children: 'Linen shirt is low. 3 left.' },
};

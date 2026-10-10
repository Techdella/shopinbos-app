import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button, Sheet } from '../index';

const meta = {
  title: 'Overlays/Sheet',
  component: Sheet,
  args: { open: false, onClose: () => {}, title: 'Create', children: null },
} satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CreateSheet: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="accent" onClick={() => setOpen(true)}>
          Create
        </Button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Create">
          <div className="grid grid-cols-2 gap-2">
            {['Add product', 'Record sale', 'Broadcast', 'Make video'].map((a) => (
              <Button key={a} variant="ghost">
                {a}
              </Button>
            ))}
          </div>
        </Sheet>
      </>
    );
  },
};

export const AskPeggyDrawer: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="ai" onClick={() => setOpen(true)}>
          Ask Peggy
        </Button>
        <Sheet side="right" open={open} onClose={() => setOpen(false)} title="Ask Peggy">
          <p className="text-sub">How did I do this week?</p>
        </Sheet>
      </>
    );
  },
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Chip } from '../index';

const meta = { title: 'Basics/Chip', component: Chip, args: { children: 'All' } } satisfies Meta<
  typeof Chip
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };

const filters = ['All', 'New', 'To deliver', 'Dropship', 'Done'];
export const OrderFilters: Story = {
  render: () => {
    const [value, setValue] = useState('All');
    return (
      <div className="flex gap-2">
        {filters.map((f) => (
          <Chip key={f} selected={f === value} onClick={() => setValue(f)}>
            {f}
          </Chip>
        ))}
      </div>
    );
  },
};

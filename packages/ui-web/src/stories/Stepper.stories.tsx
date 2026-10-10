import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Stepper } from '../index';

const meta = {
  title: 'Basics/Stepper',
  component: Stepper,
  args: { label: 'Quantity', value: 1, onChange: () => {} },
} satisfies Meta<typeof Stepper>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Quantity: Story = {
  render: (args) => {
    const [v, setV] = useState(10);
    return <Stepper {...args} value={v} onChange={setV} min={1} />;
  },
};

const ngn = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG')}`;
export const DropshipPrice: Story = {
  render: () => {
    const [v, setV] = useState(1_300_000);
    return (
      <Stepper
        label="Your price"
        value={v}
        onChange={setV}
        step={50_000}
        min={600_000}
        format={ngn}
      />
    );
  },
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Toggle } from '../index';

const meta = {
  title: 'Basics/Toggle',
  component: Toggle,
  args: {
    label: 'Pay on delivery',
    description: 'Up to ₦50,000, verified phone numbers only',
    checked: true,
    onChange: () => {},
  },
} satisfies Meta<typeof Toggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: (args) => {
    const [on, setOn] = useState(args.checked);
    return <Toggle {...args} checked={on} onChange={setOn} className="max-w-md" />;
  },
};
export const Disabled: Story = { args: { disabled: true } };

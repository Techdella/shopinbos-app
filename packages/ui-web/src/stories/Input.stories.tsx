import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '../index';

const meta = {
  title: 'Basics/Input',
  component: Input,
  args: { label: 'Phone number', placeholder: '0803 123 4567' },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithPrefix: Story = { args: { leading: '+234', hint: 'We send a code on WhatsApp' } };
export const WithError: Story = {
  args: { error: 'Enter a Nigerian phone number', defaultValue: '0803' },
};
export const Price: Story = {
  args: { label: 'Price', leading: '₦', inputMode: 'numeric', placeholder: '18,500' },
};

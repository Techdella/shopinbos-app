import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../index';

const meta = {
  title: 'Basics/Button',
  component: Button,
  args: { children: 'Add product' },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Accent: Story = { args: { variant: 'accent', children: 'Publish' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'View store' } };
export const AskRex: Story = { args: { variant: 'ai', children: 'Ask Rex' } };
export const Loading: Story = { args: { loading: true, children: 'Saving' } };
export const Block: Story = {
  args: { block: true, size: 'lg', variant: 'accent', children: 'Launch my shop' },
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Tabs } from '../index';

const meta = {
  title: 'Navigation/Tabs',
  component: Tabs,
  args: { label: 'Product', value: 'overview', onChange: () => {}, items: [] },
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ProductTabs: Story = {
  render: () => {
    const [v, setV] = useState('overview');
    return (
      <Tabs
        label="Product"
        value={v}
        onChange={setV}
        items={[
          { key: 'overview', label: 'Overview', content: '214 views · 18 added to bag · 9 sold' },
          { key: 'stock', label: 'Stock history', content: 'Restock +10 · Sale −1' },
          { key: 'variants', label: 'Variants', content: 'S, M, L · Sand, Olive' },
        ]}
      />
    );
  },
};

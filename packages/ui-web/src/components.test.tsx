import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Button,
  Chip,
  Input,
  Stepper,
  Table,
  Tabs,
  ToastProvider,
  Toggle,
  useToast,
} from './index';

describe('Button', () => {
  it('is a pill and defaults to type=button', () => {
    render(<Button>Add product</Button>);
    const btn = screen.getByRole('button', { name: 'Add product' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn.className).toContain('rounded-pill');
  });

  it('disables while loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('Chip', () => {
  it('exposes the selected state', () => {
    render(<Chip selected>All</Chip>);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Toggle', () => {
  it('flips on click and is labelled', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Pay on delivery" />);
    await userEvent.click(screen.getByRole('switch', { name: 'Pay on delivery' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Input', () => {
  it('links the label and error', () => {
    render(<Input label="Phone number" error="Enter a Nigerian number" />);
    const input = screen.getByLabelText('Phone number');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a Nigerian number');
  });
});

describe('Stepper', () => {
  function Harness() {
    const [v, setV] = useState(1);
    return <Stepper label="Quantity" value={v} onChange={setV} min={1} max={3} />;
  }
  it('clamps to min and max', async () => {
    render(<Harness />);
    const dec = screen.getByRole('button', { name: 'Decrease Quantity' });
    const inc = screen.getByRole('button', { name: 'Increase Quantity' });
    expect(dec).toBeDisabled();
    await userEvent.click(inc);
    await userEvent.click(inc);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    expect(inc).toBeDisabled();
  });
});

describe('Tabs', () => {
  function Harness() {
    const [v, setV] = useState('a');
    return (
      <Tabs
        label="Product"
        value={v}
        onChange={setV}
        items={[
          { key: 'a', label: 'Overview', content: 'overview body' },
          { key: 'b', label: 'Stock history', content: 'stock body' },
        ]}
      />
    );
  }
  it('switches with arrow keys', async () => {
    render(<Harness />);
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Stock history' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('stock body');
  });
});

describe('Table', () => {
  it('shows the empty state', () => {
    render(
      <Table
        columns={[{ key: 'n', header: 'Name', cell: (r: { n: string }) => r.n }]}
        rows={[]}
        rowKey={(r) => r.n}
        empty="No orders yet"
      />,
    );
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('renders tone classes', () => {
    render(<Badge tone="ok">Paid</Badge>);
    expect(screen.getByText('Paid').className).toContain('bg-ok-soft');
  });
});

describe('Toast', () => {
  function Trigger({ onUndo }: { onUndo: () => void }) {
    const toast = useToast();
    return (
      <Button
        onClick={() =>
          toast({ message: 'Section removed', action: { label: 'Undo', onClick: onUndo } })
        }
      >
        Remove
      </Button>
    );
  }
  it('shows a message with an Undo action', async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={onUndo} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Section removed')).toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(onUndo).toHaveBeenCalled();
    expect(screen.queryByText('Section removed')).not.toBeInTheDocument();
  });
});

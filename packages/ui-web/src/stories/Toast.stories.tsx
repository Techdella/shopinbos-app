import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, ToastProvider, useToast } from '../index';

function Demo() {
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <Button
        onClick={() =>
          toast({ message: 'Section added', action: { label: 'Undo', onClick: () => {} } })
        }
      >
        Add section
      </Button>
      <Button variant="ghost" onClick={() => toast({ message: 'Payout sent', tone: 'ok' })}>
        Success
      </Button>
      <Button
        variant="ghost"
        onClick={() => toast({ message: "Couldn't save. Try again.", tone: 'error' })}
      >
        Error
      </Button>
    </div>
  );
}

const meta = {
  title: 'Overlays/Toast',
  component: Demo,
  decorators: [
    (S) => (
      <ToastProvider>
        <S />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof Demo>;
export default meta;
export const Default: StoryObj<typeof meta> = {};

import type { Preview } from '@storybook/react-vite';
import './preview.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
    viewport: {
      options: {
        mobile: { name: 'Mobile 390', styles: { width: '390px', height: '844px' } },
        web: { name: 'Web 1440', styles: { width: '1440px', height: '900px' } },
      },
    },
  },
};

export default preview;

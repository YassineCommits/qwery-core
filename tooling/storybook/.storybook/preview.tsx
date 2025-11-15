import { useEffect } from 'react';

import type { Preview } from '@storybook/react';
import { ThemeProvider } from 'next-themes';

import '../../../apps/web/styles/global.css';

const ThemeWrapper = ({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: string;
}) => {
  return (
    <ThemeProvider
      attribute="class"
      enableSystem
      disableTransitionOnChange
      defaultTheme={theme}
      enableColorScheme={false}
    >
      <div className="min-h-screen w-full p-4">{children}</div>
    </ThemeProvider>
  );
};

const wrapper = (Story: any, context: any) => {
  const theme =
    context?.globals?.backgrounds?.value == '#333' ? 'dark' : 'light';
  console.log('theme', theme);

  return (
    <ThemeWrapper theme={theme as string}>
      <Story />
    </ThemeWrapper>
  );
};

const decorators = [wrapper];

const preview: Preview = {
  decorators,
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;

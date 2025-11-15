import type { Meta, StoryObj } from '@storybook/react';
import QweryAgentUI from './agent-ui';

// ChatBotDemo is the default component export
const meta: Meta<typeof QweryAgentUI> = {
  title: 'Qwery/Agent UI',
  component: QweryAgentUI,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof QweryAgentUI>;

export const Default: Story = {
  render: () => <QweryAgentUI data-test="agent-ui-story" />,
};

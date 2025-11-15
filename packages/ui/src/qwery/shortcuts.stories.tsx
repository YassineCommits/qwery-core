import * as React from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Shortcuts } from './shortcuts';

const meta: Meta<typeof Shortcuts> = {
  title: 'Qwery/Shortcuts',
  component: Shortcuts,
};

export default meta;
type Story = StoryObj<typeof Shortcuts>;

export const Simple: Story = {
  render: () => (
    <Shortcuts
      items={[
        { text: 'New Agent', keys: ['⇧', '⌘', 'L'] },
        { text: 'Hide Terminal', keys: ['⌘', 'J'] },
        { text: 'Hide Files', keys: ['⌘', 'B'], highlighted: true },
        { text: 'Search Files', keys: ['⌘', 'P'] },
        { text: 'Open Browser', keys: ['⇧', '⌘', 'B'] },
      ]}
    />
  ),
};

export const WithTextKeys: Story = {
  render: () => (
    <Shortcuts
      items={[
        { text: 'New Agent', keys: ['Shift', 'Command', 'L'] },
        { text: 'Hide Terminal', keys: ['Command', 'J'] },
        { text: 'Hide Files', keys: ['Command', 'B'] },
        { text: 'Search Files', keys: ['Command', 'P'] },
        { text: 'Open Browser', keys: ['Shift', 'Command', 'B'] },
      ]}
    />
  ),
};

export const SingleKey: Story = {
  render: () => (
    <Shortcuts
      items={[
        { text: 'Save', keys: ['⌘', 'S'] },
        { text: 'Copy', keys: ['⌘', 'C'] },
        { text: 'Paste', keys: ['⌘', 'V'] },
        { text: 'Undo', keys: ['⌘', 'Z'] },
      ]}
    />
  ),
};

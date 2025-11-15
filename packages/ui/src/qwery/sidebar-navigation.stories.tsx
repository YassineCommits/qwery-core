import React from 'react';
import { MemoryRouter } from 'react-router';
import type { Meta, StoryObj } from '@storybook/react';
import { SidebarNavigation } from './sidebar-navigation';
import type { SidebarConfig } from './sidebar';
import { SidebarProvider } from '../shadcn/sidebar';

const config: SidebarConfig = {
  routes: [
    {
      label: 'Dashboard',
      children: [
        {
          label: 'Dashboard',
          path: '/',
          Icon: <span data-test="icon-dashboard">🏠</span>,
          end: true,
        },
      ],
    },
  ],
};

const meta: Meta<typeof SidebarNavigation> = {
  title: 'Qwery/SidebarNavigation',
  component: SidebarNavigation,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/']}>
        <SidebarProvider defaultOpen={true}>
          <div className="min-h-screen w-64 bg-gray-50 p-2">
            <Story />
          </div>
        </SidebarProvider>
      </MemoryRouter>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SidebarNavigation>;

export const Simple: Story = {
  args: {
    config,
  },
};

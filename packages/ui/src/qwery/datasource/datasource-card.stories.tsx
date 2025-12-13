import type { Meta, StoryObj } from '@storybook/react';
import { ArrowRight } from 'lucide-react';

import { Trans } from '../trans';
import { DatasourceCard } from './datasource-card';

const meta: Meta<typeof DatasourceCard> = {
  title: 'Qwery/Datasource/DatasourceCard',
  component: DatasourceCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof DatasourceCard>;

const baseDatasource = {
  id: 'ds_123',
  name: 'PostgreSQL Production',
  createdAt: new Date('2024-01-15'),
  createdBy: 'john.doe@example.com',
  provider: 'postgresql',
};

export const Basic: Story = {
  args: {
    ...baseDatasource,
  },
};

export const WithLogo: Story = {
  args: {
    ...baseDatasource,
    provider: 'postgresql',
    logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg',
  },
};

export const WithViewPath: Story = {
  args: {
    ...baseDatasource,
    viewButton: (
      <a
        href="/project/test-project/datasources/postgresql-production"
        className="flex w-full items-center justify-center gap-2 px-4 py-3"
      >
        <span className="text-foreground group-hover/btn:text-foreground text-sm font-medium transition-colors">
          <Trans i18nKey="datasources:card.view" defaults="View" />
        </span>
        <ArrowRight className="text-muted-foreground group-hover/btn:text-foreground h-4 w-4 transition-all group-hover/btn:translate-x-1" />
      </a>
    ),
  },
};

export const WithOnClick: Story = {
  args: {
    ...baseDatasource,
    onClick: () => alert('Card clicked!'),
  },
};

export const LongName: Story = {
  args: {
    ...baseDatasource,
    name: 'Very Long Datasource Name That Should Truncate Properly',
  },
};

export const RecentDate: Story = {
  args: {
    ...baseDatasource,
    createdAt: new Date(),
  },
};

export const OldDate: Story = {
  args: {
    ...baseDatasource,
    createdAt: new Date('2020-01-01'),
  },
};

export const WithLogoError: Story = {
  args: {
    ...baseDatasource,
    logo: 'https://invalid-url-that-will-fail.com/logo.png',
    onLogoError: (id) => console.log('Logo error for:', id),
  },
};

export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <DatasourceCard
        {...baseDatasource}
        name="PostgreSQL Production"
        provider="postgresql"
        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg"
      />
      <DatasourceCard
        {...baseDatasource}
        id="ds_124"
        name="MySQL Development"
        provider="mysql"
        logo="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg"
      />
      <DatasourceCard
        {...baseDatasource}
        id="ds_125"
        name="PGLite Database"
        provider="pglite"
      />
    </div>
  ),
};

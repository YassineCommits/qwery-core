import { Outlet } from 'react-router';

import {
  Page,
  PageFooter,
  PageMobileNavigation,
  PageNavigation,
  PageTopNavigation,
  AgentSidebar,
} from '@qwery/ui/page';
import { SidebarProvider, SidebarTrigger } from '@qwery/ui/shadcn-sidebar';

import { sidebarStateCookie } from '~/lib/cookies';
import type { Route } from '~/types/app/routes/project/+types/layout';

import { LayoutFooter } from '../layout/_components/layout-footer';
import { LayoutMobileNavigation } from '../layout/_components/layout-mobile-navigation';
import { LayoutTopBar } from '../layout/_components/layout-topbar';
import { ProjectSidebar } from './_components/project-sidebar';
import { AgentUIWrapper } from './_components/agent-ui-wrapper';
import { useWorkspace } from '~/lib/context/workspace-context';
import { WorkspaceModeEnum } from '@qwery/domain/enums';
import { AgentTabs } from '@qwery/ui/ai';

export async function loader(args: Route.LoaderArgs) {
  const request = args.request;

  const [layoutState] = await Promise.all([getLayoutState(request)]);

  return {
    layoutState,
  };
}

async function getLayoutState(request: Request) {
  const cookieHeader = request.headers.get('Cookie');
  const sidebarOpenCookie = await sidebarStateCookie.parse(cookieHeader);

  const sidebarOpenCookieValue = sidebarOpenCookie
    ? sidebarOpenCookie === 'false'
    : true;

  return {
    open: sidebarOpenCookieValue,
  };
}

function SidebarLayout(props: Route.ComponentProps & React.PropsWithChildren) {
  const { layoutState } = props.loaderData;

  return (
    <SidebarProvider defaultOpen={layoutState.open}>
      <Page>
        <SidebarTrigger />
        <PageTopNavigation>
          <LayoutTopBar />
        </PageTopNavigation>
        <PageNavigation>
          <ProjectSidebar />
        </PageNavigation>
        <PageMobileNavigation className={'flex items-center justify-between'}>
          <LayoutMobileNavigation />
        </PageMobileNavigation>
        <PageFooter>
          <LayoutFooter />
        </PageFooter>
        <AgentSidebar>
          <AgentUIWrapper conversationSlug="default" />
        </AgentSidebar>
        {props.children}
      </Page>
    </SidebarProvider>
  );
}

function SimpleModeSidebarLayout(
  props: Route.ComponentProps & React.PropsWithChildren,
) {
  return (
    <Page>
      <PageTopNavigation>
        <LayoutTopBar />
      </PageTopNavigation>
      <PageMobileNavigation className={'flex items-center justify-between'}>
        <LayoutMobileNavigation />
      </PageMobileNavigation>
      <PageFooter>
        <LayoutFooter />
      </PageFooter>
      <AgentSidebar>
        <AgentTabs
          tabs={[
            {
              id: 'query-sql-results',
              title: 'Results',
              description: 'Query SQL Results',
              component: <div>Query SQL Results</div>,
            },
            {
              id: 'query-sql-visualisation',
              title: 'Visualisation',
              description: 'Visualisation of the query SQL results',
              component: <div>Query SQL Results</div>,
            },
          ]}
        />
      </AgentSidebar>
      {props.children}
    </Page>
  );
}

export default function Layout(props: Route.ComponentProps) {
  const { workspace } = useWorkspace();
  const SideBar =
    workspace.mode === WorkspaceModeEnum.SIMPLE
      ? SimpleModeSidebarLayout
      : SidebarLayout;
  return (
    <SideBar {...props}>
      <Outlet />
    </SideBar>
  );
}

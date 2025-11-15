import { useLocation, Link } from 'react-router';
import { useSidebar } from '../shadcn/sidebar';
import { SidebarConfig } from './sidebar';
import {
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuAction,
} from '../shadcn/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../shadcn/collapsible';
import { If } from './if';
import { cn, isRouteActive } from '../lib/utils';
import { Trans } from './trans';
import { ChevronDown } from 'lucide-react';

export function SidebarNavigation({
  config,
}: React.PropsWithChildren<{
  config: SidebarConfig;
}>) {
  const currentPath = useLocation().pathname ?? '';
  const { open } = useSidebar();

  return (
    <>
      {config.routes.map((item, index) => {
        const isLast = index === config.routes.length - 1;

        if ('divider' in item) {
          return <SidebarSeparator key={`divider-${index}`} />;
        }

        if ('children' in item) {
          const Container = (props: React.PropsWithChildren) => {
            if (item.collapsible) {
              return (
                <Collapsible
                  defaultOpen={!item.collapsed}
                  className={'group/collapsible'}
                >
                  {props.children}
                </Collapsible>
              );
            }

            return props.children;
          };

          const ContentContainer = (props: React.PropsWithChildren) => {
            if (item.collapsible) {
              return <CollapsibleContent>{props.children}</CollapsibleContent>;
            }

            return props.children;
          };

          return (
            <Container key={`collapsible-${index}`}>
              <SidebarGroup key={item.label}>
                <If
                  condition={item.collapsible}
                  fallback={
                    <SidebarGroupLabel className={cn({ hidden: !open })}>
                      <Trans i18nKey={item.label} defaults={item.label} />
                    </SidebarGroupLabel>
                  }
                >
                  <SidebarGroupLabel className={cn({ hidden: !open })} asChild>
                    <CollapsibleTrigger>
                      <Trans i18nKey={item.label} defaults={item.label} />
                      <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                </If>

                <If condition={item.renderAction}>
                  <SidebarGroupAction title={item.label}>
                    {item.renderAction}
                  </SidebarGroupAction>
                </If>

                <SidebarGroupContent>
                  <SidebarMenu>
                    <ContentContainer>
                      {item.children.map((child, childIndex) => {
                        const Container = (props: React.PropsWithChildren) => {
                          if ('collapsible' in child && child.collapsible) {
                            return (
                              <Collapsible
                                defaultOpen={!child.collapsed}
                                className={'group/collapsible'}
                              >
                                {props.children}
                              </Collapsible>
                            );
                          }

                          return props.children;
                        };

                        const ContentContainer = (
                          props: React.PropsWithChildren,
                        ) => {
                          if ('collapsible' in child && child.collapsible) {
                            return (
                              <CollapsibleContent>
                                {props.children}
                              </CollapsibleContent>
                            );
                          }

                          return props.children;
                        };

                        const TriggerItem = () => {
                          if ('collapsible' in child && child.collapsible) {
                            return (
                              <CollapsibleTrigger asChild>
                                <SidebarMenuButton tooltip={child.label}>
                                  <div
                                    className={cn('flex items-center gap-2', {
                                      'mx-auto w-full gap-0 [&>svg]:flex-1 [&>svg]:shrink-0':
                                        !open,
                                    })}
                                  >
                                    {child.Icon}
                                    <span
                                      className={cn(
                                        'transition-width w-auto transition-opacity duration-500',
                                        {
                                          'w-0 opacity-0': !open,
                                        },
                                      )}
                                    >
                                      <Trans
                                        i18nKey={child.label}
                                        defaults={child.label}
                                      />
                                    </span>

                                    <ChevronDown
                                      className={cn(
                                        'ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180',
                                        {
                                          'hidden size-0': !open,
                                        },
                                      )}
                                    />
                                  </div>
                                </SidebarMenuButton>
                              </CollapsibleTrigger>
                            );
                          }

                          const path = 'path' in child ? child.path : '';
                          const end = 'end' in child ? child.end : false;

                          const isActive = isRouteActive(
                            path,
                            currentPath,
                            end,
                          );

                          return (
                            <SidebarMenuButton
                              asChild
                              isActive={isActive}
                              tooltip={child.label}
                            >
                              <Link
                                prefetch={'intent'}
                                className={cn('flex items-center', {
                                  'mx-auto w-full gap-0! [&>svg]:flex-1': !open,
                                })}
                                to={path}
                              >
                                {child.Icon}
                                <span
                                  className={cn(
                                    'w-auto transition-opacity duration-300',
                                    {
                                      'w-0 opacity-0': !open,
                                    },
                                  )}
                                >
                                  <Trans
                                    i18nKey={child.label}
                                    defaults={child.label}
                                  />
                                </span>
                              </Link>
                            </SidebarMenuButton>
                          );
                        };

                        return (
                          <Container key={`group-${index}-${childIndex}`}>
                            <SidebarMenuItem>
                              <TriggerItem />

                              <ContentContainer>
                                <If condition={child.children}>
                                  {(children) => (
                                    <SidebarMenuSub
                                      className={cn({
                                        'mx-0 px-1.5': !open,
                                      })}
                                    >
                                      {children.map((child) => {
                                        const isActive = isRouteActive(
                                          child.path,
                                          currentPath,
                                          child.end,
                                        );

                                        const linkClassName = cn(
                                          'flex items-center',
                                          {
                                            'mx-auto w-full gap-0! [&>svg]:flex-1':
                                              !open,
                                          },
                                        );

                                        const spanClassName = cn(
                                          'w-auto transition-opacity duration-300',
                                          {
                                            'w-0 opacity-0': !open,
                                          },
                                        );

                                        return (
                                          <SidebarMenuSubItem key={child.path}>
                                            <SidebarMenuSubButton
                                              isActive={isActive}
                                              asChild
                                            >
                                              <Link
                                                prefetch={'intent'}
                                                className={linkClassName}
                                                to={child.path}
                                              >
                                                {child.Icon}

                                                <span className={spanClassName}>
                                                  <Trans
                                                    i18nKey={child.label}
                                                    defaults={child.label}
                                                  />
                                                </span>
                                              </Link>
                                            </SidebarMenuSubButton>
                                          </SidebarMenuSubItem>
                                        );
                                      })}
                                    </SidebarMenuSub>
                                  )}
                                </If>
                              </ContentContainer>

                              <If condition={child.renderAction}>
                                <SidebarMenuAction>
                                  {child.renderAction}
                                </SidebarMenuAction>
                              </If>
                            </SidebarMenuItem>
                          </Container>
                        );
                      })}
                    </ContentContainer>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <If condition={!open && !isLast}>
                <SidebarSeparator />
              </If>
            </Container>
          );
        }
      })}
    </>
  );
}

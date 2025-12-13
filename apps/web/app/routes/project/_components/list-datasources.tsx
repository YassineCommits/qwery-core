import { useEffect, useMemo, useRef, useState } from 'react';

import { Link } from 'react-router';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@radix-ui/react-icons';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import type { Datasource } from '@qwery/domain/entities';
import { getAllExtensionMetadata } from '@qwery/extensions-sdk';
import { Button } from '@qwery/ui/button';
import { Input } from '@qwery/ui/input';
import { Kbd, KbdGroup } from '@qwery/ui/kbd';
import { Trans } from '@qwery/ui/trans';
import { DatasourceCard } from '@qwery/ui/qwery/datasource';
import { cn } from '@qwery/ui/utils';

import { createDatasourceViewPath } from '~/config/project.navigation.config';

const ITEMS_PER_PAGE = 20;

export function ListDatasources({
  datasources,
}: {
  datasources: Datasource[];
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMac = useMemo(
    () => navigator.platform.toUpperCase().indexOf('MAC') >= 0,
    [],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // Fetch all plugin metadata to get logos
  const { data: pluginMetadata = [] } = useQuery({
    queryKey: ['all-plugin-metadata'],
    queryFn: () => getAllExtensionMetadata(),
    staleTime: 60 * 1000,
  });

  // Create a map of provider ID -> logo
  const pluginLogoMap = useMemo(() => {
    const map = new Map<string, string>();
    pluginMetadata.forEach((plugin) => {
      map.set(plugin.id, plugin.logo);
    });
    return map;
  }, [pluginMetadata]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setShouldAnimate(true);
        searchInputRef.current?.focus();

        setTimeout(() => setShouldAnimate(false), 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredDatasources = useMemo(() => {
    return datasources.filter((datasource) => {
      const matchesSearch =
        searchQuery === '' ||
        datasource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        datasource.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [datasources, searchQuery]);

  // Reset to page 1 when filtered results change
  const effectiveCurrentPage = useMemo(() => {
    const totalPages = Math.ceil(filteredDatasources.length / ITEMS_PER_PAGE);
    return currentPage > totalPages ? 1 : currentPage;
  }, [filteredDatasources.length, currentPage]);

  const totalPages = Math.ceil(filteredDatasources.length / ITEMS_PER_PAGE);
  const startIndex = (effectiveCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedDatasources = filteredDatasources.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">
          <Trans
            i18nKey="datasources:list_title"
            defaults="Saved Datasources"
          />
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative max-w-md flex-1">
          <MagnifyingGlassIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="Search datasources..."
            className={cn(
              'pr-20 pl-9 transition-all',
              shouldAnimate &&
                'ring-primary animate-pulse ring-2 ring-offset-2',
            )}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute top-1/2 right-3 -translate-y-1/2">
            <KbdGroup>
              <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>F</Kbd>
            </KbdGroup>
          </div>
        </div>
        {filteredDatasources.length > 0 && (
          <div className="text-muted-foreground text-sm whitespace-nowrap">
            <span className="font-medium">{filteredDatasources.length}</span>
            {' / '}
            <span>{datasources.length}</span>
            {' datasources'}
          </div>
        )}
      </div>

      <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
        {filteredDatasources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-foreground mb-2 text-base font-medium">
              No datasources found
            </p>
            <p className="text-muted-foreground text-sm">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'No datasources have been created yet'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {paginatedDatasources.map((datasource: Datasource) => {
                const logo = datasource.datasource_provider
                  ? pluginLogoMap.get(datasource.datasource_provider)
                  : undefined;

                return (
                  <DatasourceCard
                    key={datasource.id}
                    id={datasource.id}
                    name={datasource.name}
                    createdAt={datasource.createdAt}
                    createdBy={datasource.createdBy}
                    logo={logo}
                    provider={datasource.datasource_provider}
                    viewButton={
                      <Link
                        to={createDatasourceViewPath(datasource.slug)}
                        className="flex w-full items-center justify-center gap-2 px-3 py-2"
                      >
                        <span className="text-foreground group-hover/btn:text-foreground text-xs font-medium transition-colors">
                          <Trans
                            i18nKey="datasources:card.view"
                            defaults="View"
                          />
                        </span>
                        <ArrowRight className="text-muted-foreground group-hover/btn:text-foreground h-3.5 w-3.5 transition-all group-hover/btn:translate-x-1" />
                      </Link>
                    }
                    data-test={`datasource-card-${datasource.id}`}
                  />
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between pt-4">
                <div className="text-muted-foreground text-sm">
                  Showing {startIndex + 1} to{' '}
                  {Math.min(endIndex, filteredDatasources.length)} of{' '}
                  {filteredDatasources.length} datasources
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(effectiveCurrentPage - 1)}
                    disabled={effectiveCurrentPage === 1}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (page) => {
                        const showPage =
                          page === 1 ||
                          page === totalPages ||
                          (page >= effectiveCurrentPage - 1 &&
                            page <= effectiveCurrentPage + 1);

                        if (!showPage) {
                          if (
                            page === effectiveCurrentPage - 2 ||
                            page === effectiveCurrentPage + 2
                          ) {
                            return (
                              <span
                                key={page}
                                className="text-muted-foreground px-2"
                              >
                                ...
                              </span>
                            );
                          }
                          return null;
                        }

                        return (
                          <Button
                            key={page}
                            variant={
                              effectiveCurrentPage === page
                                ? 'default'
                                : 'outline'
                            }
                            size="sm"
                            onClick={() => goToPage(page)}
                            className="min-w-10"
                          >
                            {page}
                          </Button>
                        );
                      },
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(effectiveCurrentPage + 1)}
                    disabled={effectiveCurrentPage === totalPages}
                  >
                    Next
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

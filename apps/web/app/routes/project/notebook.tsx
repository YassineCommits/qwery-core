import { useCallback, useRef, useState } from 'react';

import { useParams } from 'react-router';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import {
  type Datasource,
  DatasourceKind,
  type DatasourceResultSet,
  type Notebook,
} from '@qwery/domain/entities';
import { getExtension } from '@qwery/extensions-sdk';
import { NotebookCellData, NotebookUI } from '@qwery/notebook';

import { useWorkspace } from '~/lib/context/workspace-context';
import { useTextToSql } from '~/lib/hooks/use-text-to-sql';
import { useNotebook } from '~/lib/mutations/use-notebook';
import { useGetDatasources } from '~/lib/queries/use-get-datasources';
import { useGetNotebookByProjectId } from '~/lib/queries/use-get-notebook';
import { useGetProjectBySlug } from '~/lib/queries/use-get-projects';

export default function NotebookPage() {
  const params = useParams();
  const slug = params.slug as string;
  const queryClient = useQueryClient();
  const { repositories } = useWorkspace();
  const projectRepository = repositories.project;
  const notebookRepository = repositories.notebook;
  const datasourceRepository = repositories.datasource;

  // Store query results by cell ID
  const [cellResults] = useState<Map<number, DatasourceResultSet>>(new Map());

  // Store query errors by cell ID
  const [cellErrors] = useState<Map<number, string>>(new Map());

  // Track which cells are generating SQL
  const [isGeneratingSql, setIsGeneratingSql] = useState<Map<number, boolean>>(
    new Map(),
  );

  // Load project
  const project = useGetProjectBySlug(projectRepository, slug);

  // Load notebook for project
  const notebook = useGetNotebookByProjectId(
    notebookRepository,
    project.data?.id || '',
  );

  // Load datasources
  const savedDatasources = useGetDatasources(datasourceRepository);

  // Track pending SQL generations by cell ID
  const pendingGenerationsRef = useRef<Map<number, string>>(new Map());

  // Set up text-to-SQL WebSocket connection
  // Only connect when we have valid project and notebook IDs
  const projectId = project.data?.id;
  const chatId = notebook.data?.id;
  const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000';

  const { generateSql, isConnected } = useTextToSql({
    projectId,
    chatId,
    baseUrl: wsBaseUrl,
    onResponse: (response) => {
      // Find which cell was generating
      const cellId = Array.from(pendingGenerationsRef.current.keys())[0];
      if (cellId === undefined) return;

      const prompt = pendingGenerationsRef.current.get(cellId);
      pendingGenerationsRef.current.delete(cellId);

      setIsGeneratingSql((prev) => {
        const next = new Map(prev);
        next.delete(cellId);
        return next;
      });

      if (!response.sql) {
        toast.error('No SQL generated');
        return;
      }

      // Get current cells from notebook
      const currentCells = notebook.data?.cells || [];
      const promptCellIndex = currentCells.findIndex(
        (c) => c.cellId === cellId,
      );
      if (promptCellIndex === -1) return;

      // Create new query cell after the prompt cell
      const maxCellId =
        currentCells.length > 0
          ? Math.max(...currentCells.map((c) => c.cellId), 0)
          : 0;
      const newCellId = maxCellId + 1;

      const newCells = [
        ...currentCells.slice(0, promptCellIndex + 1),
        {
          query: response.sql,
          cellId: newCellId,
          cellType: 'query' as const,
          datasources: currentCells[promptCellIndex]?.datasources || [],
          isActive: true,
          runMode: 'default' as const,
        },
        ...currentCells.slice(promptCellIndex + 1),
      ];

      // Update notebook with new cell
      const now = new Date();
      const notebookId = notebook?.data?.id || uuidv4();
      const updatedNotebook: Notebook = {
        id: notebookId,
        projectId: project.data?.id || '',
        name: notebook?.data?.name || 'Untitled Notebook',
        title: notebook?.data?.title || 'Untitled Notebook',
        description: notebook?.data?.description || '',
        slug: notebook?.data?.slug || '',
        version: (notebook?.data?.version || 1) + 1,
        createdAt: notebook?.data?.createdAt || now,
        updatedAt: now,
        datasources: notebook?.data?.datasources || [],
        cells: newCells,
      };

      saveNotebookMutation.mutate(updatedNotebook);
      toast.success('SQL generated successfully');
    },
    onError: (error) => {
      toast.error(`SQL generation failed: ${error}`);
      pendingGenerationsRef.current.clear();
      setIsGeneratingSql((prev) => {
        const next = new Map(prev);
        next.clear();
        return next;
      });
    },
  });

  // Save notebook mutation
  const saveNotebookMutation = useNotebook(
    notebookRepository,
    () => {
      queryClient.invalidateQueries({
        queryKey: ['notebook', project.data?.id],
      });
    },
    (error) => {
      toast.error(
        `Failed to save notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    },
  );

  // Get plugin type from datasource provider
  const getDatasourceType = (datasource: Datasource): string => {
    if (!datasource.datasource_provider) {
      throw new Error(
        `Datasource ${datasource.id} is missing datasource_provider`,
      );
    }

    return datasource.datasource_provider;
  };

  const handleRunQuery = async (
    cellId: number,
    query: string,
    datasourceId: string,
  ) => {
    if (!query.trim()) {
      toast.error('Query cannot be empty');
      return;
    }

    const datasource = savedDatasources.data?.find(
      (ds) => ds.id === datasourceId,
    );
    if (!datasource) {
      toast.error('Datasource not found');
      return;
    }

    const datasourceType = getDatasourceType(datasource);

    if (datasource.datasource_kind === DatasourceKind.EMBEDDED) {
      const extension = await getExtension(datasourceType);
      if (!extension) {
        throw new Error('Extension not found');
      }
      const driver = await extension.getDriver(
        datasource.name,
        datasource.config,
      );
      if (!driver) {
        throw new Error('Driver not found');
      }
      const result = await driver.query(query);
      return result;
    }
    return null;
  };

  // Handle cells change - save notebook
  const handleCellsChange = useCallback(
    (cells: NotebookCellData[]) => {
      if (!project.data?.id) return;

      const now = new Date();
      const notebookId = notebook?.data?.id || uuidv4();
      const notebookData: Notebook = {
        id: notebookId,
        projectId: project.data?.id,
        name: notebook?.data?.name || 'Untitled Notebook',
        title: notebook?.data?.title || 'Untitled Notebook',
        description: notebook?.data?.description || '',
        slug: notebook?.data?.slug || '', // Will be auto-generated by repository
        version: notebook?.data?.version || 1,
        createdAt: notebook?.data?.createdAt || now,
        updatedAt: now,
        datasources:
          notebook?.data?.datasources ||
          savedDatasources.data?.map((ds) => ds.id) ||
          [],
        cells:
          notebook?.data?.cells ||
          cells.map((cell) => ({
            query: cell.query,
            cellType: cell.cellType,
            cellId: cell.cellId,
            datasources: cell.datasources,
            isActive: cell.isActive ?? true,
            runMode: cell.runMode ?? 'default',
          })),
      };

      saveNotebookMutation.mutate(notebookData);
    },
    [project, notebook, savedDatasources, saveNotebookMutation],
  );

  // Handle notebook change - save notebook
  const handleNotebookChange = useCallback(
    (changes: Partial<Notebook>) => {
      if (!project.data?.id || !notebook) return;

      const updatedNotebook: Notebook = {
        ...notebook?.data,
        ...changes,
        updatedAt: new Date(),
      } as Notebook;

      saveNotebookMutation.mutate(updatedNotebook);
    },
    [project, notebook, saveNotebookMutation],
  );

  // Handle SQL generation
  const handleGenerateSql = useCallback(
    (cellId: number, prompt: string) => {
      if (!isConnected) {
        toast.error('Not connected to SQL generation service');
        return;
      }

      setIsGeneratingSql((prev) => {
        const next = new Map(prev);
        next.set(cellId, true);
        return next;
      });

      pendingGenerationsRef.current.set(cellId, prompt);
      generateSql(prompt);
    },
    [generateSql, isConnected],
  );

  // Map datasources to the format expected by NotebookUI
  const datasources = savedDatasources.data?.map((ds) => ({
    id: ds.id,
    name: ds.name,
  }));

  return (
    <NotebookUI
      notebook={notebook.data || undefined}
      datasources={datasources}
      onRunQuery={handleRunQuery}
      onGenerateSql={handleGenerateSql}
      isGeneratingSql={isGeneratingSql}
      onCellsChange={handleCellsChange}
      onNotebookChange={handleNotebookChange}
      cellResults={cellResults}
      cellErrors={cellErrors}
    />
  );
}

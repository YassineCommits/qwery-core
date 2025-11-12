import { useCallback, useEffect, useRef, useState } from 'react';

export interface TextToSqlResponse {
  summary: string;
  sql: string;
  columns: string[];
  preview_rows: unknown[][];
  truncated: boolean;
  csv_filename: string;
  visualization?: {
    title: string;
    type: string;
  } | null;
}

export interface UseTextToSqlOptions {
  projectId?: string;
  chatId?: string;
  baseUrl?: string;
  onResponse?: (response: TextToSqlResponse) => void;
  onError?: (error: string) => void;
}

export function useTextToSql({
  projectId,
  chatId,
  baseUrl = 'ws://localhost:8000',
  onResponse,
  onError,
}: UseTextToSqlOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const wasConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    // Don't connect if projectId or chatId are placeholders or invalid
    if (projectId === 'default' || chatId === 'default-chat' || !projectId || !chatId) {
      return;
    }

    // Don't connect if baseUrl is invalid
    if (!baseUrl || (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://'))) {
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore errors when closing
      }
      wsRef.current = null;
    }

    isConnectingRef.current = true;
    const wsUrl = `${baseUrl}/ws/agent/${projectId}/${chatId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      wasConnectedRef.current = true;
      isConnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle handshake
        if (message.kind === 'Handshake') {
          return;
        }

        // Handle heartbeat
        if (message.kind === 'Heartbeat') {
          return;
        }

        // Handle error
        if (message.kind === 'Error' && message.payload?.Error) {
          const errorMsg = message.payload.Error.message || 'Unknown error';
          onErrorRef.current?.(errorMsg);
          setIsGenerating(false);
          return;
        }

        // Handle assistant message with SQL response
        if (message.kind === 'Message' && message.payload?.Message) {
          const content = message.payload.Message.content || '';
          
          // Parse the response content to extract SQL and preview
          // SQL is typically after "SQL:" and before "Preview:" or end of content
          const sqlMatch = content.match(/SQL:\s*\n([\s\S]*?)(?:\n\nPreview:|\n\.\.\.|$)/);
          let sql = sqlMatch ? sqlMatch[1].trim() : '';
          
          // If no SQL found, try to find it after "Query executed successfully"
          if (!sql) {
            const altMatch = content.match(/Query executed successfully\.\s*\nSQL:\s*\n([\s\S]*?)(?:\n\nPreview:|$)/);
            sql = altMatch ? altMatch[1].trim() : '';
          }
          
          // Extract preview section
          const previewMatch = content.match(/Preview:\s*\n([\s\S]*?)(?:\n\.\.\.|$)/);
          let columns: string[] = [];
          let preview_rows: unknown[][] = [];
          
          if (previewMatch) {
            const previewText = previewMatch[1].trim();
            const previewLines = previewText.split('\n').filter((line) => line.trim());
            if (previewLines.length > 0) {
              columns = previewLines[0].split(',').map((c) => c.trim());
              preview_rows = previewLines.slice(1).map((line) =>
                line.split(',').map((v) => v.trim())
              );
            }
          }

          const csvMatch = content.match(/Results saved to ([^\s.]+)/);
          const csv_filename = csvMatch ? csvMatch[1] : '';

          // Extract summary (everything before SQL:)
          const summary = content.split('SQL:')[0]?.trim() || content.split('Query executed successfully')[0]?.trim() || '';

          const response: TextToSqlResponse = {
            summary,
            sql,
            columns,
            preview_rows,
            truncated: content.includes('... (truncated)'),
            csv_filename,
            visualization: null,
          };

          onResponseRef.current?.(response);
          setIsGenerating(false);
        }
      } catch (error) {
        // Only log parsing errors, not connection errors
        console.error('Failed to parse WebSocket message:', error);
        onErrorRef.current?.(error instanceof Error ? error.message : 'Failed to parse response');
        setIsGenerating(false);
      }
    };

    ws.onerror = () => {
      // Don't log errors to console to prevent spam
      // Only call onError if we were previously connected (not initial connection failure)
      if (wasConnectedRef.current) {
        onErrorRef.current?.('Connection error');
      }
      setIsGenerating(false);
      isConnectingRef.current = false;
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      isConnectingRef.current = false;
      
      // Only attempt to reconnect if we were previously connected
      // Don't reconnect on initial connection failure (code 1006 = abnormal closure)
      // Don't reconnect if we're already trying to reconnect
      if (
        wasConnectedRef.current &&
        !reconnectTimeoutRef.current &&
        event.code !== 1000 // Normal closure (don't reconnect)
      ) {
        reconnectAttemptsRef.current += 1;
        // Exponential backoff: 3s, 6s, 12s, max 30s
        const delay = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, delay);
      } else if (!wasConnectedRef.current) {
        // Initial connection failed - don't spam reconnect
        // Reset after a longer delay to allow server to start
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            reconnectAttemptsRef.current = 0;
          }, 10000); // Wait 10 seconds before allowing another attempt
        }
      }
    };

    wsRef.current = ws;
  }, [baseUrl, projectId, chatId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore errors when closing
      }
      wsRef.current = null;
    }
    setIsConnected(false);
    wasConnectedRef.current = false;
    isConnectingRef.current = false;
  }, []);

  // Store callbacks in refs to avoid recreating connect on every render
  const onResponseRef = useRef(onResponse);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onResponseRef.current = onResponse;
    onErrorRef.current = onError;
  }, [onResponse, onError]);

  const generateSql = useCallback(
    (prompt: string, connectionString?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        onErrorRef.current?.('Not connected to server');
        return;
      }

      setIsGenerating(true);

      // If connection string is provided, send SET DATABASE_URL command first
      if (connectionString) {
        const commandMessage = {
          id: crypto.randomUUID(),
          kind: 'Command',
          payload: {
            Command: {
              command: 'Set',
              arguments: {
                SetCommandArgument: {
                  key: 'DATABASE_URL',
                  value: connectionString,
                },
              },
            },
          },
          from: 'client',
          to: 'server',
        };

        wsRef.current.send(JSON.stringify(commandMessage));
      }

      // Send the prompt message
      const message = {
        id: crypto.randomUUID(),
        kind: 'Message',
        payload: {
          Message: {
            role: 'user',
            message_type: 'text',
            content: prompt,
          },
        },
        from: 'client',
        to: 'server',
      };

      wsRef.current.send(JSON.stringify(message));
    },
    []
  );

  // Only connect when projectId or chatId changes, not on every render
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, chatId, baseUrl]);

  return {
    isConnected,
    isGenerating,
    generateSql,
    connect,
    disconnect,
  };
}


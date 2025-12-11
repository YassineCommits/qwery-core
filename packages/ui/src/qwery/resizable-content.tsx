import React, { useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../shadcn/resizable';

interface ResizableContentProps {
  Content: React.ReactElement | null;
  AgentSidebar: React.ReactElement | null;
  open?: boolean;
}

export interface ResizableContentRef {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const ResizableContent = forwardRef<ResizableContentRef, ResizableContentProps>(
  function ResizableContent(props, ref) {
    const { Content, AgentSidebar, open: initialOpen = false } = props;
    const [isOpen, setIsOpen] = useState(initialOpen);

    // Expose imperative handle for external control
    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
    }));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isModKeyPressed = isMac ? event.metaKey : event.ctrlKey;

      if (isModKeyPressed && event.key === 'l') {
        const target = event.target as HTMLElement;
        const isInputFocused =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable;

        if (!isInputFocused) {
          event.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // When open prop is true, always open (even if user had closed it)
    // This allows notebook prompts to force-open the sidebar
    if (initialOpen === true) {
      setIsOpen(true);
    } else if (initialOpen === false) {
      // Only close if explicitly set to false (not just undefined)
      setIsOpen(false);
    }
    // If initialOpen is undefined, maintain current state (user-controlled)
  }, [initialOpen]);

  const sidebarSize = isOpen ? 50 : 0;
  const contentSize = isOpen ? 50 : 100;

  return (
    <ResizablePanelGroup
      key={isOpen ? 'open' : 'closed'}
      direction="horizontal"
      className="h-full w-full overflow-hidden"
    >
      <ResizablePanel
        defaultSize={contentSize}
        minSize={isOpen ? 50 : 100}
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      >
        <div className="h-full min-h-0 w-full max-w-full min-w-0 overflow-hidden">
          {Content}
        </div>
      </ResizablePanel>
      {isOpen && <ResizableHandle withHandle />}
      {isOpen && (
        <ResizablePanel
          defaultSize={sidebarSize}
          minSize={10}
          maxSize={80}
          className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
          style={{ minWidth: '400px' }}
        >
          <div className="h-full min-h-0 w-full max-w-full min-w-0 overflow-hidden">
            {AgentSidebar}
          </div>
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
  },
);

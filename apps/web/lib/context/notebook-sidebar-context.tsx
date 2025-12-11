'use client';

import { createContext, useContext, useRef, type ReactNode } from 'react';

type NotebookSidebarContextValue = {
  openSidebar: (conversationSlug: string) => void;
  registerSidebarControl: (control: { open: () => void }) => void;
};

const NotebookSidebarContext = createContext<NotebookSidebarContextValue | null>(
  null,
);

export function NotebookSidebarProvider({
  children,
}: {
  children: ReactNode;
}) {
  const sidebarControlRef = useRef<{ open: () => void } | null>(null);

  const openSidebar = (conversationSlug: string) => {
    // Update URL with conversation slug
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('conversation', conversationSlug);
    window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search);
    
    // Directly open sidebar via control
    sidebarControlRef.current?.open();
  };

  const registerSidebarControl = (control: { open: () => void }) => {
    sidebarControlRef.current = control;
  };

  return (
    <NotebookSidebarContext.Provider
      value={{
        openSidebar,
        registerSidebarControl,
      }}
    >
      {children}
    </NotebookSidebarContext.Provider>
  );
}

export function useNotebookSidebar() {
  const context = useContext(NotebookSidebarContext);
  if (!context) {
    // Return no-op functions if not in notebook context
    return {
      openSidebar: () => {},
      registerSidebarControl: () => {},
    };
  }
  return context;
}


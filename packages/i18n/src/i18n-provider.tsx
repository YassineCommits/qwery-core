import React from 'react';
import type { InitOptions, i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';

let i18nInstance: i18n;

type Resolver = (
  lang: string,
  namespace: string,
) => Promise<Record<string, string>>;

export function I18nProvider({
  settings,
  children,
  resolver,
}: React.PropsWithChildren<{
  settings: InitOptions;
  resolver: Resolver;
}>) {
  const instance = useI18nClient(settings, resolver);

  // Always render children, even if i18n isn't ready yet
  // This prevents React rendering errors and allows i18n to initialize in the background
  if (!instance) {
    return <>{children}</>;
  }

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/**
 * @name useI18nClient
 * @description A hook that initializes the i18n client.
 * @param settings
 * @param resolver
 */
function useI18nClient(settings: InitOptions, resolver: Resolver) {
  if (
    !i18nInstance ||
    i18nInstance.language !== settings.lng ||
    i18nInstance.options.ns?.length !== settings.ns?.length
  ) {
    throw loadI18nInstance(settings, resolver);
  }

  return i18nInstance;
}

async function loadI18nInstance(settings: InitOptions, resolver: Resolver) {
  try {
    if (typeof document === 'undefined') {
      // Server-side: no document object
      const { initializeServerI18n } = await import('./i18n-server');
      i18nInstance = await initializeServerI18n(settings, resolver);
      return i18nInstance;
    } else {
      // Client-side: document exists
      const { initializeI18nClient } = await import('./i18n-client');
      i18nInstance = await initializeI18nClient(settings, resolver);
      return i18nInstance;
    }
  } catch (error) {
    // If initialization fails, create a minimal i18n instance to prevent React errors
    console.error('Failed to initialize i18n:', error);
    const { createInstance } = await import('i18next');
    const { initReactI18next } = await import('react-i18next');
    const fallbackInstance = createInstance();
    await fallbackInstance.init({
      ...settings,
      resources: {},
      fallbackLng: settings.fallbackLng || 'en',
    });
    initReactI18next.init(fallbackInstance);
    i18nInstance = fallbackInstance;
    return fallbackInstance;
  }
}

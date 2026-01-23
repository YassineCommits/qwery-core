/**
 * Resolves the translation file for a given language and namespace.
 * Uses fetch on the client and fs on the server.
 */
export async function i18nResolver(language: string, namespace: string) {
  try {
    // Server-side: use fs to read from file system
    if (typeof window === 'undefined') {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      
      // Try build directory first (production), then source directory (development)
      const paths = [
        // Production: build/server/lib/i18n/locales/
        path.join(
          process.cwd(),
          'build',
          'server',
          'lib',
          'i18n',
          'locales',
          language,
          `${namespace}.json`,
        ),
        // Development: apps/web/lib/i18n/locales/
        path.join(
          process.cwd(),
          'apps',
          'web',
          'lib',
          'i18n',
          'locales',
          language,
          `${namespace}.json`,
        ),
        // Alternative: lib/i18n/locales/ (if running from apps/web)
        path.join(
          process.cwd(),
          'lib',
          'i18n',
          'locales',
          language,
          `${namespace}.json`,
        ),
      ];
      
      let lastError: Error | null = null;
      for (const localePath of paths) {
        try {
          const fileContent = await fs.readFile(localePath, 'utf-8');
          return JSON.parse(fileContent) as Record<string, string>;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          // Try next path
          continue;
        }
      }
      
      // If all paths failed, throw the last error
      throw lastError || new Error('Failed to load locale file from all paths');
    }
    
    // Client-side: use fetch to load from URL
    // Try both absolute path (production) and relative path (development)
    const paths = [
      `/lib/i18n/locales/${language}/${namespace}.json`,
      `./lib/i18n/locales/${language}/${namespace}.json`,
    ];
    
    let lastError: Error | null = null;
    for (const path of paths) {
      try {
        const response = await fetch(path);
        
        if (!response.ok) {
          throw new Error(
            `Failed to load locale file: ${response.status} ${response.statusText}`,
          );
        }
        
        const data = await response.json();
        return data as Record<string, string>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Try next path
        continue;
      }
    }
    
    // If all paths failed, throw the last error
    throw lastError || new Error('Failed to load locale file from all paths');
  } catch (error) {
    console.group(
      `Error while loading translation file: ${language}/${namespace}`,
    );
    console.error(error instanceof Error ? error.message : error);
    console.warn(
      `Please ensure the translation file exists at "lib/i18n/locales/${language}/${namespace}.json"`,
    );
    console.groupEnd();

    // return an empty object if the file could not be loaded to avoid loops
    return {};
  }
}

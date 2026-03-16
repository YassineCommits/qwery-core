'use client';

import { useEffect, useRef } from 'react';
import type { VegaLiteSpec } from './types';

type VegaEmbed = typeof import('vega-embed');

export interface VegaLiteChartProps {
  spec: VegaLiteSpec;
}

export function VegaLiteChart({ spec }: VegaLiteChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancel = false;
    let runtime: { finalize?: () => void } | null = null;

    async function render() {
      if (!containerRef.current) return;

      const el = containerRef.current;
      // Clear previous content
      el.innerHTML = '';

      try {
        const vegaEmbedModule: VegaEmbed = (await import(
          'vega-embed'
        )) as VegaEmbed;
        const result = await vegaEmbedModule.default(el, spec, {
          actions: false,
        });
        if (!cancel) {
          runtime = result;
        } else if (result && typeof result.finalize === 'function') {
          result.finalize();
        }
      } catch {
        // Swallow rendering errors to avoid breaking the entire AI UI.
      }
    }

    void render();

    return () => {
      cancel = true;
      if (runtime && typeof runtime.finalize === 'function') {
        runtime.finalize();
      }
    };
  }, [spec]);

  return <div ref={containerRef} className="h-[260px] w-full" />;
}

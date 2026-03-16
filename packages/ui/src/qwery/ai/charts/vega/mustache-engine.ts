'use client';

import Mustache from 'mustache';

// Disable HTML escaping so we can safely inject JSON fragments (data, colors)
// into Vega-Lite specs. The inputs come from already-validated chart configs.
Mustache.escape = (value: string): string => value;

export function renderTemplate<TContext extends object>(
  template: string,
  context: TContext,
): string {
  return Mustache.render(template, context);
}

### Vega-Lite + Mustache Integration Design

This document describes how to integrate **Vega-Lite** as a chart engine in this repo, using **Mustache templates** as the spec-generation layer, while coexisting with the current **Recharts-based** pipeline.

---

## 1. Current chart pipeline (status quo)

This is the **AI → chart** path used today.

### 1.1 High-level flow

- **Domain data**: SQL query results
- **Agent-side pipeline**:
  1. `QueryResults { rows, columns }`
  2. LLM selects `chartType` (`bar | line | pie`)
  3. LLM generates a **chart config template** (no data, only config)
  4. Backend transforms `QueryResults` into `data[]` for charting
  5. Backend returns `ChartConfig { chartType, title?, data[], config }`
- **Frontend pipeline**:
  1. `ChartRenderer` receives `ChartConfig`
  2. It persists colors in `localStorage`, trims them
  3. It chooses a Recharts component (`BarChart`, `LineChart`, `PieChart`)
  4. Component renders SVG via Recharts, inside `ChartWrapper`

### 1.2 Agent-side: data and DTOs

- **QueryResults DTO** (input to chart generation)

```12:27:packages/agent-factory-sdk/src/agents/tools/generate-chart.ts
export interface QueryResults {
  rows: Array<Record<string, unknown>>;
  columns: string[];
}

export interface GenerateChartInput {
  queryResults: QueryResults;
  sqlQuery: string;
  userInput: string;
  chartType?: ChartType; // Optional: if provided, skip selection step
}
```

- **Tool entrypoint**

```14:27:packages/agent-factory-sdk/src/tools/generate-chart-tool.ts
export const GenerateChartTool = Tool.define('generateChart', {
  description: DESCRIPTION,
  parameters: z.object({
    chartType: z.enum(['bar', 'line', 'pie']).optional(),
    queryId: z
      .string()
      .optional()
      .describe('Query ID from runQuery to retrieve full results from cache'),
    queryResults: queryResultsSchema
      .optional()
      .describe('Query results (optional if queryId is provided)'),
    sqlQuery: z.string().optional(),
    userInput: z.string().optional(),
  }),
```

- **Zod/TS config types** (core chart DTO)

```28:43:packages/agent-factory-sdk/src/agents/types/chart.types.ts
export const ChartConfigSchema = z.object({
  chartType: ChartTypeSchema,
  title: z.string().optional(),
  data: z.array(z.record(z.string(), z.unknown())),
  config: z.object({
    colors: z.array(z.string()),
    labels: z.record(z.string(), z.string()).optional(),
    xKey: z.string().optional(),
    yKey: z.string().optional(),
    nameKey: z.string().optional(),
    valueKey: z.string().optional(),
  }),
});

export type ChartConfig = z.infer<typeof ChartConfigSchema>;
```

- **Template-only version produced by the LLM**

```44:57:packages/agent-factory-sdk/src/agents/types/chart.types.ts
export const ChartConfigTemplateSchema = z.object({
  chartType: ChartTypeSchema,
  title: z.string().optional(),
  config: z.object({
    colors: z.array(z.string()),
    labels: z.record(z.string(), z.string()).optional(),
    xKey: z.string().optional(),
    yKey: z.string().optional(),
    nameKey: z.string().optional(),
    valueKey: z.string().optional(),
  }),
});

export type ChartConfigTemplate = z.infer<typeof ChartConfigTemplateSchema>;
```

### 1.3 Agent-side: chart selection + configuration (LLM + Mustache)

- **Supported chart registry**

```38:61:packages/agent-factory-sdk/src/agents/config/supported-charts.ts
export const SUPPORTED_CHARTS: Record<ChartType, ChartDefinition> = {
  bar: {
    type: 'bar',
    description:
      'Bar charts are best for categorical data, comparisons, and aggregations',
    indicators: [
      'Categorical data (categories, groups, regions)',
      'Comparisons between discrete groups',
      'Aggregations (SUM, COUNT, AVG) grouped by category',
      'Rankings or top N lists',
    ],
    dataFormat: {
      description: 'Array of objects with category (xKey) and value (yKey)',
      example: [{ name: 'Category A', value: 100 }],
    },
    requirements: {
      requiredKeys: ['xKey', 'yKey'],
      keyDescriptions: {
        xKey: 'Column name for categories (X-axis)',
        yKey: 'Column name for values (Y-axis)',
      },
      dataFormatTemplate: '[{ name: "Category", value: number }]',
    },
```

- **Mustache engine (already present)**

```1:9:packages/agent-factory-sdk/src/agents/prompts/template-engine.ts
import Mustache from 'mustache';

Mustache.escape = (value: string): string => value;

export function renderTemplate<TContext extends object>(
  template: string,
  context: TContext,
): string {
  return Mustache.render(template, context);
}
```

- **Chart type selection prompt**

```73:113:packages/agent-factory-sdk/src/agents/prompts/select-chart-type.prompt.ts
export const SELECT_CHART_TYPE_PROMPT = (
  userInput: string,
  sqlQuery: string,
  metadata: {
    columns: string[];
    rowCount: number;
  },
  businessContext?: BusinessContext | null,
) => {
  const businessContextForTemplate =
    businessContext && businessContext.entities.length > 0
      ? {
          domain: businessContext.domain,
          entitiesList: businessContext.entities.map((e) => e.name).join(', '),
          hasVocabulary:
            !!businessContext.vocabulary &&
            businessContext.vocabulary.length > 0,
          vocabulary:
            businessContext.vocabulary?.map((entry) => ({
              businessTerm: entry.businessTerm,
              technicalTermsList: entry.technicalTerms.join(', '),
              synonymsList: entry.synonyms.join(', '),
              hasSynonyms: entry.synonyms.length > 0,
            })) ?? [],
        }
      : null;

  const context = {
    userInput,
    sqlQuery,
    chartsInfo: getChartsInfoForPrompt(),
    selectionPrompts: getChartSelectionPrompts(),
    chartTypesUnion: getChartTypesUnionString(),
    columnsJson: JSON.stringify(metadata.columns),
    rowCount: metadata.rowCount,
    businessContext: businessContextForTemplate,
    currentDate: new Date().toISOString(),
  };

  return renderTemplate(SELECT_CHART_TYPE_TEMPLATE, context);
};
```

- **Chart config generation prompt**

```106:171:packages/agent-factory-sdk/src/agents/prompts/generate-chart-config.prompt.ts
export const GENERATE_CHART_CONFIG_PROMPT = (
  chartType: ChartType,
  metadata: {
    columns: string[];
    rowCount: number;
  },
  sqlQuery: string,
  businessContext?: BusinessContextForPrompt | null,
) => {
  const chartDef = getChartDefinition(chartType);
  if (!chartDef) {
    throw new Error(`Unsupported chart type: ${chartType}`);
  }

  // build context...
  const context = {
    chartType,
    chartDescription: chartDef.dataFormat.description,
    dataFormatExampleJson: JSON.stringify(chartDef.dataFormat.example, null, 2),
    sqlQuery,
    columnsJson: JSON.stringify(metadata.columns),
    rowCount: metadata.rowCount,
    chartGenerationPrompt: getChartGenerationPrompt(chartType),
    axesGuidelines: getAxesLabelsPrecisionGuidelines(),
    requiredKeysList: chartDef.requirements.requiredKeys.join(', '),
    requiredKeysLines,
    businessContext:
      businessContext && businessContext.domain
        ? {
            domain: businessContext.domain.domain,
            hasVocabulary: vocabulary.length > 0,
            vocabulary,
            entitiesList,
          }
        : null,
    currentDate: new Date().toISOString(),
  };

  return renderTemplate(GENERATE_CHART_CONFIG_TEMPLATE, context);
};
```

- **End-to-end agent chart generation**

```111:224:packages/agent-factory-sdk/src/agents/tools/generate-chart.ts
export async function generateChart(input: GenerateChartInput): Promise<{
  chartType: ChartType;
  data: Array<Record<string, unknown>>;
  config: {
    colors: string[];
    labels?: Record<string, string>;
    xKey?: string;
    yKey?: string;
    nameKey?: string;
    valueKey?: string;
  };
}> {
  const selection = await selectChartType(
    input.queryResults,
    input.sqlQuery,
    input.userInput,
  );
  const chartType = input.chartType || selection.chartType;

  const template = await generateChartConfig(
    chartType,
    input.queryResults,
    input.sqlQuery,
  );

  const data = evaluateChartData(
    chartType,
    input.queryResults,
    template.config,
  );

  const chartConfig = ChartConfigSchema.parse({
    chartType: template.chartType,
    title: template.title,
    data,
    config: template.config,
  });

  // key healing based on available keys in data[]

  return chartConfig;
}
```

### 1.4 Frontend: ChartRenderer and Recharts components

- **ChartRenderer**: central rendering hub

```44:60:packages/ui/src/qwery/ai/charts/chart-renderer.tsx
export interface ChartConfig {
  chartType: ChartType;
  title?: string;
  data: Array<Record<string, unknown>>;
  config: {
    colors: string[];
    labels?: Record<string, string>;
    xKey?: string;
    yKey?: string;
    nameKey?: string;
    valueKey?: string;
  };
}
```

- Color persistence + modification, then switch on `chartType`

```80:96:packages/ui/src/qwery/ai/charts/chart-renderer.tsx
export function ChartRenderer({ chartConfig }: ChartRendererProps) {
  const { chartType, title } = chartConfig;
  const chartRef = useRef<HTMLDivElement>(null);
  const colorKey = useMemo(() => getChartColorKey(chartConfig), [chartConfig]);
  // ...
```

```191:257:packages/ui/src/qwery/ai/charts/chart-renderer.tsx
  const chartComponent = (() => {
    switch (chartType) {
      case 'bar':
        return (
          <Suspense fallback={<LoadingState />}>
            <BarChart
              chartConfig={ /* modifiedChartConfig */ }
            />
          </Suspense>
        );
      case 'line':
        return (
          <Suspense fallback={<LoadingState />}>
            <LineChart
              chartConfig={ /* modifiedChartConfig */ }
            />
          </Suspense>
        );
      case 'pie':
        return (
          <Suspense fallback={<LoadingState />}>
            <PieChart
              chartConfig={ /* modifiedChartConfig */ }
            />
          </Suspense>
        );
      default:
        return (
          <div className="text-muted-foreground p-4 text-sm">
            Unsupported chart type: {chartType}
          </div>
        );
    }
  })();
```

- **Wrapper + color editor**

```259:287:packages/ui/src/qwery/ai/charts/chart-renderer.tsx
  return (
    <div className="space-y-4">
      <Suspense fallback={<LoadingState />}>
        <ChartWrapper
          title={title}
          chartRef={chartRef as React.RefObject<HTMLDivElement>}
          hideAxisLabelsCheckbox={chartType === 'pie'}
          chartData={chartConfig.data}
        >
          {chartComponent}
        </ChartWrapper>
      </Suspense>
      <div className="flex justify-end">
        <Suspense /* ... */>
          <ChartColorEditor
            colors={trimmedCustomColors}
            onChange={setCustomColors}
            maxColors={requiredColorCount}
          />
        </Suspense>
      </div>
    </div>
  );
}
```

- **Shared utilities** (`resolveChartKeys`, color helpers, axis formatters) live in `chart-utils.ts`.

---

## 2. Target architecture: Vega-Lite + Mustache

Goal: add **Vega-Lite** as an alternative chart engine using **Mustache JSON templates**, while keeping the existing Recharts path as a fallback.

### 2.1 Core idea

Insert a small, explicit stage between `ChartConfig` and rendering:

- Today:
  - `ChartConfig` → `ChartRenderer` → Recharts (`BarChart`, `LineChart`, `PieChart`)
- Target:
  - `ChartConfig` → `VegaTemplateContext` → Vega-Lite spec → `VegaLiteChart`
  - Or fall back: `ChartConfig` → Recharts (unchanged)

Control which engine is used via a simple decision in `ChartRenderer` (feature flag, prop, or per-chart rule).

### 2.2 New conceptual types

These are architectural concepts, not necessarily exported types yet.

- **`VegaLiteSpec`**
  - Structured Vega-Lite JSON spec passed into the renderer.

- **`VegaTemplateContext`**
  - Built from the existing `ChartConfig` on the frontend.
  - Contains:
    - `chartType` (`'bar' | 'line' | 'pie'`)
    - `title?`
    - `dataJson` (stringified `ChartConfig.data`)
    - `resolvedKeys`: `xKey`, `yKey`, `nameKey`, `valueKey` from `resolveChartKeys`
    - `labels`: from `config.labels`
    - `colors`: from `config.colors` after `ChartRenderer` trimming/persistence

- **`ChartRenderSpec`** (discriminated union)
  - `RechartsRenderSpec`:
    - `engine: 'recharts'`
    - `chartConfig: ChartConfig`
  - `VegaLiteRenderSpec`:
    - `engine: 'vega-lite'`
    - `chartConfig: ChartConfig`
    - `vegaLiteSpec: VegaLiteSpec`

The UI can gradually move from `ChartConfig` to `ChartRenderSpec` without touching upstream code.

### 2.3 Where Vega-Lite Mustache templates live

#### Option A (recommended first): UI-side Vega templates

- **Location**
  - `packages/ui/src/qwery/ai/charts/vega/`
    - `bar.vl.json.mustache`
    - `line.vl.json.mustache`
    - `pie.vl.json.mustache`
    - `vega-spec-factory.ts` (builds `VegaTemplateContext` and renders templates)

- **Flow**
  1. `ChartRenderer` receives a `ChartConfig`.
  2. It computes final colors, labels, and passes `modifiedChartConfig` to a `VegaSpecFactory`.
  3. `VegaSpecFactory`:
     - Uses `resolveChartKeys` (existing helper) to get field names.
     - Derives axis titles from `config.labels`.
     - Builds `VegaTemplateContext`.
     - Renders a Mustache JSON template into a Vega-Lite spec string.
     - Parses it into a `VegaLiteSpec`.
  4. `VegaLiteChart` renders the spec.

- **Pros**
  - No changes to agent / tools / prompts required.
  - You can roll out Vega-Lite per chart-type and per feature flag.

#### Option B (later): Agent-side Vega templates

- **Location**
  - `packages/agent-factory-sdk/src/agents/vega/`
    - `bar.vl.json.mustache`, etc.
    - `generateVegaLiteSpec(chartConfig: ChartConfig): VegaLiteSpec`

- **Flow**
  - Extend `generateChart` to optionally attach `vegaLiteSpec` and a `renderEngine` enum.
  - Frontend uses the provided spec instead of building one.

- **Pros**
  - Backend can reuse specs for other consumers (TUI, reports, exports).
  - Clear separation of responsibilities: domain → spec on backend, rendering on frontend.

### 2.4 Data flow summary (target)

- **Domain data → Mustache context → Vega-Lite spec → renderer**
  1. Domain:
     - SQL → `QueryResults`.
  2. Agent transforms:
     - LLM prompts + zod → `ChartConfig`.
  3. UI (existing):
     - `ChartRenderer` applies color persistence, giving `modifiedChartConfig`.
  4. Vega-Lite path:
     - `VegaSpecFactory` builds `VegaTemplateContext` from `modifiedChartConfig`.
     - Mustache templates emit a Vega-Lite JSON spec.
     - Parse to `VegaLiteSpec`.
     - `VegaLiteChart` renders the chart.

Everything up to step 3 is unchanged for the initial integration.

---

## 3. Integration seam and adaptors

### 3.1 Minimal seam: behind `ChartRenderer`

`ChartRenderer` is already the single entrypoint for chart drawing. The new decision lives here:

- **Today**
  - `ChartConfig` → `ChartRenderer` → `BarChart` / `LineChart` / `PieChart`

- **Target**
  - `ChartConfig`
    - Decide `engine: 'recharts' | 'vega-lite'`.
    - `engine === 'recharts'`:
      - Use existing switch on `chartType` and Recharts components.
    - `engine === 'vega-lite'`:
      - Call `VegaSpecFactory` to get `VegaLiteSpec`.
      - Render `<VegaLiteChart spec={...} />` inside `ChartWrapper`.

This keeps blast radius low and allows a per-chart or per-feature rollout.

### 3.2 What becomes an adaptor vs. what is replaced

- **Adaptors (kept and reused)**
  - `ChartConfig` and `ChartConfigTemplate` schemas
  - `SUPPORTED_CHARTS` definitions
  - `evaluateChartData` (SQL rows → `data[]`)
  - `resolveChartKeys` and label heuristics in `chart-utils.ts`
  - Color persistence logic in `ChartRenderer`

- **Replaced/duplicated (via new Vega path)**
  - Recharts-specific rendering in:
    - `bar-chart.tsx`
    - `line-chart.tsx`
    - `pie-chart.tsx`
  - For Vega-Lite, those roles are taken over by:
    - `VegaSpecFactory`
    - Mustache Vega-Lite templates
    - `VegaLiteChart`

Initially, Recharts remains as a full fallback for all charts.

---

## 4. Concrete first migration: bar chart

### 4.1 Why bar chart first

- Simple mapping:
  - X: category (name)
  - Y: numeric value
- Already described clearly in `SUPPORTED_CHARTS.bar`.
- Minimal axis/legend complexity compared to multi-series or stacked charts.

### 4.2 Files involved

- Agent / config:
  - `packages/agent-factory-sdk/src/agents/config/supported-charts.ts`
  - `packages/agent-factory-sdk/src/agents/prompts/generate-chart-config.prompt.ts`
  - `packages/agent-factory-sdk/src/agents/tools/generate-chart.ts`
  - `packages/agent-factory-sdk/src/tools/generate-chart-tool.ts`
- Frontend:
  - `packages/ui/src/qwery/ai/charts/chart-renderer.tsx`
  - `packages/ui/src/qwery/ai/charts/chart-utils.ts`
  - `packages/ui/src/qwery/ai/charts/bar-chart.tsx`

### 4.3 Step-by-step migration plan

1. **Create `VegaLiteChart` component**
   - A client-only component that:
     - Accepts `spec: VegaLiteSpec`.
     - Uses a Vega-Lite renderer (`vega-embed` or `react-vega`).
     - Is lazy-loaded in `chart-renderer.tsx` to keep bundles slim.

2. **Add Vega-Lite Mustache template for bar charts**
   - In `packages/ui/src/qwery/ai/charts/vega/`:
     - `bar.vl.json.mustache` defining:
       - `data.values` from `dataJson`.
       - `encoding.x.field` and `encoding.y.field` from `resolvedKeys`.
       - Axis titles from `labels`.
       - Color from `colors[0]`.

3. **Implement `VegaSpecFactory`**
   - Build `VegaTemplateContext` for bar charts:
     - Use `resolveChartKeys` to choose `xKey` and `yKey`.
     - Map labels for axes.
     - Attach `title`, `colors`, and `dataJson`.
   - Render the Mustache template and parse to `VegaLiteSpec`.

4. **Wire Vega into `ChartRenderer`**
   - Extend the `chartType === 'bar'` case to:
     - Optionally route to `VegaLiteChart` using `VegaSpecFactory`.
     - Keep a feature flag or prop to toggle between Vega-Lite and Recharts for bar charts.

5. **Validate behavior**
   - Compare the Vega-Lite bar chart to the existing Recharts bar chart:
     - Axes, labels, colors, and tooltips.
   - Adjust Mustache context and templates until behavior is satisfactory.

---

## 5. Coexistence and evolution

### 5.1 Dual-engine mode

You run in a dual-engine configuration:

- **Recharts engine**
  - Default for all charts initially.
  - No change to existing components.

- **Vega-Lite engine**
  - Opt-in per chart type or feature.
  - Spec generated from `ChartConfig` via Mustache.
  - Rendered by `VegaLiteChart`.

This makes rollback trivial: switch the engine selector back to `'recharts'`.

### 5.2 Future: move spec generation into the agent

Once UI-side Vega-Lite is stable:

1. Move Vega-Lite templates into the agent SDK.
2. Extend `generateChart` to optionally output:
   - `vegaLiteSpec`
   - `renderEngine`
3. Let the agent decide engine or spec dynamically.

The UI then becomes a thin rendering layer over either Recharts or Vega-Lite, driven entirely by agent output.

---

## 6. Constraints and caveats

### 6.1 SSR

- All chart UIs already live in client components.
- Keep Vega-Lite integration client-only and lazy-loaded.
- No SSR behavior should change as long as the Vega components stay within the existing client boundaries.

### 6.2 Security

- Current Mustache configuration disables HTML escaping in the agent.
- For Vega-Lite:
  - Templates are static and under version control.
  - Only inject:
    - Field names (from known keys).
    - Titles/labels.
    - Colors.
    - Data JSON.
  - Vega-Lite interprets these as data/config, not script.

Avoid directly interpolating untrusted arbitrary strings into places that could be misused (e.g. URLs) without validation.

### 6.3 Performance and bundle size

- Vega-Lite + runtime are heavier than Recharts.
- Mitigation:
  - Lazy-load `VegaLiteChart`.
  - Start with a narrow rollout (e.g. bar charts only).
  - Consider deferring more complex specs until necessary.

### 6.4 User-provided specs (future)

- If the model starts emitting arbitrary Vega-Lite specs:
  - Validate specs with a schema or whitelist.
  - Restrict to a safe subset of marks/encodings.
  - Prefer generating specs from higher-level DTOs (`ChartConfig`) rather than freeform spec text when possible.

---

## 7. TL;DR

- You already have:
  - A clean `ChartConfig` DTO.
  - A central `ChartRenderer`.
  - Mustache templating in the agent for prompts.
- The minimal integration seam is:
  - **Behind `ChartRenderer`**, adding:
    - `VegaTemplateContext` and Mustache-based Vega-Lite templates.
    - `VegaLiteChart` for rendering.
- Start by migrating a **single bar chart** to Vega-Lite via UI-side templates, keep Recharts as fallback, then optionally move spec generation into the agent once stable.


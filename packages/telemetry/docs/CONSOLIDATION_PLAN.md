# Telemetry Package Consolidation Plan

## Goal
Create a unified telemetry package that supports:
- **OpenTelemetry (OTel)** - Observability (spans, metrics, traces)
- **PostHog** - Product analytics (events, user tracking)
- **Sentry** - Error tracking (errors, exceptions)

## Current Structure

### Main `src/` (PostHog-based)
- `telemetry-manager.ts` - Generic TelemetryManager interface
- `client.telemetry.service.ts` - PostHog client service
- `server.telemetry.service.ts` - Server service (no-op)
- `null-telemetry-service.ts` - No-op service
- `telemetry.context.ts` - React context
- `components/telemetry-provider.tsx` - React provider
- `hooks/use-telemetry.ts` - React hook
- `events/` - PostHog events (notebook_events.ts, project_events.ts)

### `src/opentelemetry/` (OTel-based)
- `telemetry-manager.ts` - OTel TelemetryManager class
- `telemetry-utils.ts` - OTel utilities
- `telemetry.context.tsx` - OTel React context
- `client.telemetry.service.ts` - OTel client service
- `null-telemetry-service.ts` - OTel null service
- `filtering-span-exporter.ts` - Span filtering
- `agent-telemetry-helpers.ts` - Agent helpers
- `events/` - OTel events (agent, cli, desktop, web)

## Target Structure

```
src/
├── providers/
│   ├── posthog.ts          # PostHog provider implementation
│   ├── otel.ts             # OpenTelemetry provider implementation
│   └── sentry.ts           # Sentry provider implementation (future)
├── otel/
│   ├── manager.ts          # OTel TelemetryManager (renamed from telemetry-manager.ts)
│   ├── utils.ts            # OTel utilities
│   ├── client-service.ts   # OTel client service
│   ├── null-service.ts     # OTel null service
│   ├── filtering-exporter.ts
│   ├── agent-helpers.ts
│   └── context.tsx         # OTel React context
├── events/
│   ├── index.ts            # Unified exports
│   ├── agent.events.ts     # From opentelemetry/events/
│   ├── cli.events.ts       # From opentelemetry/events/
│   ├── desktop.events.ts   # From opentelemetry/events/
│   ├── web.events.ts       # From opentelemetry/events/
│   ├── notebook.events.ts  # Existing
│   └── project.events.ts  # Existing
├── telemetry-manager.ts    # Unified manager (supports all providers)
├── client.telemetry.service.ts  # PostHog client (keep)
├── server.telemetry.service.ts  # Server service (keep)
├── null-telemetry-service.ts     # Generic null service (keep)
├── telemetry.context.ts    # Unified React context
├── components/
│   └── telemetry-provider.tsx
├── hooks/
│   └── use-telemetry.ts
└── types.ts                # Unified types
```

## Consolidation Steps

1. **Move OTel files to `otel/` subdirectory**
   - Rename files to avoid conflicts
   - Update internal imports

2. **Consolidate events**
   - Move all events to unified `events/` folder
   - Update `events/index.ts` to export all

3. **Create provider implementations**
   - `providers/posthog.ts` - PostHog provider
   - `providers/otel.ts` - OTel provider wrapper
   - `providers/sentry.ts` - Sentry provider (placeholder)

4. **Update main exports**
   - Unified `index.ts` exports all providers
   - Maintain backward compatibility with `/opentelemetry` exports

5. **Update package.json exports**
   - Keep existing exports for backward compatibility
   - Add new unified exports

6. **Update all imports across codebase**


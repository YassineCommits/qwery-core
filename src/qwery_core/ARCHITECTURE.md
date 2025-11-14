# Qwery Core Clean Architecture

This document describes the clean architecture organization of the `qwery_core` package.

## Structure

```
qwery_core/
├── domain/                  # Domain Layer (Business Logic)
│   ├── entities/            # Core domain entities
│   │   └── __init__.py      # Agent, User, RequestContext, AgentConfig, etc.
│   ├── ports/               # Ports (interfaces/protocols)
│   │   └── __init__.py      # LlmService, SqlRunner, FileSystem, UserResolver, ToolRegistry
│   └── protocols/           # Protocol definitions
│       └── __init__.py      # ProtocolMessage, MessageKind, etc.
│
├── application/             # Application Layer (Use Cases)
│   ├── services/            # Application services
│   │   ├── __init__.py
│   │   └── agent_service.py # Agent creation and prompt handling
│   └── tools/               # Tool implementations (application services)
│       ├── __init__.py
│       ├── sql.py          # RunSqlTool
│       └── visualization.py # VisualizeDataTool
│
├── infrastructure/         # Infrastructure Layer (Implementations)
│   ├── llm/                # LLM service implementations
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── anthropic.py
│   │   ├── azure.py
│   │   └── openai.py
│   ├── database/           # Database implementations
│   │   ├── __init__.py
│   │   └── sql_runner.py   # PostgresRunner, SqliteRunner
│   └── filesystem/          # File system implementations
│       └── __init__.py     # LocalFileSystem
│
└── presentation/           # Presentation Layer (Entry Points)
    ├── cli/                # CLI interface
    │   └── __init__.py
    ├── http/               # HTTP/API interface
    │   ├── server.py       # FastAPI app creation
    │   └── fastapi.py      # FastAPI routes
    └── websocket/          # WebSocket interface
        └── __init__.py
```

## Layer Dependencies

- **Domain**: No dependencies on other layers (pure business logic)
- **Application**: Depends only on Domain (ports and entities)
- **Infrastructure**: Implements Domain ports, used by Application
- **Presentation**: Depends on Application and Domain, uses Infrastructure indirectly

## Key Principles

1. **Dependency Rule**: Dependencies point inward (Domain ← Application ← Infrastructure/Presentation)
2. **Ports & Adapters**: Domain defines ports (interfaces), Infrastructure provides adapters (implementations)
3. **Separation of Concerns**: Each layer has a clear responsibility
4. **Testability**: Domain and Application can be tested without Infrastructure

## Migration Notes

The old structure has been reorganized:
- `core/` → `domain/entities/`
- `protocol.py` → `domain/protocols/`
- `agent.py` → `application/services/agent_service.py`
- `tools/` → `application/tools/`
- `llm/` → `infrastructure/llm/`
- `integrations/` → `infrastructure/database/`
- `cli.py` → `presentation/cli/`
- `server.py` → `presentation/http/server.py`
- `server_components/` → `presentation/http/` and `presentation/websocket/`

## Backward Compatibility

The main `__init__.py` still exports `create_agent` for backward compatibility.


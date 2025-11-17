![Guepard](/resources/guepard-cover.png)

<div align="center">
    <h1>The Boring Qwery Platform - Connect and query anything</h1>
    <br />  
    <p align="center">
    <a href="https://youtu.be/WlOkLnoY2h8?si=hb6-7kLhlOvVL1u6">
        <img src="https://img.shields.io/badge/Watch-YouTube-%23ffcb51?logo=youtube&logoColor=black" alt="Watch on YouTube" />
    </a>
    <a href="https://discord.gg/nCXAsUd3hm">
        <img src="https://img.shields.io/badge/Join-Community-%23ffcb51?logo=discord&logoColor=black" alt="Join our Community" />
    </a>
    <a href="https://github.com/Guepard-Corp/qwery-core/actions/workflows/build_and_test.yml" target="_blank">
        <img src="https://img.shields.io/github/actions/workflow/status/Guepard-Corp/qwery-core/build-release.yml?branch=main" alt="Build">
    </a>
    </p>
</div>

## Important Notice

🚧 This project is under active development and not yet suitable for production use. Expect breaking changes, incomplete features, and evolving APIs.

# Qwery Platform - The Vision

Qwery is the most capable platform for querying and visualizing data without requiring any prior technical knowledge in data engineering. Using natural language in any supported language, Qwery seamlessly integrates with hundreds of datasources, automatically generates optimized queries, and delivers outcomes across multiple targets including result sets, dashboards, data apps, reports, and APIs.

### Getting Started

1. **Choose your environment**: Download the desktop application or connect to the [Qwery Cloud Platform](https://app.qwery.run)
2. **Connect your data**: Link to your databases, APIs, or other datasources
3. **Start querying**: Use natural language to query your datasources instantly
4. **Work with AI agents**: Press `CMD/CTRL + L` to collaborate with intelligent agents that assist with your data workflows

## 🌟 Features

- **Natural Language Querying**: Ask questions in plain language, get SQL automatically
- **Multi-Database Support**: PostgreSQL, MySQL, MongoDB, DuckDB, ClickHouse, SQL Server, and more
- **AI-Powered Agents**: Intelligent assistants that help with data workflows (CMD/CTRL + L)
- **Visual Data Apps**: Build dashboards and data applications without code
- **Desktop & Cloud**: Run locally or use our cloud platform
- **Template Library**: Pre-built notebooks, queries, and dashboards
- **Extensible**: Plugin system for custom datasources and integrations

## 🚀 Quick Start

### Prerequisites

- Node.js >= 22.x
- pnpm >= 10.x

### Installation

```bash
# Clone the repository
git clone https://github.com/Guepard-Corp/qwery-core.git
cd qwery-core

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The web app will be available at `http://localhost:3000`

### Desktop Application

```bash
# Build and run desktop app
pnpm desktop:dev
```

## 🔌 Backend API & Multi-Datasource Support

The Qwery backend (`qwery-core`) provides a REST API and WebSocket interface for natural language querying with support for multiple datasources per project.

### Starting the Backend Server

```bash
# Set up Python virtual environment
./scripts/setup_venv.sh

# Set required environment variables (see .env.example)
export QWERY_DB_URL=postgresql://user:pass@host:5432/db
export AZURE_API_KEY=your-key
export AZURE_ENDPOINT=https://your-resource.openai.azure.com

# Start server
PYTHONPATH=src .venv/bin/python -m uvicorn qwery_core.server:create_app --host 0.0.0.0 --port 8000 --factory
```

### Managing Datasources

The backend supports in-memory datasource management (persistence coming soon). Each project can have multiple datasources, and queries can target specific datasources.

#### Create a Datasource

```bash
curl -X POST http://localhost:8000/api/v1/projects/demo/datasources \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "production-db",
    "description": "Primary production database",
    "datasourceProvider": "postgres",
    "datasourceDriver": "psycopg",
    "datasourceKind": "remote",
    "config": {
      "connection_url": "postgresql://user:pass@host:5432/db?sslmode=require"
    }
  }'
```

#### List Datasources

```bash
curl http://localhost:8000/api/v1/projects/demo/datasources
```

#### Use Datasource in Query

```bash
# Blocking query with datasource ID
curl -X POST http://localhost:8000/api/v1/projects/demo/chat-1/messages \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "list top 5 tables",
    "datasourceId": "166660ad-4e35-4ccf-9254-667815d1d698"
  }'

# Streaming query with datasource slug
curl -N -X POST http://localhost:8000/api/v1/projects/demo/chat-1/messages/stream \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "describe users table",
    "datasourceSlug": "production-db"
  }'
```

### API Endpoints

See [API_ENDPOINTS.md](API_ENDPOINTS.md) for the complete endpoint reference.

**Key Endpoints:**
- `GET /health` - Health check
- `POST /api/v1/projects/{project_id}/datasources` - Create datasource
- `GET /api/v1/projects/{project_id}/datasources` - List datasources
- `POST /api/v1/projects/{project_id}/{chat_id}/messages` - Query with datasource
- `POST /api/v1/projects/{project_id}/{chat_id}/messages/stream` - Streaming query
- `WS /ws/agent/{project_id}/{chat_id}` - WebSocket agent protocol

### WebSocket Datasource Switching

Via WebSocket, you can switch datasources mid-conversation:

```json
{
  "kind": "Command",
  "payload": {
    "Command": {
      "command": "Set",
      "arguments": {
        "SetCommandArgument": {
          "key": "database",
          "value": "production-db"
        }
      }
    }
  }
}
```

The server will resolve the datasource by ID or slug and use its connection URL for subsequent queries in that chat session.

## 📚 Documentation

- [Contributing Guide](CONTRIBUTING.md)
- [Pull Request Guide](docs/contribution/pull-request-guide.md)
- [Desktop App Documentation](docs/desktop.md)
- [RFCs](docs/rfcs/)

## 🤝 Contributing

We welcome contributions! Check out our [Contributing Guide](CONTRIBUTING.md) to get started.

- Review [good first issues](https://github.com/Guepard-Corp/qwery-core/issues?q=is%3Aopen+is%3Aissue+label%3A%22good%20first%20issue%22)
- Read our [Code of Conduct](CODE_OF_CONDUCT.md)
- Join our [Discord community](https://discord.gg/nCXAsUd3hm)

## 💬 Join Qwery Community

- **Discord**: [Join our Discord](https://discord.gg/nCXAsUd3hm) for discussions and support
- **GitHub Issues**: Report bugs and request features
- **YouTube**: [Watch demos and tutorials](https://youtu.be/WlOkLnoY2h8?si=hb6-7kLhlOvVL1u6)

## 📄 License

This project uses the Elastic License 2.0 (ELv2). See the [LICENSE](LICENCE) file for details.

## 🙏 Thank You

We're grateful to the open source community. See our [Thank You](THANK-YOU.md) page for acknowledgments.

## 📊 Project Status

![Build Status](https://img.shields.io/github/actions/workflow/status/Guepard-Corp/qwery-core/build-release.yml?branch=main)
![License](https://img.shields.io/badge/license-ELv2-blue.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D22.x-brightgreen)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

# ChatHero

A configurable web application for interacting with data through AI-powered chat and direct table browsing.

## Overview

ChatHero is a generic framework that allows users to chat with JSON data using AI. The application is designed with abstracted branding and configuration, making it easy to customize and deploy for different use cases.

## Requirements

### Core Features

- **AI-Powered Chat Interface**: Natural language queries against JSON data using OpenAI
- **Data Table View**: Browse, search, sort, and filter data in a table format
- **Configurable Branding**: Custom logos, colors, and themes via configuration files
- **Containerized Deployment**: Docker-based setup for consistent development and production environments

### Tech Stack

- **Frontend & Backend**: Next.js 14 with TypeScript
- **AI Integration**: OpenAI API (gpt-5-mini model)
- **Styling**: Tailwind CSS with dynamic theming
- **Containerization**: Docker (user-managed setup)
- **Configuration**: YAML/JSON-based config files

### Architecture Patterns

- **AI Adapter Pattern**: Interface for AI providers (OpenAI initially, expandable to Anthropic, Azure, etc.)
- **Data Source Adapter Pattern**: JSON file reader (expandable to PostgreSQL, MongoDB, etc.)
- **Config-Driven Design**: All branding, AI settings, and data sources configurable without code changes
- **Automatic Schema Discovery**: Analyzes JSON data structure to auto-generate configuration when project.yaml is not present

### Configuration Schema

```yaml
app:
  name: "ChatHero"

theme:
  logo: "/assets/logo.png"
  primaryColor: "#0066cc"
  secondaryColor: "#00cc66"
  backgroundColor: "#ffffff"
  textColor: "#333333"

ai:
  provider: "openai"
  model: "gpt-5-mini"
  apiKey: "${OPENAI_API_KEY}"

dataSource:
  type: "json"
  path: "./data/spacex-launches.json"
```

### Deployment

- **Port**: 3000 (mapped to localhost:3000)
- **Container**: Docker with user-managed configuration (Dockerfile automation planned for future)
- **Volumes**: Config, data, and assets mounted for hot-reload during development
- **Environment**: Variables stored in `.env` file
  - Required: `OPENAI_API_KEY` for gpt-5-mini access

### UI Structure

#### Chat Page (`/`)
- Message input and conversation history
- AI-powered responses querying JSON data
- Branded interface with custom theming

#### Data Page (`/data`)
- Sortable table with all data columns
- Search and filter functionality
- Pagination for large datasets

#### Navigation
- Branded header with custom logo
- Toggle between Chat and Data views
- Theme colors applied from configuration

### Tenancy

- **Current**: Single-tenant deployment
- **Future**: Multi-tenant architecture with isolated data and configurations per tenant

### Future Expansion

- **Multi-Tenant Support**: Separate configurations per company/tenant with data isolation
- **Multiple AI Providers**: Anthropic Claude, Azure OpenAI, local models
- **Database Connections**: PostgreSQL, MongoDB, MySQL support
- **Authentication & Authorization**:
  - Azure Entra ID (formerly Azure AD) for user authentication and SSO
  - Role-Based Access Control (RBAC) with Entra ID App Roles
  - Microsoft Identity Platform (OAuth 2.0/OIDC) integration
  - JWT tokens with role claims for authorization
  - Per-tenant data isolation using Azure resource groups
- **Data Export**: CSV, JSON, Excel export functionality
- **Advanced Analytics**: Data visualization and insights

## Sample Data

The initial implementation includes SpaceX launch data:
- **Launches**: Historical SpaceX launches through October 3, 2025
- **Launch Vehicles**: Falcon 9, Falcon Heavy, Starship specifications
- **Data Fields**: Launch date, vehicle, mission name, outcome, payload details

This data demonstrates the chat capabilities for querying historical space missions, launch statistics, vehicle comparisons, and mission outcomes.

## Development Workflow

1. Set up environment variables in `.env` file with your OpenAI API key
2. Start container with your Docker setup
3. Access application: `http://localhost:3000`
4. Edit configs/data on host machine (changes reflect immediately via mounted volumes)
5. Custom logos/assets placed in `./public/assets`

## Project Structure

```
/config          - Theme, AI provider, and data source configurations
/lib/adapters    - AI and data source adapter implementations
/lib             - Core utilities including schema discovery
/components      - Reusable UI components
/app             - Next.js pages and routes
/data            - JSON data files
/public/assets   - Custom logos and static assets
```

## Automatic Schema Discovery

ChatHero can automatically work with any JSON data file without requiring manual configuration. When `config/project.yaml` is not present, the application will:

1. Analyze the JSON data structure
2. Identify field types (string, number, boolean, date, array, object)
3. Detect categorical fields (fields with limited unique values)
4. Detect numeric and date fields
5. Generate example questions based on discovered schema
6. Auto-create field keywords for natural language processing

### Using Schema Discovery

**Option 1: Automatic (No project.yaml)**
- Simply point `config/app.yaml` to your JSON file
- The app will auto-discover schema on startup
- View discovered schema: `GET /api/schema`

**Option 2: Generate and Customize**
- Download auto-generated config: `POST /api/schema` (returns YAML file)
- Save as `config/project.yaml` and customize as needed
- Restart the application to use manual configuration

### Schema Discovery Features

- **Type Detection**: Automatically identifies dates (YYYY-MM-DD, MM/DD/YYYY patterns)
- **Categorical Detection**: Fields with < 10% unique values or < 100 total unique values
- **Smart Display Names**: Converts field_name → Field Name
- **Unit Guessing**: Infers units for numeric fields (kg, USD, %, m, s)
- **Keyword Generation**: Creates singular/plural variations for better query matching
- **Example Questions**: Generates relevant sample queries based on data structure

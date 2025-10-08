# ChatHero

A powerful, AI-powered data exploration platform that works with any JSON dataset. Chat with your data using natural language, browse it in tables, and configure everything through an intelligent admin interface.

## Acknowledgments

Special thanks to **Kelly Lotsu-Morgan** for his excellent work on the enterprise application **CalendarHero**. This project takes inspiration from that innovative platform.

## Overview

ChatHero is a generic framework that allows users to interact with JSON data through AI-powered chat and direct table browsing. The application features automatic schema discovery, intelligent query processing, and a complete admin interface for configuration - all without writing code.

## Key Features

### 🤖 Intelligent AI Chat
- **Five-Phase Query System**: Plan → Validate → Wrangle → Optimize → Answer
- **Real-Time Progress Stepper**: Visual status bar showing live progress through each phase with color-coded indicators (active, completed, warning/error)
- **Smart Query Understanding**: Handles complex queries like "launches by year", "by day of week", "average cost per vehicle"
- **Python Code Generation**: Automatically generates and executes pandas code for deterministic operations (counting, aggregation, temporal correlation)
- **Security Validation**: All generated code is validated before execution to prevent malicious operations
- **Multi-Dataset Queries**: Correlate data across multiple datasets (e.g., "orders by president", "shipments during SpaceX launches")
- **Conversation Context**: Understands follow-up questions and maintains conversation history
- **Automatic Retry**: Self-healing code generation with retry logic on execution failures
- **Date Transformations**: Automatically extracts year, month, day of week, quarter from date fields
- **Aggregations & Filters**: Counts, sums, averages, filtering by any field
- **Context-Aware**: AI knows current date and dataset domain
- **Format Handling**: Supports output in various formats (CSV, JSON, tables) handled by Phase 3 AI

### 📊 Data Management
- **Multi-Dataset Support**: Handle multiple datasets with dropdown selector, each with its own configuration
- **Automatic Schema Discovery**: Analyzes JSON structure to identify field types, categorical fields, and date fields
- **Interactive Data Browser**: Sortable, searchable table view with all data
- **Field Detection**: Automatically identifies strings, numbers, booleans, dates, arrays, objects
- **Smart Categorization**: Fields with limited unique values marked as categorical
- **Dataset Persistence**: Last selected dataset saved in localStorage and cookies

### ⚙️ Admin Interface (`/admin/schema`)
- **AI-Assisted Configuration**: Built-in AI helps generate field descriptions, keywords, and example questions
- **Schema Rediscovery**: Update field list when data changes while preserving custom metadata
- **Visual Editor**: Edit display names, descriptions, keywords for all fields
- **One-Click Actions**: Save, download YAML, clear configuration, rediscover schema
- **Project Metadata**: Configure project name, description, domain

### 🎨 Fully Configurable
- **Theme Customization**: Logo, primary color, secondary color, all configurable via YAML
- **AI Provider**: Currently OpenAI (gpt-4o-mini), expandable to Anthropic, Azure
- **Data Sources**: JSON files (expandable to PostgreSQL, MongoDB, MySQL)
- **Environment Variables**: Secure API key storage in `.env` file

## Tech Stack

- **Framework**: Next.js 14 with TypeScript and App Router
- **AI Integration**: OpenAI API (gpt-4o-mini, 128K context window)
- **Styling**: Tailwind CSS with dynamic theming from config
- **Configuration**: YAML/JSON-based config files
- **Containerization**: Docker (user-managed setup)

## Architecture

### Adapter Patterns
- **AI Adapters**: Pluggable AI providers (OpenAI implemented, expandable)
- **Data Adapters**: Pluggable data sources (JSON implemented, expandable)
- **Config-Driven**: All settings in YAML, no code changes needed

### Query Processing Architecture

ChatHero uses a sophisticated five-phase pipeline with real-time progress updates via Server-Sent Events (SSE):

**Phase 1: Plan (AI Query Analysis)**
- User question + data sample + conversation history sent to AI
- AI analyzes query and generates execution plan with:
  - Filters to apply (if any)
  - Fields to include (reduces token usage)
  - Optional Python code for deterministic operations (counting, aggregation, correlation)
- Conversation context ensures follow-up questions are understood correctly
- Returns structured JSON with processing instructions
- **Retry Logic**: Up to 2 attempts if code generation fails

**Phase 1.5: Validate (Security Check)**
- Generated Python code (if any) is validated by AI security checker
- Checks for forbidden operations: file I/O, network access, subprocess, dangerous imports
- Verifies code uses only allowed pandas/numpy operations
- Validates that predefined variables (df, pd, np) are recognized
- Code execution blocked if security risks detected
- **Skipped**: If no code was generated in Phase 1

**Phase 2: Wrangle (Data Processing)**
- Applies filters to reduce dataset size
- Selects only required fields (token optimization)
- Executes approved Python code in sandboxed environment using pandas
- Handles multi-dataset operations (separates by `_dataset_source` field)
- Performs deterministic operations: counting, aggregation, grouping, temporal correlation
- **Retry Logic**: If code execution fails, returns to Phase 1 with error context for corrected code
- **Field Limit**: Maximum 10 fields enforced to prevent token overflow

**Phase 2.5: Optimize (Token Management)**
- Applies hard limit of 500 records sent to Phase 3
- Prevents OpenAI TPM (tokens-per-minute) limit violations
- Samples first 500 records if dataset larger
- Passes full record count to Phase 3 for accurate reporting
- Adds sampling notice to data explanation

**Phase 3: Answer (Response Generation)**
- Processed data + metadata sent to AI with minimal context
- AI generates natural language response
- Handles output formatting (CSV, JSON, tables) if requested by user
- Uses conversation history for context-aware responses
- Reports accurate counts even when working with sampled data

**Real-Time Progress**: UI updates via SSE streaming as each phase completes, showing phase status, details, and any warnings/errors.

This five-phase approach handles complex queries efficiently, securely, and within API token limits.

## Configuration

### App Configuration (`config/app.yaml`)

```yaml
app:
  name: "ChatHero"

theme:
  logo: "/assets/logo.svg"
  primaryColor: "#005288"      # Main button color, user message background
  secondaryColor: "#A7A9AC"
  backgroundColor: "#ffffff"
  textColor: "#000000"

ai:
  provider: "openai"
  model: "gpt-4o-mini"              # 128K context, JSON mode support
  queryAnalyzerModel: "gpt-4o"      # Optional: Use more capable model for Phase 1
  apiKey: "${OPENAI_API_KEY}"       # Environment variable substitution

dataSource:
  type: "json"
  datasetsPath: "./data"           # Root folder containing dataset subfolders
```

### Dataset Structure

Datasets are organized by type in folders under `data/`:

```
data/
  json/                     # JSON file-based datasets
    spacex-launches/
      data.json             # The dataset (JSON array)
      metadata.yaml         # Project metadata (name, description, domain)
      schema.yaml           # Field definitions and types
      queries.yaml          # Example questions and AI context
      README.md             # Dataset description (optional)
    us-presidents/
      data.json
      metadata.yaml
      schema.yaml
      queries.yaml
      README.md
  url/                      # URL-based datasets (future)
    live-api-data/
      config.yaml           # URL and cache settings
      metadata.yaml
      schema.yaml
      queries.yaml
      README.md
  postgres/                 # Database datasets (future)
    customer-data/
      config.yaml           # Connection settings
      metadata.yaml
      schema.yaml
      queries.yaml
      README.md
```

**Dataset Type Auto-Detection:**
- The system scans all type folders (`json/`, `url/`, `postgres/`, etc.)
- Each dataset automatically appears in the dropdown selector
- Type is determined by which folder contains the dataset
- No explicit type configuration needed

### Dataset Configuration Files

Configuration is split into three files for better organization:

#### `metadata.yaml` - Project Information
```yaml
project:
  name: "SpaceX Launches"
  description: "Dataset of SpaceX launch missions"
  domain: "space launches"      # Used for AI context
```

#### `schema.yaml` - Field Definitions
```yaml
dataSchema:
  primaryDateField: "launch_date"
  categoricalFields:
    - name: "vehicle"
      displayName: "Vehicle/Rocket"
      description: "Type of launch vehicle"
  numericFields:
    - name: "payload_mass_kg"
      displayName: "Payload Mass"
      unit: "kg"

domainKnowledge:
  fieldKeywords:
    vehicle: ["vehicle", "rocket", "falcon", "starship"]
```

#### `queries.yaml` - Example Questions & AI Context
```yaml
exampleQuestions:
  - "How many launches by year?"
  - "What's the average payload mass?"

aiContext:
  systemRole: "You are a helpful assistant..."
  domainContext: "This dataset contains..."
```

**Note:** All configuration files are optional - the system auto-generates them if not present.

## Quick Start

### Prerequisites
- Node.js 20.x or higher
- npm
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jsperson/chathero.git
   cd chathero
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   echo "OPENAI_API_KEY=your-api-key-here" > .env
   ```

4. **Configure datasets**
   Edit `config/app.yaml`:
   ```yaml
   dataSource:
     type: "json"
     datasetsPath: "./data"
   ```

5. **Start the application**
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Chat: http://localhost:3000
   - Data Browser: http://localhost:3000/data
   - Admin: http://localhost:3000/admin/schema

## Using ChatHero with Your Data

### Step 1: Prepare Your Data
- JSON array format: `[{...}, {...}, ...]`
- Create a folder: `data/json/your-dataset-name/`
- Place JSON file as: `data/json/your-dataset-name/data.json`
- Optionally add `README.md` for dataset description
- Dataset will automatically appear in the dropdown selector

### Step 2: Configure Schema (Optional)

**Option A: Automatic** (Easiest)
- Just start the app - schema auto-discovered
- Works immediately with any JSON

**Option B: AI-Assisted** (Recommended)
1. Navigate to `/admin/schema`
2. Review auto-discovered fields
3. Ask AI: "Generate better descriptions for all fields"
4. Ask AI: "Create 5 example questions for this dataset"
5. Click "Save Configuration"

**Option C: Manual**
- Download auto-generated YAML from `/admin/schema`
- Customize `metadata.yaml`, `schema.yaml`, and `queries.yaml` manually
- Restart application

### Step 3: Start Chatting
- Ask questions in natural language
- Examples: "Show me data by year", "What's the average?", "Filter by X"
- AI understands date transformations, aggregations, filters

## Project Structure

```
/config              - App and project configuration (YAML)
/lib
  /adapters          - AI and data source adapters
  config.ts          - Config loading with env var substitution
  query-analyzer.ts  - AI-powered query analysis (Phase 1)
  code-validator.ts  - AI-powered security validation (Phase 1.5)
  code-executor.ts   - Python code execution sandbox (Phase 2)
  schema-discovery.ts - Automatic schema detection
  logger.ts          - Structured logging system
/components
  Header.tsx         - Navigation with admin dropdown
  ProgressStepper.tsx - Real-time phase progress indicator (status bar)
  DatasetSelector.tsx - Dataset dropdown selection
  ThemeProvider.tsx  - Dynamic theme configuration
/app
  /                  - Chat interface with SSE streaming
  /data              - Data browser table view
  /admin
    /schema          - Schema configuration admin
    /datasets        - Dataset selection admin
    /ai-settings     - AI model and API key configuration
  /api
    /chat            - Five-phase query processing (full response)
    /chat-stream     - Five-phase query processing (SSE streaming)
    /data            - Data endpoint
    /datasets        - Dataset listing endpoint
    /config          - Public config endpoint
    /admin
      /schema        - Schema admin APIs
      /ai-settings   - AI configuration APIs
/logs                - Application logs (chat-queries, errors)
/data                - JSON data files
/public/assets       - Custom logos and static files
/scripts             - Data processing utilities
```

## Admin Features

### Schema Configuration (`/admin/schema`)

**Actions (Top of Page)**
- **Save Configuration**: Writes to dataset-specific YAML files (`metadata.yaml`, `schema.yaml`, `queries.yaml`)
- **Rediscover Schema**: Updates fields from data while preserving custom metadata
- **Download YAML**: Get configuration files
- **Clear Configuration**: Reset to auto-discovery

**AI Assistant**
- Ask AI to improve descriptions, suggest keywords
- Generate example questions automatically
- Identify appropriate data domain
- Improve field display names

**Field Management**
- Edit display names, descriptions, keywords
- View sample values and unique counts
- Configure categorical and numeric fields
- Set primary date field

## Technical Capabilities

### Code Generation & Execution
- **Language**: Python 3 with pandas and numpy
- **Execution Environment**: Sandboxed subprocess with timeout protection
- **Security**: AI-powered validation prevents malicious code execution
- **Deterministic Operations**: Code generation required for counting, aggregation, grouping, temporal correlation
- **Error Handling**: Automatic retry with error context sent back to Phase 1 for code correction
- **Field Access**: Automatic detection and inclusion of fields used in generated code

### Multi-Dataset Support
- **Dataset Selection**: Cookie-based persistence across sessions
- **Cross-Dataset Queries**: Automatic handling via `_dataset_source` field
- **Dataset Documentation**: README.md files passed to AI for context
- **Dynamic Examples**: Query examples generated based on available datasets

### Token Optimization
- **Field Selection**: Phase 1 selects only required fields to reduce context size
- **Field Limit**: Maximum 10 fields enforced (prevents 78K token overflow)
- **Record Sampling**: Phase 2.5 limits to 500 records for Phase 3 (prevents TPM violations)
- **Smart Prioritization**: `_dataset_source` and filter fields always included

### Conversation Management
- **History Tracking**: All messages passed to Phase 1 for context
- **Follow-Up Understanding**: Generic patterns for "by X instead of Y" or "what about Z"
- **Intent Preservation**: Maintains query type (counting, filtering) across follow-ups
- **Context Instructions**: Explicit AI prompts with pattern examples

### Progress & Logging

**ProgressStepper Component** - Real-time visual feedback during query processing:
- **Visual Status Bar**: Displays at the top of the chat interface showing all five phases
- **Color-Coded Indicators**:
  - Blue (active): Currently processing phase
  - Green (completed): Successfully finished phase
  - Yellow (warning): Phase completed with warnings (e.g., code rejected, retry needed)
  - Red (error): Phase failed
- **Phase Labels**: Phase 1 → Phase 1.5 → Phase 2 → Phase 2.5 → Phase 3
- **Live Updates**: Updates in real-time via Server-Sent Events (SSE) as each phase progresses
- **Expandable Details**: Click on any phase to see detailed information (filters applied, code generated, errors, etc.)
- **Retry Indicators**: Shows attempt counts when retries occur
- **Persistent Display**: Remains visible throughout conversation, cleared on "Clear Conversation"

**Logging Infrastructure**:
- **Structured Logging**: All operations logged to `/logs/app-YYYY-MM-DD.log`
- **Phase Details**: Complete audit trail of filters, code, execution results, and errors
- **Sample Data Logging**: First 3 result records logged for verification and debugging

## Sample Datasets

ChatHero includes two sample datasets to demonstrate capabilities:

### SpaceX Launches (578 missions, 2006-2025)

**Fields:**
- `launch_date`: Date of launch
- `vehicle`: Falcon 1, Falcon 9, Falcon Heavy, Starship
- `mission_name`: Mission identifier
- `outcome`: Success/Failure
- `site`: Launch location
- `customer`: Primary customer
- `payload_mass_kg`: Payload mass (420 records with data)
- `launch_cost_usd_millions`: Estimated launch cost (all records)

**Sample Queries:**
- "How many launches by year?"
- "Show launches by day of week"
- "What's the total cost of all Falcon 9 launches?"
- "Average payload mass by vehicle?"
- "Show successful launches in 2024"

### US Presidents (46 presidents, 1789-present)

**Fields:**
- `name`: President's full name
- `spouse`: Spouse's name
- `birth_date`, `birth_place`: Birth information
- `death_date`, `cause_of_death`: Death information (null for living presidents)
- `presidential_start`, `presidential_end`: Terms of office
- `party`: Political party affiliation
- `other_offices`: Array of other offices held

**Sample Queries:**
- "How many presidents by party?"
- "Show presidents who died in office"
- "Which presidents served in the military?"
- "Average age at inauguration by century?"
- "Which presidents were born in Virginia?"

## Advanced Features

### Query Capabilities
- **Python Code Execution**: Generates and runs pandas code for complex operations
- **Temporal Correlation**: Compare dates across datasets (e.g., orders during presidential terms)
- **Cross-Dataset Operations**: Join/correlate data from multiple sources automatically
- **Date Operations**: by year, month, day of week, quarter
- **Aggregations**: count, sum, average, min, max, groupby operations
- **Filters**: equals, contains, greater/less than, between
- **Multi-field**: Group by multiple fields simultaneously
- **Numeric Type Handling**: Automatic conversion with pd.to_numeric() for mixed-type fields
- **Conversation Memory**: Follow-up questions use context from previous messages
- **Self-Healing**: Automatic retry with corrected code on execution failures

### Schema Discovery Intelligence
- **Type Detection**: Identifies dates via pattern matching (YYYY-MM-DD, MM/DD/YYYY, etc.)
- **Categorical Detection**: Fields with <10% unique values or <100 total unique values
- **Unit Inference**: Guesses units for numeric fields (kg, USD, %, m, s)
- **Display Names**: Auto-converts field_name to "Field Name"
- **Keywords**: Generates singular/plural variations

### Configuration Management
- **Cache Clearing**: Auto-clears on save for immediate updates
- **Merge Logic**: Rediscover preserves custom metadata, adds new fields, removes old
- **Validation**: Ensures data consistency across reloads

## Deployment

### Development
```bash
npm run dev          # Start dev server on port 3000
```

### Production
```bash
npm run build        # Build for production
npm start            # Start production server
```

### Docker (User-Managed)
- Volume mount `config/`, `data/`, `public/assets/`
- Expose port 3000
- Pass `OPENAI_API_KEY` via environment

### Environment Variables
```bash
OPENAI_API_KEY=sk-...    # Required for AI features
```

## API Endpoints

### Public APIs
- `GET /api/config` - Public configuration (theme, project metadata)
- `GET /api/data` - Full dataset
- `POST /api/chat` - Five-phase AI query processing (returns full response)
- `POST /api/chat-stream` - Five-phase AI query processing with SSE streaming (real-time progress)
- `GET /api/schema` - Schema discovery results
- `GET /api/datasets` - List all available datasets

### Admin APIs
- `GET /api/admin/schema` - Load schema with existing config
- `POST /api/admin/schema/save` - Save configuration to YAML files (metadata.yaml, schema.yaml, queries.yaml)
- `POST /api/admin/schema/download` - Download YAML files
- `POST /api/admin/schema/clear` - Delete configuration files
- `POST /api/admin/schema/rediscover` - Merge discovered schema with existing config
- `POST /api/admin/schema/ai-assist` - AI suggestions for schema improvement

## Future Roadmap

### Multi-Tenant Support
- Tenant-specific configurations
- Data isolation per tenant
- Azure resource group integration

### Authentication & Authorization
- Azure Entra ID (Microsoft Identity Platform)
- OAuth 2.0/OIDC integration
- Role-Based Access Control (RBAC)
- JWT tokens with role claims
- SSO support

### Additional AI Providers
- Anthropic Claude
- Azure OpenAI
- Local models (Ollama, etc.)

### Database Support
- PostgreSQL adapter
- MongoDB adapter
- MySQL adapter
- Connection pooling

### Export Features
- CSV export
- Excel export
- JSON export
- Scheduled exports

### Analytics
- Data visualization
- Dashboard creation
- Insights generation

## Contributing

Issues and pull requests welcome at: https://github.com/jsperson/chathero

## License

MIT License - See [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Jason Scott Person and Kelly Lotsu-Morgan

This software is free to use with attribution.

## Support

For questions or issues:
- GitHub Issues: https://github.com/jsperson/chathero/issues
- Documentation: [Coming soon]

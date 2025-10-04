# ChatHero

A powerful, AI-powered data exploration platform that works with any JSON dataset. Chat with your data using natural language, browse it in tables, and configure everything through an intelligent admin interface.

## Acknowledgments

Special thanks to **Kelly Lotsu-Morgan** for his excellent work on the enterprise application **CalendarHero**. This project takes inspiration from that innovative platform.

## Overview

ChatHero is a generic framework that allows users to interact with JSON data through AI-powered chat and direct table browsing. The application features automatic schema discovery, intelligent query processing, and a complete admin interface for configuration - all without writing code.

## Key Features

### 🤖 Intelligent AI Chat
- **Three-Phase Query System**: AI analyzes questions, processes data server-side, then generates natural language responses
- **Smart Query Understanding**: Handles complex queries like "launches by year", "by day of week", "average cost per vehicle"
- **Date Transformations**: Automatically extracts year, month, day of week, quarter from date fields
- **Aggregations & Filters**: Counts, sums, averages, filtering by any field
- **Context-Aware**: AI knows current date and dataset domain

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

**Phase 1: AI Query Analysis**
- User question + data sample sent to AI
- AI returns structured JSON with processing instructions
- Determines: operation type, fields to group by, transformations, filters

**Phase 2: Server-Side Data Processing**
- Executes AI's instructions on full dataset
- Applies transformations (extract_year, extract_month, extract_day_of_week, extract_quarter)
- Performs aggregations (count, sum, average, min, max)
- Applies filters (equals, contains, greater_than, less_than, between)

**Phase 3: Response Generation**
- Processed data sent back to AI with minimal context
- AI generates natural language response

This three-phase approach handles complex queries efficiently while keeping context size minimal.

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
  model: "gpt-4o-mini"         # 128K context, JSON mode support
  apiKey: "${OPENAI_API_KEY}"  # Environment variable substitution

dataSource:
  type: "json"
  datasetsPath: "./data"           # Root folder containing dataset subfolders
  defaultDataset: "spacex-launches" # Default dataset to load
```

### Dataset Structure

Datasets are organized by type in folders under `data/`:

```
data/
  json/                     # JSON file-based datasets
    spacex-launches/
      data.json             # The dataset (JSON array)
      project.yaml          # Dataset-specific configuration (optional)
      README.md             # Dataset description (optional)
    us-presidents/
      data.json
      project.yaml
      README.md
  url/                      # URL-based datasets (future)
    live-api-data/
      config.yaml           # URL and cache settings
      project.yaml
      README.md
  postgres/                 # Database datasets (future)
    customer-data/
      config.yaml           # Connection settings
      project.yaml
      README.md
```

**Dataset Type Auto-Detection:**
- The system scans all type folders (`json/`, `url/`, `postgres/`, etc.)
- Each dataset automatically appears in the dropdown selector
- Type is determined by which folder contains the dataset
- No explicit type configuration needed

### Project Configuration (`data/{dataset-name}/project.yaml`)

Optional - auto-generated if not present:

```yaml
project:
  name: "My Project"
  description: "Dataset description"
  domain: "space launches"      # Used for AI context

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

exampleQuestions:
  - "How many launches by year?"
  - "What's the average payload mass?"

aiContext:
  systemRole: "You are a helpful assistant..."
  domainContext: "This dataset contains..."
```

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
     defaultDataset: "spacex-launches"  # or "us-presidents"
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
- Customize `project.yaml` manually
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
  data-processor.ts  - Server-side data processing engine
  query-analyzer.ts  - AI-powered query analysis
  schema-discovery.ts - Automatic schema detection
/app
  /                  - Chat interface
  /data              - Data browser table view
  /admin/schema      - Schema configuration admin
  /api
    /chat            - Three-phase query processing
    /data            - Data endpoint
    /config          - Public config endpoint
    /admin/schema    - Schema admin APIs
/data                - JSON data files
/public/assets       - Custom logos and static files
/scripts             - Data processing utilities
```

## Admin Features

### Schema Configuration (`/admin/schema`)

**Actions (Top of Page)**
- **Save Configuration**: Writes to dataset-specific `project.yaml`
- **Rediscover Schema**: Updates fields from data while preserving metadata
- **Download YAML**: Get configuration file
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
- **Date Operations**: by year, month, day of week, quarter
- **Aggregations**: count, sum, average, min, max
- **Filters**: equals, contains, greater/less than, between
- **Multi-field**: Group by multiple fields simultaneously

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
- `POST /api/chat` - Three-phase AI query processing
- `GET /api/schema` - Schema discovery results

### Admin APIs
- `GET /api/admin/schema` - Load schema with existing config
- `POST /api/admin/schema/save` - Save configuration to project.yaml
- `POST /api/admin/schema/download` - Download YAML
- `POST /api/admin/schema/clear` - Delete configuration
- `POST /api/admin/schema/rediscover` - Merge discovered schema with existing
- `POST /api/admin/schema/ai-assist` - AI suggestions for schema

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

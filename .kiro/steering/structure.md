# Project Structure

```
├── index.html                  # Single-page app entry (Korean UI)
├── server/
│   └── index.js                # Express backend — Bedrock AI proxy
├── src/
│   ├── main.js                 # App bootstrap, bridge init, toolbar/sidebar wiring
│   ├── components/             # UI components (vanilla JS, DOM manipulation)
│   │   ├── toolbar.js          # Top toolbar: align, analyze, optimize buttons
│   │   ├── sidebar.js          # Right sidebar: AI chat, undo, new conversation
│   │   ├── align-modal.js      # Alignment preset selection modal
│   │   ├── analysis-modal.js   # Architecture analysis results modal
│   │   ├── well-architected-modal.js  # Well-Architected evaluation modal
│   │   └── toast.js            # Toast notification system
│   ├── core/                   # Business logic (no DOM dependencies except DOMParser)
│   │   ├── drawio-bridge.js    # iframe postMessage communication with draw.io
│   │   ├── aws-service-catalog.js  # Single source of truth: service types, styles, patterns
│   │   ├── aws-architecture-builder.js  # XML analysis + Lightweight_JSON reorganization
│   │   ├── json-to-xml-builder.js  # Lightweight_JSON → drawio XML conversion
│   │   ├── xml-summarizer.js   # drawio XML → Lightweight_JSON reverse conversion
│   │   ├── layout-engine.js    # Auto-layout coordinate calculator (grid-based)
│   │   ├── channel-router.js   # Routes user intent to summary or xml channel
│   │   ├── diagram-controller.js  # Executes AI commands against the diagram
│   │   ├── conversation-context.js  # Chat history + token trimming
│   │   ├── snapshot-manager.js # Undo stack for diagram states
│   │   ├── aws-analyzer.js     # Architecture analysis + optimization rules
│   │   └── __tests__/          # Vitest tests (unit + property-based)
│   └── styles/
│       └── index.css           # All CSS styles
├── vite.config.js
└── package.json
```

## Architecture Patterns

- **Components** (`src/components/`) handle DOM events and UI rendering. They receive a `DrawIOBridge` instance and call into core modules.
- **Core** (`src/core/`) contains pure business logic. Modules are imported by components but do not import from components (except `diagram-controller.js` which imports `toast.js`).
- **Data flow for AI chat**: User message → `ChannelRouter` (intent detection) → `fetch /api/chat` → `DiagramController.executeCommands()` → `DrawIOBridge`
- **Data flow for alignment**: XML → `summarizeXml()` → `reorganizeForAlignment()` → `buildXml()` → `DrawIOBridge.loadXml()`
- **Lightweight_JSON** is the central interchange format between XML parsing, AI, layout engine, and XML generation.

## Conventions

- One class or set of related functions per file
- JSDoc comments on all public functions and classes
- No barrel/index re-exports — direct file imports everywhere
- Test files mirror source structure inside `__tests__/`

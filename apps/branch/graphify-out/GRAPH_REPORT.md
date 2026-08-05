# Graph Report - branch  (2026-08-04)

## Corpus Check
- 37 files · ~13,868 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 256 nodes · 415 edges · 18 communities (13 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7ad11498`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- print-order.ts
- app/page.tsx
- compilerOptions
- devDependencies
- branch-header.tsx
- dependencies
- menu/page.tsx
- layout.tsx
- browser-print.ts
- route.ts
- README.md
- next.config.ts
- middleware.ts
- sw.ts
- eslint.config.mjs
- postcss.config.mjs

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `getAuthToken()` - 14 edges
3. `cn()` - 12 edges
4. `BranchHomePage()` - 11 edges
5. `sendLines()` - 10 edges
6. `apiFetch()` - 8 edges
7. `encodeEscPos()` - 8 edges
8. `isWebSerialSupported()` - 7 edges
9. `getConnectedSerialPort()` - 7 edges
10. `PaperWidth` - 7 edges

## Surprising Connections (you probably didn't know these)
- `ConfiguracionPage()` --calls--> `getAuthToken()`  [EXTRACTED]
  src/app/configuracion/page.tsx → src/lib/auth.ts
- `ConfiguracionPage()` --calls--> `cn()`  [EXTRACTED]
  src/app/configuracion/page.tsx → src/lib/utils.ts
- `StockToggle()` --calls--> `cn()`  [EXTRACTED]
  src/app/menu/page.tsx → src/lib/utils.ts
- `MenuStockPage()` --calls--> `getAuthToken()`  [EXTRACTED]
  src/app/menu/page.tsx → src/lib/auth.ts
- `MenuStockPage()` --calls--> `cn()`  [EXTRACTED]
  src/app/menu/page.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (18 total, 5 thin omitted)

### Community 0 - "print-order.ts"
Cohesion: 0.17
Nodes (24): BranchMe, ConfiguracionPage(), PREP_PRESETS, PrintableOrder, PrintLinesOptions, printOrder(), PrintOrderResult, printTestTicket() (+16 more)

### Community 1 - "app/page.tsx"
Cohesion: 0.11
Nodes (26): StockToggle(), BranchHomePage(), customerName(), customerPhone(), displayOrderLabel(), formatCardBrand(), formatCardFunding(), formatCountdown() (+18 more)

### Community 2 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 3 - "devDependencies"
Cohesion: 0.07
Nodes (27): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, serwist, tailwindcss, @tailwindcss/postcss (+19 more)

### Community 4 - "branch-header.tsx"
Cohesion: 0.09
Nodes (29): BranchLoginForm(), safeNext(), AvailabilityMode, AvailabilitySource, AvailabilityStatus, badgeMeta(), BranchHeader(), BranchMe (+21 more)

### Community 5 - "dependencies"
Cohesion: 0.10
Nodes (21): clsx, lucide-react, next, next-themes, @ordena/shared, dependencies, clsx, lucide-react (+13 more)

### Community 6 - "menu/page.tsx"
Cohesion: 0.17
Nodes (14): DURATION_OPTIONS, formatDelta(), formatMoney(), MANUAL_SENTINEL_MS, MenuStockPage(), PendingOff, StockCategory, StockDuration (+6 more)

### Community 7 - "layout.tsx"
Cohesion: 0.21
Nodes (7): geistMono, geistSans, metadata, viewport, BranchShell(), Providers(), PwaRegister()

### Community 8 - "browser-print.ts"
Cohesion: 0.17
Nodes (19): buildReceiptDocument(), escapeHtml(), getOrCreatePrintFrame(), lineToHtml(), printReceiptHtml(), waitForImages(), appendLogoRaster(), encodeAscii() (+11 more)

### Community 9 - "route.ts"
Cohesion: 0.20
Nodes (8): Ctx, DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT

### Community 10 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **103 isolated node(s):** `eslintConfig`, `withSerwist`, `nextConfig`, `name`, `version` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PaperWidth` connect `print-order.ts` to `browser-print.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `getAuthToken()` connect `branch-header.tsx` to `print-order.ts`, `app/page.tsx`, `menu/page.tsx`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `withSerwist`, `nextConfig` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11397849462365592 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
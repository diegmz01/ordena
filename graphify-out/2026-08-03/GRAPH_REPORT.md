# Graph Report - Ordena  (2026-08-03)

## Corpus Check
- 113 files · ~46,920 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 890 nodes · 1245 edges · 55 communities (45 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7ad11498`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api/src/index.ts
- database/package.json
- apiFetch
- admin/src/app/layout.tsx
- compilerOptions
- compilerOptions
- compilerOptions
- dependencies
- dependencies
- devDependencies
- dependencies
- dependencies
- env
- scripts
- oauth.ts
- schemas.ts
- What You Must Do When Invoked
- branch/src/lib/auth.ts
- shared/package.json
- admin/src/lib/auth.ts
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- sw.ts
- admin/eslint.config.mjs
- admin/postcss.config.mjs
- admin/src/app/menu/page.tsx
- admin/src/app/sucursales/page.tsx
- branch/eslint.config.mjs
- branch/postcss.config.mjs
- web/eslint.config.mjs
- web/postcss.config.mjs
- site-shell.tsx
- orders.ts
- admin/src/app/pedidos/page.tsx
- pedidos/[id]/page.tsx
- branch-menu-modal.tsx
- graphify reference: extra exports and benchmark
- Ordena
- getAuthToken
- graphify reference: query, path, explain
- cn
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native AGENTS.md integration
- graphify reference: incremental update and cluster-only
- admin/README.md
- branch/README.md
- web/README.md
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- extraction-spec.md

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `compilerOptions` - 16 edges
3. `compilerOptions` - 16 edges
4. `useCart()` - 15 edges
5. `formatMoney()` - 15 edges
6. `getAuthToken()` - 14 edges
7. `apiFetch()` - 14 edges
8. `cn()` - 13 edges
9. `cn()` - 13 edges
10. `What You Must Do When Invoked` - 12 edges

## Surprising Connections (you probably didn't know these)
- `AdminMenuPage()` --calls--> `apiFetch()`  [EXTRACTED]
  apps/admin/src/app/menu/page.tsx → apps/admin/src/lib/api.ts
- `AdminMenuPage()` --calls--> `getAuthToken()`  [EXTRACTED]
  apps/admin/src/app/menu/page.tsx → apps/admin/src/lib/auth.ts
- `AdminMenuPage()` --calls--> `cn()`  [EXTRACTED]
  apps/admin/src/app/menu/page.tsx → apps/admin/src/lib/utils.ts
- `AdminOrderDetailPage()` --calls--> `apiFetch()`  [EXTRACTED]
  apps/admin/src/app/pedidos/[id]/page.tsx → apps/admin/src/lib/api.ts
- `AdminOrderDetailPage()` --calls--> `getAuthToken()`  [EXTRACTED]
  apps/admin/src/app/pedidos/[id]/page.tsx → apps/admin/src/lib/auth.ts

## Import Cycles
- None detected.

## Communities (55 total, 10 thin omitted)

### Community 0 - "api/src/index.ts"
Cohesion: 0.13
Nodes (14): authenticate(), AuthenticatedRequest, AuthPayload, optionalAuth(), requireAdmin, requireBranchStaff, AppError, checkoutRouter (+6 more)

### Community 1 - "database/package.json"
Cohesion: 0.06
Nodes (34): dependencies, bcryptjs, dotenv, @prisma/client, devDependencies, @ordena/shared, prisma, tsx (+26 more)

### Community 2 - "apiFetch"
Cohesion: 0.24
Nodes (7): app, port, errorHandler(), authRouter, healthRouter, menuRouter, ordersRouter

### Community 3 - "admin/src/app/layout.tsx"
Cohesion: 0.06
Nodes (23): nextConfig, geistMono, geistSans, metadata, AdminShell(), Providers(), nextConfig, geistMono (+15 more)

### Community 4 - "compilerOptions"
Cohesion: 0.07
Nodes (29): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+21 more)

### Community 5 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 7 - "dependencies"
Cohesion: 0.04
Nodes (46): dependencies, clsx, lucide-react, next, @ordena/shared, pusher-js, react, react-dom (+38 more)

### Community 8 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, arctic, bcryptjs, cookie-parser, cors, dotenv, express, helmet (+23 more)

### Community 9 - "devDependencies"
Cohesion: 0.07
Nodes (27): devDependencies, @types/bcryptjs, @types/cookie-parser, @types/cors, @types/express, @types/jsonwebtoken, @types/morgan, @types/node (+19 more)

### Community 10 - "dependencies"
Cohesion: 0.04
Nodes (46): dependencies, clsx, lucide-react, next, next-themes, @ordena/shared, react, react-dom (+38 more)

### Community 11 - "dependencies"
Cohesion: 0.05
Nodes (42): dependencies, clsx, lucide-react, next, next-themes, @ordena/shared, react, react-dom (+34 more)

### Community 12 - "env"
Cohesion: 0.10
Nodes (20): ^build, NEXT_PUBLIC_ADMIN_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_BRANCH_URL, NEXT_PUBLIC_CUSTOMER_URL, NEXT_PUBLIC_PUSHER_CLUSTER, NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (+12 more)

### Community 13 - "scripts"
Cohesion: 0.09
Nodes (21): devDependencies, turbo, typescript, engines, node, turbo, typescript, name (+13 more)

### Community 14 - "oauth.ts"
Cohesion: 0.13
Nodes (34): applePrivateKeyBytes(), buildAuthorizationUrl(), callbackUrl(), consumeOneTimeCode(), createApple(), createFacebook(), createGoogle(), createOAuthStateCookie() (+26 more)

### Community 15 - "schemas.ts"
Cohesion: 0.08
Nodes (28): adminBranchInclude, branchesRouter, staffSelect, productAdminInclude, slugify(), uniqueSlug(), ORDER_STATUSES, ROLES (+20 more)

### Community 16 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native AGENTS.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 17 - "branch/src/lib/auth.ts"
Cohesion: 0.12
Nodes (18): pusher, BranchHomePage(), formatMoney(), Order, OrderItem, STATUS_ACTIONS, STATUS_LABEL, apiFetch() (+10 more)

### Community 18 - "shared/package.json"
Cohesion: 0.12
Nodes (16): dependencies, zod, devDependencies, typescript, exports, ./design-system.css, typescript, zod (+8 more)

### Community 19 - "admin/src/lib/auth.ts"
Cohesion: 0.33
Nodes (6): clearAuthCookie(), getAccessToken(), login(), logout(), register(), setAuthCookie()

### Community 20 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 21 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, skipLibCheck, strict (+3 more)

### Community 22 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, skipLibCheck, strict (+3 more)

### Community 23 - "compilerOptions"
Cohesion: 0.17
Nodes (11): ES2022, compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, resolveJsonModule (+3 more)

### Community 27 - "admin/src/app/menu/page.tsx"
Cohesion: 0.21
Nodes (12): AdminMenuPage(), Category, CategoryFormState, emptyCategoryForm(), emptyModifierForm(), emptyProductForm(), formatMoney(), MenuTab (+4 more)

### Community 29 - "admin/src/app/sucursales/page.tsx"
Cohesion: 0.21
Nodes (12): AdminBranchesPage(), Branch, DAY_KEYS, DAY_LABELS, DayKey, defaultDay(), defaultHours(), emptyForm() (+4 more)

### Community 36 - "site-shell.tsx"
Cohesion: 0.05
Nodes (57): AuthCallbackInner(), needsPhone(), safeNext(), PhoneForm(), safeNext(), CarritoPage(), CheckoutClient(), CheckoutMode (+49 more)

### Community 37 - "orders.ts"
Cohesion: 0.19
Nodes (12): ACTIVE_BRANCH_STATUSES, stripeWebhookRouter, branchChannel(), getPusher(), notifyBranchNewOrder(), notifyBranchOrderUpdated(), getStripe(), settleStripePayment() (+4 more)

### Community 41 - "admin/src/app/pedidos/page.tsx"
Cohesion: 0.23
Nodes (12): AdminOrdersPage(), customerInitial(), customerLabel(), formatDate(), formatMoney(), matchesSearch(), OrderRow, STATUS_LABEL (+4 more)

### Community 42 - "pedidos/[id]/page.tsx"
Cohesion: 0.25
Nodes (10): AdminOrderDetailPage(), FLOW, formatDate(), formatMoney(), OrderDetail, OrderItem, paymentStatus(), STATUS_HINT (+2 more)

### Community 43 - "branch-menu-modal.tsx"
Cohesion: 0.24
Nodes (8): BranchMenuModal(), formatMoney(), MenuCategory, MenuData, MenuProduct, Props, Modal(), ModalProps

### Community 44 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 46 - "Ordena"
Cohesion: 0.22
Nodes (8): Credenciales de desarrollo, Ordena, PWA clientes, Requisitos, Scripts, Setup, Stack, URLs

### Community 47 - "getAuthToken"
Cohesion: 0.43
Nodes (6): AdminCustomersPage(), Customer, formatDate(), formatMoney(), LastOrder, getAuthToken()

### Community 48 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 49 - "cn"
Cohesion: 0.47
Nodes (3): navItems, ThemeToggle(), cn()

### Community 50 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 51 - "graphify reference: commit hook and native AGENTS.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native AGENTS.md integration, graphify reference: commit hook and native AGENTS.md integration

### Community 52 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 53 - "admin/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 54 - "branch/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 55 - "web/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **428 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+423 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `devDependencies`, `branch/src/lib/auth.ts`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `pusher` connect `branch/src/lib/auth.ts` to `dependencies`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _428 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12666666666666668 - nodes in this community are weakly interconnected._
- **Should `database/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `admin/src/app/layout.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0553306342780027 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
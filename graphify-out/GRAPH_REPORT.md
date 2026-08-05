# Graph Report - Ordena  (2026-08-04)

## Corpus Check
- 158 files · ~68,242 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1397 nodes · 2265 edges · 92 communities (75 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 81 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7ad11498`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- branch/src/app/page.tsx
- Admin App Dependencies
- Web App Dependencies
- web/src/app/layout.tsx
- Branch App Dependencies
- Database Package Deps
- routes/auth.ts
- App README Docs
- dependencies
- cart.tsx
- Admin TypeScript Config
- Branch TypeScript Config
- Web TypeScript Config
- devDependencies
- scripts
- branches.ts
- Web Public Brand Icon
- orders.ts
- Shared Package Exports
- cn
- branch-header.tsx
- pedidos/[id]/page.tsx
- branch-availability.ts
- web/src/app/sucursales/page.tsx
- Branch White Logo SVG
- branch/src/app/menu/page.tsx
- admin/src/app/menu/page.tsx
- finanzas/page.tsx
- Web White Logo SVG
- Branch Orange Logo SVG
- Web Public Orange Logo
- api/src/index.ts
- order-client.tsx
- Web App Dir White Logo
- Web App Dir Orange Logo
- admin/src/lib/auth.ts
- admin/src/app/pedidos/page.tsx
- admin/src/app/sucursales/page.tsx
- checkout.ts
- API TypeScript Config
- shared/src/index.ts
- Database TS Config
- compilerOptions
- compilerOptions
- routes/pusher.ts
- web/src/app/pedidos/page.tsx
- Web App Dir Icon PNG
- branch/src/lib/auth.ts
- menu.ts
- Web App Favicon Asset
- getAuthToken
- Branch Brand Icon PNG
- Web PWA Icon 512
- Web Apple Touch Icon
- Web App Metadata Icon
- Branch Favicon Asset
- Web PWA Icon 192
- Web Public Favicon
- Branch Placeholder Icon 192
- Branch Placeholder Icon 512
- stripe.ts
- branch/src/app/layout.tsx
- Deploy Ordena (producción)
- Web Serwist Service Worker
- Admin ESLint Config
- Admin PostCSS Config
- Branch ESLint Config
- Branch PostCSS Config
- Web ESLint Config
- Web PostCSS Config
- checkout-client.tsx
- api/package.json
- admin/src/app/layout.tsx
- cn
- print-order.ts
- branch-menu-modal.tsx
- web/src/lib/auth.ts
- arctic
- morgan
- env.ts
- branch/src/sw.ts
- cookie-parser
- cors
- dotenv
- helmet
- @ordena/database
- pusher
- zod

## God Nodes (most connected - your core abstractions)
1. `cn()` - 21 edges
2. `prisma` - 18 edges
3. `getAuthToken()` - 16 edges
4. `compilerOptions` - 16 edges
5. `compilerOptions` - 16 edges
6. `compilerOptions` - 16 edges
7. `cn()` - 15 edges
8. `apiFetch()` - 15 edges
9. `useCart()` - 15 edges
10. `getAuthToken()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Admin Next.js README` --conceptually_related_to--> `apps/web — PWA clientes (puerto 3000)`  [AMBIGUOUS]
  apps/admin/README.md → README.md
- `handle()` --calls--> `proxyApiBackend()`  [EXTRACTED]
  apps/admin/src/app/api-backend/[...path]/route.ts → packages/shared/src/api-backend-proxy.ts
- `AdminOrderDetailPage()` --calls--> `groupItemsByPlateLabel()`  [EXTRACTED]
  apps/admin/src/app/pedidos/[id]/page.tsx → packages/shared/src/plate-groups.ts
- `handle()` --calls--> `proxyApiBackend()`  [EXTRACTED]
  apps/branch/src/app/api-backend/[...path]/route.ts → packages/shared/src/api-backend-proxy.ts
- `BranchHomePage()` --calls--> `groupItemsByPlateLabel()`  [EXTRACTED]
  apps/branch/src/app/page.tsx → packages/shared/src/plate-groups.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Branch Brand Icon Identity** — apps_branch_public_logos_favicon_person_silhouette, apps_branch_public_logos_favicon_orange_brand_fill, apps_branch_public_logos_favicon_white_rounded_square, apps_branch_public_logos_favicon_minimalist_flat_style [EXTRACTED 1.00]
- **Branch Icon Visual Identity** — apps_branch_public_logos_icono_person_silhouette, apps_branch_public_logos_icono_brand_orange, apps_branch_public_logos_icono_squircle_frame, apps_branch_public_logos_icono_flat_vector_style [EXTRACTED 1.00]
- **El Bajito Letter Glyphs** — apps_branch_public_logos_logo_orange_letter_l, apps_branch_public_logos_logo_orange_letter_e, apps_branch_public_logos_logo_orange_letter_b, apps_branch_public_logos_logo_orange_letter_a, apps_branch_public_logos_logo_orange_letter_j, apps_branch_public_logos_logo_orange_letter_i, apps_branch_public_logos_logo_orange_letter_t, apps_branch_public_logos_logo_orange_letter_o [EXTRACTED 1.00]
- **El Bajito Letter Sequence (E-L-B-A-J-I-T-O)** — apps_branch_public_logos_logo_letter_e, apps_branch_public_logos_logo_letter_l, apps_branch_public_logos_logo_letter_b, apps_branch_public_logos_logo_letter_a, apps_branch_public_logos_logo_letter_j, apps_branch_public_logos_logo_letter_i, apps_branch_public_logos_logo_letter_t, apps_branch_public_logos_logo_letter_o [EXTRACTED 1.00]
- **PWA Visual Identity Elements** — apps_web_public_icons_icon_192_pwa_icon, apps_web_public_icons_icon_192_user_avatar_silhouette, apps_web_public_icons_icon_192_orange_brand_fill, apps_web_public_icons_icon_192_white_background [INFERRED 0.85]
- **PWA Visual Identity Elements** — apps_web_public_icons_icon_512_pwa_icon, apps_web_public_icons_icon_512_user_avatar_silhouette, apps_web_public_icons_icon_512_orange_brand_fill, apps_web_public_icons_icon_512_white_background [INFERRED 0.85]
- **Ordena Web Brand Visual Identity Elements** — apps_web_public_logos_favicon_image, apps_web_public_logos_favicon_user_profile_silhouette, apps_web_public_logos_favicon_brand_orange, apps_web_public_logos_favicon_flat_minimalist_style [INFERRED 0.85]
- **Ordena Web Icon Visual Identity** — apps_web_public_logos_icono_person_silhouette, apps_web_public_logos_icono_brand_orange, apps_web_public_logos_icono_squircle_frame, apps_web_public_logos_icono_flat_vector_style [EXTRACTED 1.00]
- **El Bajito Letter Glyphs** — apps_web_public_logos_logo_orange_letter_l, apps_web_public_logos_logo_orange_letter_e, apps_web_public_logos_logo_orange_letter_b, apps_web_public_logos_logo_orange_letter_a, apps_web_public_logos_logo_orange_letter_j, apps_web_public_logos_logo_orange_letter_i, apps_web_public_logos_logo_orange_letter_t, apps_web_public_logos_logo_orange_letter_o [EXTRACTED 1.00]
- **El Bajito Letter Sequence (E-L-B-A-J-I-T-O)** — apps_web_public_logos_logo_letter_e, apps_web_public_logos_logo_letter_l, apps_web_public_logos_logo_letter_b, apps_web_public_logos_logo_letter_a, apps_web_public_logos_logo_letter_j, apps_web_public_logos_logo_letter_i, apps_web_public_logos_logo_letter_t, apps_web_public_logos_logo_letter_o [EXTRACTED 1.00]
- **Ordena Web Apple Icon Brand Visual Identity Elements** — apps_web_src_app_apple_icon_image, apps_web_src_app_apple_icon_user_profile_silhouette, apps_web_src_app_apple_icon_brand_orange, apps_web_src_app_apple_icon_flat_minimalist_style [INFERRED 0.85]
- **Identidad visual de marca Ordena (silueta naranja sobre blanco)** — apps_web_src_app_icon_app_icon, apps_web_src_app_icon_user_avatar_silhouette, apps_web_src_app_icon_orange_brand_fill, apps_web_src_app_icon_white_rounded_square [INFERRED 0.85]
- **Identidad visual del icono Ordena Web (SVG fuente)** — apps_web_src_app_icono_person_silhouette, apps_web_src_app_icono_brand_orange, apps_web_src_app_icono_squircle_frame, apps_web_src_app_icono_flat_vector_style [EXTRACTED 1.00]
- **Ordena Web App Router Brand Visual Identity Elements** — apps_web_src_app_logos_favicon_image, apps_web_src_app_logos_favicon_user_profile_silhouette, apps_web_src_app_logos_favicon_brand_orange, apps_web_src_app_logos_favicon_white_background, apps_web_src_app_logos_favicon_flat_minimalist_style [INFERRED 0.85]
- **Ordena Web Icon Visual Identity** — apps_web_src_app_logos_icono_person_silhouette, apps_web_src_app_logos_icono_brand_orange, apps_web_src_app_logos_icono_squircle_frame, apps_web_src_app_logos_icono_flat_vector_style [EXTRACTED 1.00]
- **Glifos E-L-B-A-J-I-T-O forman el wordmark El Bajito** — apps_web_src_app_logos_logo_orange_glyph_e, apps_web_src_app_logos_logo_orange_glyph_l, apps_web_src_app_logos_logo_orange_glyph_b, apps_web_src_app_logos_logo_orange_glyph_a, apps_web_src_app_logos_logo_orange_glyph_j, apps_web_src_app_logos_logo_orange_glyph_i, apps_web_src_app_logos_logo_orange_glyph_t, apps_web_src_app_logos_logo_orange_glyph_o [EXTRACTED 1.00]
- **El Bajito Letter Sequence (E-L-B-A-J-I-T-O)** — apps_web_src_app_logos_logo_letter_e, apps_web_src_app_logos_logo_letter_l, apps_web_src_app_logos_logo_letter_b, apps_web_src_app_logos_logo_letter_a, apps_web_src_app_logos_logo_letter_j, apps_web_src_app_logos_logo_letter_i, apps_web_src_app_logos_logo_letter_t, apps_web_src_app_logos_logo_letter_o [EXTRACTED 1.00]

## Communities (92 total, 17 thin omitted)

### Community 0 - "branch/src/app/page.tsx"
Cohesion: 0.19
Nodes (16): BranchHomePage(), customerName(), customerPhone(), displayOrderLabel(), formatCardBrand(), formatCardFunding(), formatCountdown(), formatDateTime() (+8 more)

### Community 1 - "Admin App Dependencies"
Cohesion: 0.04
Nodes (48): dependencies, clsx, lucide-react, next, next-themes, @ordena/shared, pusher-js, react (+40 more)

### Community 2 - "Web App Dependencies"
Cohesion: 0.04
Nodes (46): dependencies, clsx, lucide-react, next, next-themes, @ordena/shared, react, react-dom (+38 more)

### Community 3 - "web/src/app/layout.tsx"
Cohesion: 0.04
Nodes (36): nextConfig, nextConfig, withSerwist, nextConfig, withSerwist, geistMono, geistSans, metadata (+28 more)

### Community 4 - "Branch App Dependencies"
Cohesion: 0.05
Nodes (42): dependencies, clsx, lucide-react, next, next-themes, @ordena/shared, react, react-dom (+34 more)

### Community 5 - "Database Package Deps"
Cohesion: 0.06
Nodes (34): dependencies, bcryptjs, dotenv, @prisma/client, devDependencies, @ordena/shared, prisma, tsx (+26 more)

### Community 6 - "routes/auth.ts"
Cohesion: 0.11
Nodes (41): applePrivateKeyBytes(), buildAuthorizationUrl(), callbackUrl(), consumeOneTimeCode(), createApple(), createFacebook(), createGoogle(), createOAuthStateCookie() (+33 more)

### Community 7 - "App README Docs"
Cohesion: 0.09
Nodes (32): Admin Next.js README, Geist font, Next.js, Vercel Platform, Branch Next.js README, Geist font, Next.js, Web Next.js README (+24 more)

### Community 8 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, bcryptjs, express, express-rate-limit, jsonwebtoken, @ordena/shared, stripe, tsx (+9 more)

### Community 9 - "cart.tsx"
Cohesion: 0.26
Nodes (11): CartContext, CartContextValue, CartPlate, CartProvider(), CartState, lineMatchesUnavailable(), loadCart(), makeLineKey() (+3 more)

### Community 10 - "Admin TypeScript Config"
Cohesion: 0.07
Nodes (29): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+21 more)

### Community 11 - "Branch TypeScript Config"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 12 - "Web TypeScript Config"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 13 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, @types/bcryptjs, @types/cookie-parser, @types/cors, @types/express, @types/jsonwebtoken, @types/morgan, @types/node (+11 more)

### Community 14 - "scripts"
Cohesion: 0.09
Nodes (22): devDependencies, turbo, typescript, engines, node, turbo, typescript, name (+14 more)

### Community 15 - "branches.ts"
Cohesion: 0.08
Nodes (25): adminBranchInclude, branchesRouter, staffBranchSelect, staffSelect, isProductInStock(), branchAvailabilitySchema, BranchAvailabilityStatus, branchAvailabilityUpdateSchema (+17 more)

### Community 16 - "Web Public Brand Icon"
Cohesion: 0.14
Nodes (19): Ordena Web App Icon (icono.png), Solid Brand Orange Fill, Flat Minimalist Vector Style, Ordena Web App Brand Identity, Person Head-and-Shoulders Silhouette, User Profile Avatar Placeholder, PWA Manifest Icon (150×150), Squircle App Icon Frame (+11 more)

### Community 17 - "orders.ts"
Cohesion: 0.12
Nodes (21): ACTIVE_BRANCH_STATUSES, assertStatusTransition(), branchOrderInclude, chargeableTotal(), HISTORY_BRANCH_STATUSES, itemsDiscount(), itemsSubtotal(), MoneyItem (+13 more)

### Community 18 - "Shared Package Exports"
Cohesion: 0.12
Nodes (16): dependencies, zod, devDependencies, typescript, exports, ./design-system.css, typescript, zod (+8 more)

### Community 19 - "cn"
Cohesion: 0.20
Nodes (14): MenuPage(), productInitials(), BrandLogo(), BrandLogoProps, MenuModifier, MenuProduct, ProductSheet(), Props (+6 more)

### Community 20 - "branch-header.tsx"
Cohesion: 0.23
Nodes (10): AvailabilityMode, AvailabilitySource, AvailabilityStatus, badgeMeta(), BranchHeader(), BranchMe, formatPausedUntil(), initialPresence() (+2 more)

### Community 21 - "pedidos/[id]/page.tsx"
Cohesion: 0.18
Nodes (15): AdminOrderDetailPage(), FLOW, formatCardBrand(), formatCardFunding(), formatDate(), formatMoney(), formatPaymentMethodLabel(), OrderDetail (+7 more)

### Community 22 - "branch-availability.ts"
Cohesion: 0.13
Nodes (20): toAdminAvailabilitySnapshot(), toStaffBranchPayload(), assertBranchAcceptingOrders(), baseEffective(), BranchAvailabilityFields, DAY_KEYS, dayHoursLabel(), DayKey (+12 more)

### Community 23 - "web/src/app/sucursales/page.tsx"
Cohesion: 0.21
Nodes (10): Branch, BranchesPageInner(), BranchWithDistance, GeoStatus, formatDistanceKm(), GeoPosition, GeoRequestResult, haversineKm() (+2 more)

### Community 24 - "Branch White Logo SVG"
Cohesion: 0.15
Nodes (14): El Bajito Logo (White SVG), Adobe Illustrator 27.4.0 SVG Export, Custom Vector Letterforms, El Bajito Wordmark, Letter A Glyph, Letter B Glyph, Letter E Glyph, Letter I Glyph (+6 more)

### Community 25 - "branch/src/app/menu/page.tsx"
Cohesion: 0.17
Nodes (14): DURATION_OPTIONS, formatDelta(), formatMoney(), MANUAL_SENTINEL_MS, MenuStockPage(), PendingOff, StockCategory, StockDuration (+6 more)

### Community 26 - "admin/src/app/menu/page.tsx"
Cohesion: 0.20
Nodes (13): AdminMenuPage(), Category, CategoryFormState, emptyCategoryForm(), emptyModifierForm(), emptyProductForm(), formatMoney(), MenuTab (+5 more)

### Community 27 - "finanzas/page.tsx"
Cohesion: 0.23
Nodes (10): BranchOption, daysAgo(), FinanceSummary, FinanzasPage(), formatDate(), formatMoney(), PAYOUT_STATUS, StripeFinance (+2 more)

### Community 28 - "Web White Logo SVG"
Cohesion: 0.17
Nodes (13): El Bajito Logo (White SVG), Custom Vector Letterforms, El Bajito Wordmark, Letter A Glyph, Letter B Glyph, Letter E Glyph, Letter I Glyph, Letter J Glyph (+5 more)

### Community 29 - "Branch Orange Logo SVG"
Cohesion: 0.27
Nodes (13): Brand Orange #EA5E1F, Custom Vector Letterforms, El Bajito Wordmark, Letter A Glyph, Letter B Glyph, Letter E Glyph, Letter I Glyph, Letter J Glyph (+5 more)

### Community 30 - "Web Public Orange Logo"
Cohesion: 0.27
Nodes (13): Brand Orange #EA5E1F, Custom Vector Letterforms, El Bajito Wordmark, Letter A Glyph, Letter B Glyph, Letter E Glyph, Letter I Glyph, Letter J Glyph (+5 more)

### Community 31 - "api/src/index.ts"
Cohesion: 0.12
Nodes (18): app, port, authenticate(), AuthenticatedRequest, AuthPayload, optionalAuth(), requireAdmin, requireBranchStaff (+10 more)

### Community 32 - "order-client.tsx"
Cohesion: 0.16
Nodes (10): FLOW, formatReadyAt(), Order, OrderItem, OrderPageClient(), OrderTimeline(), STATUS_META, STEP_LABEL (+2 more)

### Community 33 - "Web App Dir White Logo"
Cohesion: 0.17
Nodes (13): El Bajito Logo (White SVG), Custom Vector Letterforms, El Bajito Wordmark, Letter A Glyph, Letter B Glyph, Letter E Glyph, Letter I Glyph, Letter J Glyph (+5 more)

### Community 34 - "Web App Dir Orange Logo"
Cohesion: 0.17
Nodes (13): logo-orange.svg — wordmark vectorial El Bajito, Exportación Adobe Illustrator 27.4.0, Color de marca #EA5E1F, El Bajito wordmark, Glifo A, Glifo B, Glifo E, Glifo I (+5 more)

### Community 35 - "admin/src/lib/auth.ts"
Cohesion: 0.15
Nodes (17): AdminCustomersPage(), Customer, formatDate(), formatMoney(), LastOrder, AdminLoginForm(), safeNext(), API_URL (+9 more)

### Community 36 - "admin/src/app/pedidos/page.tsx"
Cohesion: 0.26
Nodes (11): AdminOrdersPage(), customerInitial(), customerLabel(), formatDate(), formatMoney(), matchesSearch(), OrderRow, STATUS_LABEL (+3 more)

### Community 37 - "admin/src/app/sucursales/page.tsx"
Cohesion: 0.18
Nodes (16): AdminBranchesPage(), availabilityBadgeClass(), AvailabilityDetail, Branch, DAY_KEYS, DAY_LABELS, DayKey, defaultDay() (+8 more)

### Community 38 - "checkout.ts"
Cohesion: 0.17
Nodes (15): isManualUnavailable(), listedBranchProductWhere(), MANUAL_UNAVAILABLE_UNTIL, orderableBranchProductWhere(), resolveUnavailableUntil(), restoreExpiredBranchStock(), startOfNextDayInTimeZone(), unavailableModifierIdsForBranch() (+7 more)

### Community 39 - "API TypeScript Config"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 40 - "shared/src/index.ts"
Cohesion: 0.05
Nodes (39): Ctx, DELETE, GET, handle(), HEAD, OPTIONS, PATCH, POST (+31 more)

### Community 41 - "Database TS Config"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, skipLibCheck, strict (+3 more)

### Community 42 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, lib, module, moduleResolution, outDir, skipLibCheck (+6 more)

### Community 43 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, resolveJsonModule, skipLibCheck (+3 more)

### Community 44 - "routes/pusher.ts"
Cohesion: 0.24
Nodes (10): authRateLimiter, checkoutRateLimiter, pusherAuthRateLimiter, promoteDuePreparingOrders(), pusherRouter, branchChannel(), getPusher(), notifyBranchNewOrder() (+2 more)

### Community 45 - "web/src/app/pedidos/page.tsx"
Cohesion: 0.15
Nodes (12): PhoneForm(), safeNext(), ACTIVE, OrderRow, PedidosPage(), STATUS_LABEL, STATUS_TONE, clearAuthCookie() (+4 more)

### Community 46 - "Web App Dir Icon PNG"
Cohesion: 0.31
Nodes (9): Ordena Web App Icon (icono.png), Solid Brand Orange Fill, Flat Minimalist Vector Style, Next.js App Directory Static Asset, Ordena Web App Brand Identity, Person Head-and-Shoulders Silhouette, User Profile Avatar Placeholder, Squircle App Icon Frame (+1 more)

### Community 47 - "branch/src/lib/auth.ts"
Cohesion: 0.27
Nodes (9): BranchLoginForm(), safeNext(), clearAuthCookie(), login(), logout(), register(), setAuthCookie(), setPresenceCookie() (+1 more)

### Community 48 - "menu.ts"
Cohesion: 0.16
Nodes (11): menuRouter, productAdminInclude, unavailableProductIdsForBranch(), slugify(), uniqueSlug(), categoryCreateSchema, categoryUpdateSchema, modifierCreateSchema (+3 more)

### Community 49 - "Web App Favicon Asset"
Cohesion: 0.46
Nodes (8): Brand Orange Silhouette Color, Flat Minimalist Iconographic Style, Ordena Web App Favicon (App Router PNG), Next.js App Router Icon Asset, Ordena Web App Brand Identity, Rounded Square Icon Frame, User Profile Silhouette (Head and Shoulders), White Background

### Community 50 - "getAuthToken"
Cohesion: 0.19
Nodes (11): PushOptInStaff(), dispatchPresence(), signalAppClosed(), STAFF_HEARTBEAT_INTERVAL_MS, STAFF_PRESENCE_EVENT, StaffPresence(), StaffPresenceDetail, API_URL (+3 more)

### Community 51 - "Branch Brand Icon PNG"
Cohesion: 0.29
Nodes (7): Branch App Icon (icono.png), Solid Brand Orange Fill, Flat Minimalist Vector Style, Person Head-and-Shoulders Silhouette, User Profile Avatar Placeholder, Squircle App Icon Frame, White Background

### Community 52 - "Web PWA Icon 512"
Cohesion: 0.33
Nodes (7): Flat Silhouette Style, Orange Brand Fill, PWA Icon 512x512, Shirt Collar Detail, Stylized Hair Quiff, User Avatar Silhouette, White Background

### Community 53 - "Web Apple Touch Icon"
Cohesion: 0.48
Nodes (7): Apple Touch Icon (iOS Home Screen), Brand Orange Silhouette Color, Flat Minimalist Iconographic Style, Ordena Web Apple Touch Icon (PNG), Next.js App Router File-Based Metadata Icon, Ordena Web App Brand Identity, User Profile Silhouette (Head and Shoulders)

### Community 54 - "Web App Metadata Icon"
Cohesion: 0.33
Nodes (7): Next.js App Icon — icon.png, Estilo plano minimalista sin rasgos faciales, Icono de metadatos Next.js App Router (convención app/icon.png), Relleno naranja de marca (#f97316 / #ea5e1f), Peinado estilizado con mechón lateral, Silueta de avatar (cabeza y hombros), Fondo blanco con esquinas redondeadas

### Community 55 - "Branch Favicon Asset"
Cohesion: 0.40
Nodes (6): Branch Favicon PNG, Minimalist Flat Icon Style, Orange Brand Fill, Person Silhouette (Head and Shoulders), User Avatar Icon, White Rounded Square Background

### Community 56 - "Web PWA Icon 192"
Cohesion: 0.40
Nodes (6): Orange Brand Fill, PWA Icon 192x192, Shirt Collar Detail, Stylized Hair Quiff, User Avatar Silhouette, White Background

### Community 57 - "Web Public Favicon"
Cohesion: 0.53
Nodes (6): Brand Orange Silhouette Color, Browser Tab Icon (Favicon), Flat Minimalist Iconographic Style, Ordena Web Favicon (32×32 PNG), Ordena Web App Brand Identity, User Profile Silhouette (Head and Shoulders)

### Community 58 - "Branch Placeholder Icon 192"
Cohesion: 0.50
Nodes (4): Ordena Sucursal Branch PWA Icon, Minimal Placeholder Icon Without Brand Mark, PWA App Icon 192x192, Solid Dark Gray Square Icon

### Community 59 - "Branch Placeholder Icon 512"
Cohesion: 0.50
Nodes (5): Superficie sin logo, texto ni formas discernibles, icon-512.png — icono PWA sucursal 512×512, Icono de instalación PWA para app Ordena Sucursal, Relleno sólido gris oscuro uniforme (~#1d1d1f), Lienzo cuadrado 512×512 px

### Community 60 - "stripe.ts"
Cohesion: 0.17
Nodes (21): stripeWebhookRouter, getBusinessDate(), nextBranchDayNumber(), applyConnectFlagsToBranch(), assertStripeConfigured(), ConnectAccountFlags, createAccountLoginLink(), createAccountOnboardingLink() (+13 more)

### Community 61 - "branch/src/app/layout.tsx"
Cohesion: 0.21
Nodes (7): geistMono, geistSans, metadata, viewport, BranchShell(), Providers(), PwaRegister()

### Community 62 - "Deploy Ordena (producción)"
Cohesion: 0.12
Nodes (15): API (Railway), Arquitectura, Connect por sucursal (destination charges), Cuentas iniciales, Deploy Ordena (producción), Finanzas (Admin), Next (Vercel × 3), Pusher / VAPID (+7 more)

### Community 73 - "checkout-client.tsx"
Cohesion: 0.22
Nodes (12): CarritoPage(), CheckoutClient(), CheckoutMode, apiFetch(), CartItem, clearUnavailableAlert(), groupCartItemsByPlate(), readUnavailableAlert() (+4 more)

### Community 74 - "api/package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 75 - "admin/src/app/layout.tsx"
Cohesion: 0.21
Nodes (7): geistMono, geistSans, metadata, AdminShell(), navItems, Providers(), ThemeToggle()

### Community 76 - "cn"
Cohesion: 0.21
Nodes (10): StockToggle(), BrandLogo(), BrandLogoProps, OrderCard(), OrderCardProps, OrderCardSkeleton(), STATUS_ACCENT, STATUS_BADGE (+2 more)

### Community 77 - "print-order.ts"
Cohesion: 0.07
Nodes (56): BranchMe, ConfiguracionPage(), PREP_PRESETS, buildReceiptDocument(), escapeHtml(), getOrCreatePrintFrame(), lineToHtml(), printReceiptHtml() (+48 more)

### Community 78 - "branch-menu-modal.tsx"
Cohesion: 0.24
Nodes (8): BranchMenuModal(), formatMoney(), MenuCategory, MenuData, MenuProduct, Props, Modal(), ModalProps

### Community 79 - "web/src/lib/auth.ts"
Cohesion: 0.12
Nodes (19): AuthCallbackInner(), needsPhone(), safeNext(), LoginForm(), safeNext(), RegisterForm(), safeNext(), ALL_PROVIDERS (+11 more)

### Community 82 - "env.ts"
Cohesion: 0.53
Nodes (5): assertProductionEnv(), corsOrigins(), DEV_JWT_PLACEHOLDERS, required(), warn()

## Ambiguous Edges - Review These
- `apps/web — PWA clientes (puerto 3000)` → `Admin Next.js README`  [AMBIGUOUS]
  apps/admin/README.md · relation: conceptually_related_to

## Knowledge Gaps
- **566 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+561 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `apps/web — PWA clientes (puerto 3000)` and `Admin Next.js README`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `BranchHomePage()` connect `branch/src/app/page.tsx` to `getAuthToken`, `pusher`, `cn`, `print-order.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `api/package.json`, `arctic`, `morgan`, `cookie-parser`, `cors`, `dotenv`, `helmet`, `@ordena/database`, `pusher`, `zod`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `pusher` connect `pusher` to `dependencies`, `branch/src/app/page.tsx`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _566 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `Web App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
# Multi-User Vegplanner Deployment Plan

*Created: February 2026*

## Business Context

Vegplanner will be offered **free** as a traffic driver for the main paid ornamental garden design site. This means:

- Costs should stay minimal since it's not directly monetized
- User experience matters for building trust and reputation
- Cross-promotion to the paid site is a key goal
- Email capture is required for signups (builds marketing list)

---

## Overview

Transform Vegplanner from a single-user JSON file-based app to a multi-user service with authentication, user-managed cultivars, and feature flags.

## Current Architecture

| Aspect | Current State |
|--------|---------------|
| Data Storage | JSON files in `data/` directory |
| API | Single route at `src/app/api/data/[collection]/route.ts` |
| Auth | None |
| Cultivar Entry | Manual JSON editing |
| Garden Features | Fully enabled |

---

## 1. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Database** | Convex | Already have account; real-time sync; end-to-end TypeScript; eliminates REST API layer |
| **Auth** | Clerk | First-class Convex integration; pre-built UI; free 10k MAU |
| **Hosting** | Vercel | Native Next.js support; Convex works with any host since it's a separate backend |

---

## 2. Convex Schema Design

Replace JSON files with Convex tables. Cultivars are shared; other data is user-scoped.

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // SHARED TABLES (not user-scoped)
  // ============================================

  // Shared cultivar library - canonical cultivar data
  cultivars: defineTable({
    cultivarId: v.string(),         // "tomato-san-marzano"
    data: v.any(),                  // Full Cultivar object
    createdBy: v.optional(v.string()), // clerkId of contributor
    createdAt: v.number(),
  }).index("by_cultivar_id", ["cultivarId"]),

  // ============================================
  // USER-SCOPED TABLES
  // ============================================

  // User config (frost window, climate, preferences)
  userConfig: defineTable({
    clerkId: v.string(),
    frostWindow: v.object({
      lastSpringFrost: v.string(),
      firstFallFrost: v.string(),
    }),
    climate: v.optional(v.any()),
    preferences: v.optional(v.any()),
  }).index("by_clerk_id", ["clerkId"]),

  // User's cultivar library - join table linking users to cultivars
  userCultivarLibrary: defineTable({
    clerkId: v.string(),
    cultivarId: v.string(),         // References cultivars.cultivarId
    overrides: v.optional(v.any()), // User-specific tweaks (timing, spacing, etc.)
    addedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_clerk_cultivar", ["clerkId", "cultivarId"]),

  // Plantings (per-user)
  plantings: defineTable({
    clerkId: v.string(),
    cultivarId: v.string(),         // References cultivars.cultivarId
    data: v.any(),
  }).index("by_clerk_id", ["clerkId"]),

  // Task completions (tasks still generated at runtime)
  taskCompletions: defineTable({
    clerkId: v.string(),
    plantingId: v.id("plantings"),
    taskType: v.string(),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
  }).index("by_clerk_id", ["clerkId"]),

  // Garden beds (per-user)
  gardenBeds: defineTable({
    clerkId: v.string(),
    data: v.any(),
  }).index("by_clerk_id", ["clerkId"]),

  // Placements (per-user)
  placements: defineTable({
    clerkId: v.string(),
    plantingId: v.id("plantings"),
    bedId: v.id("gardenBeds"),
    data: v.any(),
  }).index("by_clerk_id", ["clerkId"]),

  // Plans - annual cultivar selections (per-user)
  plans: defineTable({
    clerkId: v.string(),
    cultivarId: v.string(),
    data: v.any(),
  }).index("by_clerk_id", ["clerkId"]),

  // Track lookups for rate limiting
  lookups: defineTable({
    clerkId: v.string(),
    query: v.string(),
    date: v.string(), // YYYY-MM-DD
    createdAt: v.number(),
  }).index("by_clerk_date", ["clerkId", "date"]),
});
```

### Cultivar Data Model

**Shared `cultivars` table:**
- Contains canonical cultivar data (crop, variety, timing, temps, etc.)
- Any user can add new cultivars (becomes available to everyone)
- `createdBy` tracks who contributed it

**User `userCultivarLibrary` join table:**
- Links users to the cultivars they've added to their library
- Optional `overrides` field for user-specific tweaks (e.g., adjusted maturity days based on local experience)
- When fetching a user's cultivars: merge base data with any overrides

**Query pattern:**
```typescript
// Get user's cultivars with overrides applied
export const getUserCultivars = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Get user's library entries
    const libraryEntries = await ctx.db
      .query("userCultivarLibrary")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .collect();

    // Fetch and merge cultivar data
    const cultivars = await Promise.all(
      libraryEntries.map(async (entry) => {
        const cultivar = await ctx.db
          .query("cultivars")
          .withIndex("by_cultivar_id", q => q.eq("cultivarId", entry.cultivarId))
          .first();

        if (!cultivar) return null;

        // Merge base data with user overrides
        return {
          ...cultivar.data,
          ...(entry.overrides ?? {}),
          _libraryEntryId: entry._id,
        };
      })
    );

    return cultivars.filter(Boolean);
  },
});
```

---

## 3. Convex Functions

Replace the single API route with Convex query/mutation functions.

```
convex/
  schema.ts              # Schema definition above
  cultivars.ts           # Shared library: list, get, create
  cultivarLookup.ts      # AI-assisted cultivar data lookup
  lookups.ts             # Lookup rate limiting tracking
  userCultivarLibrary.ts # User's library: add, remove, updateOverrides
  plantings.ts           # CRUD + renumberForCrop logic
  gardenBeds.ts          # CRUD
  placements.ts          # CRUD + bulk updates
  plans.ts               # CRUD
  tasks.ts               # getAll (generated), toggleComplete
  userConfig.ts          # get, updateFrostWindow, updateClimate
  onboarding.ts          # Initialize new user config
  seed.ts                # Seed baseline cultivars (run once)
```

**Example functions:**

```typescript
// convex/cultivars.ts - Shared cultivar library
export const listAll = query({
  handler: async (ctx) => {
    // Anyone authenticated can view all cultivars
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await ctx.db.query("cultivars").collect();
  },
});

export const create = mutation({
  args: { cultivarId: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Check for duplicates
    const existing = await ctx.db
      .query("cultivars")
      .withIndex("by_cultivar_id", q => q.eq("cultivarId", args.cultivarId))
      .first();
    if (existing) throw new Error("Cultivar already exists");

    return await ctx.db.insert("cultivars", {
      cultivarId: args.cultivarId,
      data: args.data,
      createdBy: identity.subject,
      createdAt: Date.now(),
    });
  },
});

// convex/userCultivarLibrary.ts - User's personal library
export const addToLibrary = mutation({
  args: { cultivarId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Check if already in library
    const existing = await ctx.db
      .query("userCultivarLibrary")
      .withIndex("by_clerk_cultivar", q =>
        q.eq("clerkId", identity.subject).eq("cultivarId", args.cultivarId)
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("userCultivarLibrary", {
      clerkId: identity.subject,
      cultivarId: args.cultivarId,
      addedAt: Date.now(),
    });
  },
});

export const updateOverrides = mutation({
  args: { cultivarId: v.string(), overrides: v.any() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const entry = await ctx.db
      .query("userCultivarLibrary")
      .withIndex("by_clerk_cultivar", q =>
        q.eq("clerkId", identity.subject).eq("cultivarId", args.cultivarId)
      )
      .first();
    if (!entry) throw new Error("Cultivar not in library");

    await ctx.db.patch(entry._id, { overrides: args.overrides });
  },
});
```

---

## 4. React Hook Changes

Current hooks use `useState` + `fetch`. New hooks use Convex's `useQuery` + `useMutation`.

**Before (current):**
```typescript
const { data, add, update, remove } = useDataFile<Planting>('plantings');
```

**After (Convex):**
```typescript
const plantings = useQuery(api.plantings.list);
const addPlanting = useMutation(api.plantings.add);
const updatePlanting = useMutation(api.plantings.update);
const deletePlanting = useMutation(api.plantings.delete);
```

**Benefits:**
- Automatic real-time sync (no manual refetch)
- Type-safe arguments and returns
- No API routes to maintain

**Hooks to update:**

| Current Hook | Changes |
|--------------|---------|
| `useDataFile` | Remove entirely |
| `usePlantings` | Use Convex queries/mutations |
| `useGardenBeds` | Use Convex queries/mutations |
| `usePlacements` | Use Convex queries/mutations |
| `usePlans` | Use Convex queries/mutations |
| `useTasks` | Still generates at runtime; completions from Convex |

**New hooks:**
- `useCultivars` - CRUD for user's cultivar library
- `useUserConfig` - Frost window and climate settings

---

## 5. Authentication Setup

**Clerk + Convex integration:**

```typescript
// src/app/layout.tsx
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

**Auth routes:**
- `src/app/sign-in/[[...sign-in]]/page.tsx`
- `src/app/sign-up/[[...sign-up]]/page.tsx`

**Middleware:**
```typescript
// src/middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
export default clerkMiddleware();
```

---

## 6. Cultivar Entry Form

Create a multi-section form for users to add new cultivars to the shared library.

**Location:** `src/components/cultivars/CultivarForm.tsx`

**Sections:**

| Section | Fields |
|---------|--------|
| Basic Info | crop*, variety*, plantType*, family, vendor |
| Timing & Method | germDays*, maturityDays*, maturityBasis*, sowMethod*, indoor lead weeks, LSF offsets |
| Temperature | min/max growing temps, optimal range, margin |
| Harvest | harvestStyle, duration, frostSensitive |
| Spacing | spacingCm, trailingHabit |
| Perennial | isPerennial, harvest start days (conditional) |
| Notes | Free text |

**User Workflow:**

1. **Browse shared library** - See all cultivars contributed by all users
2. **Add to my library** - Click to add a cultivar to your personal library (creates `userCultivarLibrary` entry)
3. **Create new cultivar** - If it doesn't exist, create it (adds to shared `cultivars` table)
4. **Customize (optional)** - Save personal overrides for timing/spacing based on your experience

**Integration:**
- LibraryView shows shared cultivars with "Add to My Library" / "In My Library" states
- "Create Cultivar" button opens the form to add a new cultivar to the shared library
- Personal overrides edited via a simpler form (subset of fields)

---

## 7. AI-Assisted Cultivar Lookup

Instead of requiring users to enter all growing data manually, provide an AI lookup that populates the form from a cultivar name.

### Implementation

**Convex Action:**

```typescript
// convex/cultivarLookup.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";

export const lookupCultivar = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Check cache first - don't count against limit if cultivar exists
    const cached = await ctx.runQuery(internal.cultivars.findByName, {
      query: args.query,
    });
    if (cached) {
      return { cached: true, data: cached.data };
    }

    // Rate limiting: max 20 lookups/day per user
    const today = new Date().toISOString().split('T')[0];
    const lookupCount = await ctx.runQuery(internal.lookups.countToday, {
      clerkId: identity.subject,
      date: today,
    });
    if (lookupCount >= 20) {
      throw new Error("Daily lookup limit reached (20/day)");
    }

    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-3-5-haiku-latest", // Cost-effective for structured extraction
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are a horticultural database assistant. Given a plant cultivar name, return accurate growing data in JSON format.

Cultivar query: "${args.query}"

Return JSON with these fields (use null for unknown values):
{
  "crop": "string",
  "variety": "string",
  "family": "string",
  "plantType": "vegetable" | "flower",
  "germDaysMin": number,
  "germDaysMax": number,
  "maturityDays": number,
  "maturityBasis": "from_sow" | "from_transplant",
  "sowMethod": "direct" | "transplant" | "either",
  "minGrowingTempC": number,
  "maxGrowingTempC": number,
  "spacingCm": number,
  "harvestStyle": "single" | "continuous",
  "frostSensitive": boolean,
  "isPerennial": boolean,
  "notes": "string - brief growing tips"
}

Only return valid JSON.`
      }]
    });

    // Log lookup for rate limiting
    await ctx.runMutation(internal.lookups.log, {
      clerkId: identity.subject,
      query: args.query,
      date: today,
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response");

    return JSON.parse(content.text);
  },
});
```

### UI Flow

1. User enters cultivar name (e.g., "San Marzano tomato")
2. Click "Look up" -> loading state
3. AI returns data -> populates form fields
4. User reviews and edits as needed
5. Click "Save" -> normal validation/sanitization applies

### Cost Estimates

| Model | Cost per lookup | 1,000 lookups/month |
|-------|-----------------|---------------------|
| Claude Haiku | ~$0.002 | ~$2 |
| GPT-4o-mini | ~$0.001 | ~$1 |

### Cost & Security Considerations

| Concern | Mitigation |
|---------|------------|
| Hallucination (wrong data) | User must review before saving |
| Rate limit abuse | 20 lookups/day per user |
| API costs | Haiku model; cache by checking shared library first |
| Data validation | AI output still goes through `validateCultivarData()` |

### AI Data Quality

**Expected accuracy by category:**

| Category | Confidence | Examples |
|----------|------------|----------|
| Common vegetables | High | Tomatoes, peppers, beans, squash, greens |
| Popular flowers | High | Zinnias, cosmos, marigolds, sunflowers |
| Heirloom varieties | Moderate | Less documentation available |
| Very new/regional cultivars | Low | May have incomplete or missing data |

**Quality monitoring:**

1. **Track edit rates** - If users frequently modify AI results before saving, quality may be insufficient
2. **Add "Report inaccurate data" button** - Let users flag issues for review
3. **Log null values** - If AI returns many nulls for a query, the cultivar may be too obscure

**Upgrade options if Haiku quality is insufficient:**

| Option | Approach | Cost Impact |
|--------|----------|-------------|
| Sonnet fallback | Retry with Sonnet if Haiku returns >3 nulls | ~$0.02 for retries only |
| Sonnet for new, Haiku for cache | Use Sonnet when genuinely new, Haiku to check existing | Minimal increase |
| Full Sonnet upgrade | Switch entirely to Sonnet | ~10x increase (~$20/1000 lookups) |

Start with Haiku and monitor. The review-before-save step catches most issues, and the shared library means corrections benefit all users.

---

## 8. Feature Flags

Environment variable-based for simplicity.

```typescript
// src/lib/featureFlags.ts
export const featureFlags = {
  GARDEN_ENABLED: process.env.NEXT_PUBLIC_FEATURE_GARDEN === 'true',
};
```

**Usage in TabNav.tsx:**
```typescript
{featureFlags.GARDEN_ENABLED && (
  <button onClick={() => onTabChange('garden')}>Garden</button>
)}
```

**Environment config:**
- Development: `NEXT_PUBLIC_FEATURE_GARDEN=true`
- Production: `NEXT_PUBLIC_FEATURE_GARDEN=false`

---

## 9. New User Onboarding

When a user signs up:

1. Clerk creates the user
2. On first app load, check if `userConfig` exists for this `clerkId`
3. If not, run onboarding:
   - Create default `userConfig` with placeholder frost dates
   - Prompt user to set their location/frost dates
   - User can then browse the shared cultivar library and add cultivars to their own library

```typescript
// convex/onboarding.ts
export const initializeNewUser = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Check if already initialized
    const existing = await ctx.db
      .query("userConfig")
      .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
      .first();

    if (existing) return { alreadyInitialized: true };

    // Create default config
    await ctx.db.insert("userConfig", {
      clerkId: identity.subject,
      frostWindow: { lastSpringFrost: "05-15", firstFallFrost: "10-01" },
    });

    return { initialized: true };
  },
});
```

### Seeding the Shared Cultivar Library

The shared `cultivars` table should be seeded once with baseline data:

```typescript
// convex/seed.ts (run once during initial deployment)
export const seedBaselineCultivars = mutation({
  handler: async (ctx) => {
    for (const cultivar of baselineCultivars) {
      const existing = await ctx.db
        .query("cultivars")
        .withIndex("by_cultivar_id", q => q.eq("cultivarId", cultivar.id))
        .first();

      if (!existing) {
        await ctx.db.insert("cultivars", {
          cultivarId: cultivar.id,
          data: cultivar,
          createdBy: null, // System-seeded
          createdAt: Date.now(),
        });
      }
    }
  },
});
```

---

## 10. Security: Shared Cultivar Data Sanitization

Since any user can add cultivars visible to all users, we need input validation and sanitization.

### Attack Vectors to Prevent

| Risk | Example | Mitigation |
|------|---------|------------|
| **XSS** | `<script>alert('xss')</script>` in notes field | Strip HTML, escape on render |
| **Content spam** | Offensive crop names | Moderation queue (optional) |
| **Data corruption** | Negative maturity days, extreme values | Range validation |
| **Injection** | SQL-like strings | Convex handles this, but validate anyway |

### Sanitization Strategy

**1. Server-side validation in Convex mutation:**

```typescript
// convex/lib/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeText(input: string, maxLength: number = 200): string {
  // Strip HTML tags
  const clean = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  // Trim and limit length
  return clean.trim().slice(0, maxLength);
}

export function validateCultivarData(data: unknown): CultivarData {
  // Type checking
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid cultivar data');
  }

  const d = data as Record<string, unknown>;

  return {
    // Text fields - sanitized
    crop: sanitizeText(String(d.crop ?? ''), 100),
    variety: sanitizeText(String(d.variety ?? ''), 100),
    family: d.family ? sanitizeText(String(d.family), 100) : undefined,
    vendor: d.vendor ? sanitizeText(String(d.vendor), 200) : undefined,
    notes: d.notes ? sanitizeText(String(d.notes), 2000) : undefined,

    // Enum fields - whitelist validation
    plantType: validateEnum(d.plantType, ['vegetable', 'flower'], 'vegetable'),
    sowMethod: validateEnum(d.sowMethod, ['direct', 'transplant', 'either']),
    maturityBasis: validateEnum(d.maturityBasis, ['from_sow', 'from_transplant']),
    harvestStyle: validateEnum(d.harvestStyle, ['single', 'continuous'], 'single'),

    // Numeric fields - range validation
    germDaysMin: clamp(Number(d.germDaysMin), 1, 60),
    germDaysMax: clamp(Number(d.germDaysMax), 1, 60),
    maturityDays: clamp(Number(d.maturityDays), 1, 365),
    minGrowingTempC: d.minGrowingTempC ? clamp(Number(d.minGrowingTempC), -10, 40) : undefined,
    maxGrowingTempC: d.maxGrowingTempC ? clamp(Number(d.maxGrowingTempC), 0, 50) : undefined,
    spacingCm: d.spacingCm ? clamp(Number(d.spacingCm), 1, 500) : undefined,

    // Boolean fields
    isPerennial: Boolean(d.isPerennial),
    frostSensitive: Boolean(d.frostSensitive),
    trailingHabit: Boolean(d.trailingHabit),

    // ... remaining fields with similar validation
  };
}

function clamp(value: number, min: number, max: number): number {
  if (isNaN(value)) throw new Error('Invalid number');
  return Math.min(Math.max(value, min), max);
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: T[],
  defaultValue?: T
): T {
  if (allowed.includes(value as T)) return value as T;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Invalid value: ${value}. Allowed: ${allowed.join(', ')}`);
}
```

**2. Apply in cultivar creation mutation:**

```typescript
// convex/cultivars.ts
import { validateCultivarData, sanitizeText } from './lib/sanitize';

export const create = mutation({
  args: { cultivarId: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Sanitize cultivarId (used as lookup key)
    const cultivarId = sanitizeText(args.cultivarId, 100)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');

    // Validate and sanitize all cultivar data
    const validatedData = validateCultivarData(args.data);

    // Check for duplicates
    const existing = await ctx.db
      .query("cultivars")
      .withIndex("by_cultivar_id", q => q.eq("cultivarId", cultivarId))
      .first();
    if (existing) throw new Error("Cultivar already exists");

    return await ctx.db.insert("cultivars", {
      cultivarId,
      data: validatedData,
      createdBy: identity.subject,
      createdAt: Date.now(),
    });
  },
});
```

**3. React rendering - escape by default:**

React automatically escapes strings in JSX, so `{cultivar.notes}` is safe. Avoid `dangerouslySetInnerHTML`.

### Optional: Moderation Queue

For extra safety, you could add a moderation workflow:

```typescript
// Add status field to cultivars table
cultivars: defineTable({
  // ... existing fields
  status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
})

// Only show approved cultivars to users
export const listApproved = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("cultivars")
      .filter(q => q.eq(q.field("status"), "approved"))
      .collect();
  },
});
```

This is optional for MVP but good for production at scale.

---

## 11. Files to Modify/Create

**Modify:**

| File | Changes |
|------|---------|
| `src/app/layout.tsx` | Add ClerkProvider + ConvexProvider |
| `src/app/page.tsx` | Remove static JSON imports; use Convex hooks; add feature flag checks |
| `src/components/tabs/TabNav.tsx` | Add garden feature flag check |
| `src/hooks/usePlantings.ts` | Rewrite to use Convex |
| `src/hooks/useGardenBeds.ts` | Rewrite to use Convex |
| `src/hooks/usePlacements.ts` | Rewrite to use Convex |
| `src/hooks/useTasks.ts` | Use Convex for completions |

**Create:**

| File | Purpose |
|------|---------|
| `convex/schema.ts` | Database schema |
| `convex/cultivars.ts` | Shared cultivar library functions |
| `convex/cultivarLookup.ts` | AI-assisted cultivar data lookup |
| `convex/lookups.ts` | Lookup rate limiting tracking |
| `convex/userCultivarLibrary.ts` | User library join table functions |
| `convex/seed.ts` | Baseline cultivar seeding |
| `convex/plantings.ts` | Planting CRUD + renumbering |
| `convex/gardenBeds.ts` | Garden bed CRUD |
| `convex/placements.ts` | Placement CRUD |
| `convex/plans.ts` | Plan CRUD |
| `convex/tasks.ts` | Task completion functions |
| `convex/userConfig.ts` | User settings functions |
| `convex/onboarding.ts` | New user initialization |
| `convex/lib/sanitize.ts` | Input sanitization utilities |
| `src/middleware.ts` | Clerk auth middleware |
| `src/app/sign-in/[[...sign-in]]/page.tsx` | Sign-in page |
| `src/app/sign-up/[[...sign-up]]/page.tsx` | Sign-up page |
| `src/lib/featureFlags.ts` | Feature flag utilities |
| `src/components/cultivars/CultivarForm.tsx` | Cultivar entry form |
| `src/hooks/useCultivars.ts` | Cultivar hook |
| `src/hooks/useUserConfig.ts` | User config hook |

**Remove:**

| File | Reason |
|------|--------|
| `src/app/api/data/[collection]/route.ts` | Replaced by Convex functions |
| `src/hooks/useDataFile.ts` | Replaced by Convex hooks |

---

## 12. Dependencies

```bash
npm install convex @clerk/nextjs isomorphic-dompurify @anthropic-ai/sdk
```

**Environment Variables:**

```env
# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
CONVEX_DEPLOY_KEY=...

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# AI Lookup
ANTHROPIC_API_KEY=sk-ant-...

# Feature Flags
NEXT_PUBLIC_FEATURE_GARDEN=false
```

---

## 13. Verification Plan

1. **Auth flow:** Sign up (email required) -> verify email -> sign in -> sign out; unauthenticated users redirected
2. **Data isolation:** User A cannot see User B's plantings (cultivars are shared by design)
3. **New user onboarding:** Fresh signup creates config, can browse shared library
4. **Cultivar form:** Create cultivars with validation; add to personal library
5. **AI lookup:** Returns structured data, rate limiting works, user can edit before save
6. **Security:** Test XSS payloads rejected, numeric ranges enforced, enum values validated
7. **Existing features:** Plantings, succession, tasks work with Convex data layer
8. **Real-time sync:** Changes reflect immediately without manual refresh
9. **Feature flags:** Garden tab hidden when `GARDEN_ENABLED=false`
10. **Existing data migration:** Script to import current JSON data for your account

---

## 14. Implementation Order

1. **Convex setup:** Initialize project, define schema, connect to Clerk
2. **Auth layer:** Add Clerk provider, middleware, sign-in/up pages
3. **Core data hooks:** Migrate plantings, plans, cultivars to Convex
4. **User config:** Frost window and climate from Convex instead of static JSON
5. **Cultivar form:** Build the entry/edit form with review UI
6. **AI lookup:** Add cultivar lookup action with rate limiting
7. **Feature flags:** Hide garden tab
8. **Onboarding flow:** Initialize new users, seed baseline cultivars
9. **Data migration:** Script to import your existing JSON data
10. **Polish & deploy:** Vercel deployment with production env vars

---

## 15. Cost Control Strategies

Since vegplanner is a free traffic driver (not directly monetized), keeping costs low is important.

### Estimated Monthly Costs

| Scale | Users | AI Lookups | Estimated Cost |
|-------|-------|------------|----------------|
| Small | < 100 | ~200 | $0-5 |
| Medium | 100-1,000 | ~2,000 | $5-35 |
| Large | 1,000-10,000 | ~10,000 | $50-115 |

Most costs come from AI lookups (~$0.002 each). Convex, Clerk, and Vercel free tiers cover most small-to-medium usage.

### Cost Control Measures

1. **Cache AI lookups**: Before calling the API, check if a cultivar with that name already exists in the shared library. Only call the AI for genuinely new cultivars.

2. **Daily lookup limit**: 20 lookups/day per user. This resets daily and shared library caching means most lookups happen only once globally.

3. **Shared library reduces lookups**: As the cultivar library grows, users will find existing entries more often and need fewer AI lookups.

4. **Monitor usage**: Track lookup counts in the Convex dashboard to catch unexpected spikes.

### Future Cost Options (if needed)

- Gate AI lookups behind completing profile setup (encourages engagement)
- Add a "request cultivar" queue instead of instant AI lookup
- Limit free lookups, offer more via paid tier

---

## 16. Cross-Promotion & Email Capture

### Email Signup Requirement

Users must provide an email to sign up (enforced by Clerk). This builds the marketing list for the ornamental garden design site.

**Clerk configuration:**
- Require email (not optional)
- Email verification recommended
- Can export user emails from Clerk dashboard or via API

### Cross-Promotion Touchpoints

| Location | Promotion |
|----------|-----------|
| Footer | "Powered by [Ornamental Site]" with link |
| Onboarding | "Also check out our ornamental garden design service" |
| Email welcome | Include link to paid site in welcome email |
| Cultivar notes | For ornamental-adjacent plants, mention the paid service |

### Shared Accounts (Future)

Clerk supports multiple applications under one account. Users could potentially:
- Use same login for both vegplanner and ornamental site
- See both apps in their account dashboard
- Easier upsell path ("You already have an account!")

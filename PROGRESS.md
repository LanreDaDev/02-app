# v1 Implementation Progress

## Token Economics

- 100 tokens = $1
- Signup grant: 1,000 tokens (free $10)
- Cost per second of video: 10 tokens ($0.10/sec)
- Purchase packs: 500 ($5) | 1,500 ($15) | 5,000 ($50)

---

## Phase 1: Schema & Types — DONE

- [x] `supabase/migrations/010_v1_schema.sql` — full schema rewrite
- [x] `lib/types/database.ts` — all enums + interfaces rewritten
- [x] Old tables/routes deleted (orders, credits, videos, payments, etc.)

## Phase 2: Token Ledger & Auth — DONE

- [x] `lib/tokens.ts` — debitTokens, refundTokens, getBalance, checkDailySpendCeiling, checkUserRateLimit
- [x] `app/api/tokens/balance/route.ts` — GET balance + transactions
- [x] `lib/hooks/useAuth.ts` — queries `users` table
- [x] `lib/supabase/middleware.ts` — queries `users` table
- [x] `components/auth/UserMenu.tsx` — uses new `name` field, links to /dashboard/tokens

## Phase 3: Upload & Projects — DONE

- [x] `lib/aws/s3.ts` — generateS3Key updated (projectId, type: photo|clip|video)
- [x] `app/api/projects/route.ts` — POST create, GET list
- [x] `app/api/projects/[id]/route.ts` — DELETE (cascades clips, jobs, photos, notifications)
- [x] `app/api/projects/[id]/photos/route.ts` — GET with fresh presigned URLs
- [x] `app/api/upload/presign/route.ts` — presigned PUT URL
- [x] `app/api/upload/complete/route.ts` — inserts photo record with presigned view URL
- [x] `app/api/projects/[id]/confirm/route.ts` — confirm gate
- [x] `lib/hooks/useFileUpload.ts` — queue-based uploader (max 2 concurrent, dismiss/skip)

## Phase 4: Clip Generation + Webhook + Polling — DONE

- [x] `app/api/generate/clip/route.ts` — idempotency, confirm gate, rate limit, debit, call Python
- [x] `app/api/generate/regen/route.ts` — same as clip for regeneration
- [x] `app/api/generate/concat/route.ts` — no token cost, calls Python /concat
- [x] `app/api/generate/[jobId]/route.ts` — poll endpoint
- [x] `app/api/generate/webhook/route.ts` — Python callback, refund on failure
- [x] `lib/hooks/useGenerationStatus.ts` — polls every 3s

## Phase 5: Timeline — DONE

- [x] `app/api/projects/[id]/clips/route.ts` — GET clips ordered
- [x] `app/api/projects/[id]/clips/reorder/route.ts` — PUT reorder
- [x] `app/dashboard/projects/[id]/page.tsx` — timeline UI (reorder, regen, generate, stitch)
- [x] Top-up modal when tokens insufficient (links to /dashboard/tokens)

## Phase 6: Stripe Purchase — DONE

- [x] `app/api/tokens/purchase/route.ts` — creates Stripe Checkout Session
- [x] `app/api/stripe/webhook/route.ts` — signature-verified, credits tokens on payment

## Phase 7: Protection & Rate Limiting — DONE

- [x] Idempotency keys on generation_jobs + token_transactions
- [x] Per-user rate limit (MAX_GENERATIONS_PER_HOUR)
- [x] Daily spend circuit-breaker (DAILY_SPEND_CEILING)
- [x] Retry with refund (webhook handles terminal failure → refund)

## Phase 8: UI Pages — DONE

- [x] `app/dashboard/page.tsx` — home (balance, projects, CTA)
- [x] `app/dashboard/projects/new/page.tsx` — create → upload → select with lightbox → confirm
- [x] `app/dashboard/projects/[id]/page.tsx` — timeline with top-up modal
- [x] `app/dashboard/projects/page.tsx` — project list with custom delete modal
- [x] `app/dashboard/tokens/page.tsx` — balance, history, purchase
- [x] `app/dashboard/settings/page.tsx` — display name + email
- [x] `components/dashboard/DashboardSidebar.tsx` — fixed active state logic
- [x] `components/dashboard/DashboardNav.tsx` — notifications dropdown, search bar

## Phase 9: Cleanup & Config — DONE

- [x] `.env.example` — all new vars documented
- [x] `stripe` package installed
- [x] Old routes deleted (api/order, api/scrape, dashboard/create, orders, videos)
- [x] TypeScript compiles clean

## Phase 10: Conversion Metric — DONE

- [x] `app/api/admin/metrics/route.ts` — users_generated vs users_purchased (admin-only)

## Phase 11: Python Generation Service — SCAFFOLDED

- [x] Repo at `../o2-service/`
- [x] FastAPI + venv + requirements.txt
- [x] `POST /generate` — accepts job_id, project_id, image_s3_keys, config → 202
- [x] `POST /regen` — same + clip_index → 202
- [x] `POST /concat` — accepts job_id, project_id, clip_s3_keys → 202
- [x] Background tasks webhook back to Next.js on completion
- [ ] **Actual AI clip generation pipeline** — placeholder (asyncio.sleep)
- [ ] **FFmpeg concat implementation** — placeholder
- [ ] **S3 download/upload in tasks** — stubbed but not wired

---

## Remaining Work

| Item | Status | Notes |
|------|--------|-------|
| AI generation pipeline (Python) | Not started | Core logic for creating clips from images |
| FFmpeg concat (Python) | Not started | Stitch ordered clips into final MP4 |
| Real Stripe price IDs | Config only | Create products in Stripe dashboard |
| Email notifications | Deferred | Notification rows exist, no delivery |
| Video preview/playback | Deferred | Clips show placeholder, no embedded player |
| Drag-to-reorder (DnD) | Deferred | Currently uses ↑/↓ buttons |
| Production deploy | Not started | Vercel (app) + Lightsail (Python) |
| S3 bucket CORS for prod domain | Not started | Currently only localhost:3000 allowed |

## UX Polish Completed

- [x] Queue-based file uploader (handles 30+ files, shows progress, dismiss/skip)
- [x] Lightbox with keyboard nav (←/→) and select/deselect (Space/Enter)
- [x] Custom delete confirmation modal (no browser confirm())
- [x] Notifications dropdown with unread badge + mark-as-read
- [x] Top-up prompt modal when balance insufficient
- [x] Sidebar active state correctly scoped per route
- [x] Settings page (display name)

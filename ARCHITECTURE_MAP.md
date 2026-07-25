# Koma: Architecture Flow Maps

## Component 1: Koma Gate (semantic request filter)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KOMA GATE FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐     ┌──────────────────┐     ┌────────────────────────────┐  │
│  │  Client  │────▶│  API Gateway     │────▶│  Koma Gate                │  │
│  │  (Voice/ │     │  (Rate Limit +   │     │  ┌──────────────────────┐  │  │
│  │   Text)  │     │   Geo Allowlist) │     │  │  Semantic Classifier │  │  │
│  └──────────┘     └──────────────────┘     │  │  (Lightweight LLM)   │  │  │
│                                             │  │  ──────────────────  │  │  │
│                                             │  │  Input: User Query   │  │  │
│                                             │  │  Output: JSON        │  │  │
│                                             │  │  {"in_scope": bool}  │  │  │
│                                             │  └──────────┬───────────┘  │  │
│                                             └─────────────┼──────────────┘  │
│                                                           │                 │
│                                    ┌──────────────────────┼──────────────┐  │
│                                    ▼                      ▼              ▼  │
│                           ┌───────────────┐       ┌───────────────┐ ┌────────┐
│                           │  IN_SCOPE     │       │  OUT_OF_SCOPE │ │ ERROR  │
│                           │  (true)       │       │  (false)      │ │ FALLBACK│
│                           └───────┬───────┘       └───────┬───────┘ └────┬───┘
│                                   │                       │             │
│                                   ▼                       ▼             ▼
│                          ┌─────────────────┐    ┌─────────────────┐ ┌──────────┐
│                          │  Route to Core  │    │  Return 400/    │ │ Fail-Open│
│                          │  Business Logic │    │  Friendly Msg   │ │ (Allow)  │
│                          │  (RAG, Tools,   │    │  "Out of scope" │ │          │
│                          │   Generation)   │    │  or "Silence"   │ │          │
│                          └─────────────────┘    └─────────────────┘ └──────────┘
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

KEY DESIGN PRINCIPLES:
├── Pre-Filter: Rate Limit + Geo Allowlist (cheap, fast)
├── Semantic Gate: Single LLM call with strict JSON output
├── Few-Shot Prompting: 8-10 examples covering edge cases
├── Fail-Open: Classifier failure → allow request (availability > security)
├── Token Budget: < 500 tokens per classification call
└── Latency Target: < 500ms p99
```

---

## Component 2: Koma Core (dual-store routing)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KOMA CORE FLOW                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WRITE PATH (Ingestion Pipeline)                                            │
│  ─────────────────────────────                                              │
│                                                                              │
│  ┌─────────────┐    ┌──────────────────┐    ┌────────────────────────────┐  │
│  │  Raw Data   │───▶│  Validation &    │───▶│  Dual-Collection Writer    │  │
│  │  (Source)   │    │  Sanitization    │    │  ┌──────────────────────┐  │  │
│  └─────────────┘    └──────────────────┘    │  │  DB_INDEX (Public)   │  │  │
│                                             │  │  ──────────────────  │  │  │
│                                             │  │  • searchable fields │  │  │
│                                             │  │  • display_name      │  │  │
│                                             │  │  • category/tags     │  │  │
│                                             │  │  • content_hash      │  │  │
│                                             │  │  • content_token     │  │  │
│                                             │  │  • NO sensitive data │  │  │
│                                             │  └──────────┬───────────┘  │  │
│                                             │             │              │  │
│                                             │  ┌──────────▼───────────┐  │  │
│                                             │  │  DB_CONTENT (Private)│  │  │
│                                             │  │  ──────────────────  │  │  │
│                                             │  │  • Full payload      │  │  │
│                                             │  │  • content_token     │  │  │
│                                             │  │  • SPL_ID (doc ID)   │  │  │
│                                             │  │  • access_control    │  │  │
│                                             │  │  • audit_trail       │  │  │
│                                             │  └──────────────────────┘  │  │
│                                             └────────────────────────────┘  │
│                                                                              │
│  READ PATH (Query Execution)                                                │
│  ─────────────────────────                                                  │
│                                                                              │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────┐  │
│  │  Client  │───▶│  Search API  │───▶│  DB_INDEX Lookup │───▶│  Return  │  │
│  │  Query   │    │  (Gateway)   │    │  (by content_token)│   │  Index   │  │
│  └──────────┘    └──────────────┘    └────────┬─────────┘    └──────────┘  │
│                                                │                            │
│                                                ▼                            │
│                                       ┌──────────────────┐                  │
│                                       │  Client receives │                  │
│                                       │  lightweight     │                  │
│                                       │  results +       │                  │
│                                       │  content_token   │                  │
│                                       └────────┬─────────┘                  │
│                                                │                            │
│                                                ▼                            │
│                                       ┌──────────────────┐                  │
│                                       │  Detail API      │                  │
│                                       │  (Authenticated) │                  │
│                                       │  ──────────────  │                  │
│                                       │  Verify token    │                  │
│                                       │  Fetch from      │                  │
│                                       │  DB_CONTENT      │                  │
│                                       │  Rate limit      │                  │
│                                       └──────────────────┘                  │
│                                                                              │
│  ANTI-SCRAPING MECHANICS                                                    │
│  ─────────────────────                                                      │
│  ✓ DB_INDEX: Listable, searchable, NO high-value content                   │
│  ✓ DB_CONTENT: Document ID = cryptographic token (unguessable)             │
│  ✓ Token mapping: Stored ONLY in backend, never exposed to client          │
│  ✓ Rate limiting: Per-token, per-IP, per-user tiers                        │
│  ✓ Audio validation: Size check + duration check + format verification     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

TOKEN MAPPING SCHEMA:
┌─────────────────────────────────────────────────────────────────┐
│  DB_INDEX Document                                              │
│  ─────────────────                                              │
│  {                                                              │
│    "id": "searchable-slug",          // Human-readable          │
│    "display_name": "Product Name",   // Safe for public         │
│    "category": "category-tag",       // Filterable              │
│    "content_hash": "sha256(...)",    // Integrity verification  │
│    "content_token": "hkdf(secret,    // Opaque reference to     │
│                       spl_id)",       // DB_CONTENT (NEVER      │
│    "metadata": {...}                 //  exposed to client)     │
│  }                                                              │
│                                                                 │
│  DB_CONTENT Document                                            │
│  ────────────────────                                           │
│  {                                                              │
│    "id": "content_token",          // = HKDF(secret, spl_id)    │
│    "spl_id": "original-source-id",   // Traceability            │
│    "payload": { ... },             // Full high-value content   │
│    "access_tier": "premium",         // Authorization           │
│    "created_at": timestamp,          // Audit                   │
│    "access_count": 0                 // Rate limiting           │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Combined Defense Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PROJECT KOMA: LAYERED DEFENSE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 1: NETWORK PERIMETER                                            │   │
│  │ ├─ Rate Limiting (IP + User + Endpoint)                              │   │
│  │ ├─ Geo Allowlist (Configurable country codes)                        │   │
│  │ ├─ Audio/Upload Validation (Size, Duration, MIME, Entropy)           │   │
│  │ └─ Auth Token Verification (Firebase/JWT)                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 2: SEMANTIC FIREWALL (Koma Gate)                                │   │
│  │ ├─ Prompt Injection Detection (Regex + LLM)                          │   │
│  │ ├─ Intent Classification (In-Scope vs Out-of-Scope)                  │   │
│  │ ├─ Profanity/Toxicity Filter                                         │   │
│  │ └─ Fail-Open Design (Availability Priority)                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                    ┌───────────────┴───────────────┐                         │
│                    ▼                               ▼                         │
│           ┌─────────────────┐             ┌─────────────────┐               │
│           │ IN_SCOPE: Route │             │ OUT_OF_SCOPE:   │               │
│           │ to Business     │             │ Reject + Log    │               │
│           │ Logic           │             │ (400/422)       │               │
│           └────────┬────────┘             └─────────────────┘               │
│                    │                                                         │
│                    ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ LAYER 3: DATA ACCESS CONTROL (Koma Core)                              │   │
│  │ ├─ Dual-Collection Architecture (Index + Content)                    │   │
│  │ ├─ Cryptographic Token Mapping (HKDF-derived)                        │   │
│  │ ├─ SPL_ID as Document ID (Prevents Enumeration)                      │   │
│  │ ├─ Per-Token Rate Limiting                                           │   │
│  │ └─ Audit Trail + Access Tracking                                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
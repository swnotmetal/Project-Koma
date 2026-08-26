# Koma: Architecture Flow Maps

## Component 1: Koma Gate (semantic request filter)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KOMA GATE FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐     ┌──────────────────┐     ┌────────────────────────────┐  │
│  │  Client  │────▶│  Koma Scout      │────▶│  Koma Gate                │  │
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
├── Few-Shot Prompting: up to 10 examples covering edge cases
├── Fail-Open: Classifier failure → allow request (availability > security)
├── Token Budget: ~500 tokens per classification call (design target)
└── Latency Target: < 500ms p99 (design target, provider-dependent)
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
  ✓ DB_CONTENT: Document ID = HKDF-derived token (unguessable)              │
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
│    "displayName": "Product Name",    // Safe for public         │
│    "category": "category-tag",       // Filterable              │
│    "contentHash": "sha256(...)",     // Integrity verification  │
│    "contentToken": "hkdf(secret,     // Opaque reference to     │
│                       sourceId)",     // DB_CONTENT (NEVER      │
│    "metadata": {...}                 //  exposed to client)     │
│  }                                                              │
│                                                                 │
│  DB_CONTENT Document                                            │
│  ────────────────────                                           │
│  {                                                              │
│    "id": "contentToken",           // = HKDF(secret, sourceId)  │
│    "sourceId": "original-source-id", // Traceability            │
│    "payload": { ... },             // Full high-value content   │
│    "accessTier": "premium",          // Authorization tier      │
│    "createdAt": timestamp,           // Audit                   │
│    "accessCount": 0                  // Rate limiting           │
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
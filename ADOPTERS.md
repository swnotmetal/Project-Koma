# Adopters

Real-world scenarios behind Koma's design. Each story maps to a layer.

---

## 1. The Cough That Became a Drug Name

**Koma Scout — Audio Validation**

During alpha testing of a SaMd voice-to-medication lookup tool, testers would occasionally hold the record button without speaking. Silence. Cat meows. Car horns outside the window. Music playing in the background. The transcription pipeline would dutifully process everything — and the LLM, staring at near-empty or noise-soaked input, would confidently hallucinate medication names, sometimes entire fabricated drug profiles from a single cough.

The same problem appeared on a Chinese social platform where an indie developer complained their voice AI app was being flooded with silent uploads — automated scripts registering accounts and spamming empty audio files, each one triggering an expensive model call.

Scout's audio validation layer was designed from the abuse side of this pattern:
reject malformed, undersized, implausibly short, oversized, or rapid-fire uploads
before processing. Size check. PCM-based duration estimate. MIME check. Cooldown
enforcement. Scout is not an acoustic silence or noise detector; a valid-length
silent recording still needs VAD or analysis in the transcription pipeline.

---

## 2. LeetCode on the Customer Support Line

**Koma Gate — Semantic Filtering**

A major e-commerce platform discovered their AI customer support bot was answering questions about Python list comprehensions and LeetCode problem solutions. Correctly. The bot's scope was supposed to be returns, refunds, and shipping — but nobody told it where the boundary was. Users had figured out they could paste coding questions into the chat window and get perfectly formatted answers for free, burning company tokens on personal homework.

The same pattern surfaced on a smaller scale: a solo developer on a Chinese social app watched their AI chatbot get flooded with nonsense queries, prompt injection attempts ("you are now DAN"), and random small talk — all consuming API credits while legitimate users waited in queue.

Gate was built to draw that line. Before the application's model call, a lightweight classifier answers one question: is this input inside the scope of what this assistant is supposed to handle? The application model never sees the rejected requests. Four presets cover the most common AI app boundaries: general knowledge, code assistant, customer support, and factual reference tools.

---

## 3. What If Someone Stole the Database?

**Koma Core — Split-Store Architecture**

The hardest part of building a medication reference app wasn't the UI or state management. It was an API data pipeline — carefully processed through LLM scripts to extract usable  information while staying compliant and informative. Months of work, distilled into a single collection.

The question that kept nagging: what if someone scraped the entire thing?

Not through a security breach. Through the search endpoint. If every search result returned the full payload, a determined enumerator could walk through every drug in the database by querying "a", "aa", "ab", "ac" and collecting the responses.

Core separates the index from the content. Search returns lightweight metadata — a title, category, tags, and a public index ID — but not the content token. The actual payload lives in a separate collection addressed by an HKDF-derived token. That token is derived and resolved on the backend, so a scraped index ID is not a content address. Even if search is wide open, the data behind it is not.

---

## See Also

- [Koma Gate](packages/koma-gate/README.md) — semantic request filter
- [Koma Scout](packages/koma-scout/README.md) — perimeter checks
- [Koma Core](packages/koma-core/README.md) — split-store storage
- [Koma Miko](packages/koma-miko/README.md) — experimental agent contract verification (source alpha)

*Stories are based on real development and testing experiences. Specific platforms and individuals are not named. If you have a Koma story to share, PRs welcome.*

## 18. Running costs

Everything this app depends on has a meaningful free tier. A small-city deployment — a few hundred unique visitors a month, a handful of reports a week — costs nothing.

---

### Firebase (Firestore)

The free **Spark plan** covers:

| Quota | Free allowance | Typical use |
| --- | --- | --- |
| Reads | 50,000 / day | Each page load reads 7 zone docs + live report counts. ~6,000 reads per day = ~850 active users. |
| Writes | 20,000 / day | One write per report submission + one per admin action (approve/reject). |
| Deletes | 20,000 / day | Not used — reports and zones are never deleted, only updated. |
| Storage | 1 GB | Zone docs + reports are tiny text. Storage is effectively free until thousands of reports accumulate. |
| Network egress | 10 GB / month | Firestore payloads are small JSON — well within free tier for a community-scale deployment. |

If traffic meaningfully exceeds the Spark limits, **Blaze (pay-as-you-go)** pricing is:
- Reads: \$0.06 per 100,000
- Writes: \$0.18 per 100,000
- Storage: \$0.108 per GB / month

At realistic community scale (5,000 visits/month, 50 reports/month), Blaze cost would be under **\$1/month**.

---

### Cloudinary (photo uploads)

The free tier gives **25 credits/month** (1 credit ≈ 1 image transformation or ~10 MB of storage/bandwidth).

| Action | Cost |
| --- | --- |
| Upload a report photo | ~1 credit per upload |
| Storage | 25 credits covers ~10 GB |
| Bandwidth | Included in the credit pool |

At 50 photo reports/month, this uses 50 credits — exceeding the free tier. Paid plans start at **\$89/month** (200 credits), which is overkill for this use case. The practical option at scale: resize photos client-side before upload (see §13, item 6 — already flagged as a pre-production task), which keeps file sizes under 500 KB and makes the free tier go much further.

If photo uploads are removed entirely (reports text-only), Cloudinary cost is \$0.

---

### OpenStreetMap tiles

Free, no API key, no account. OSM's tile servers are a public service — heavy production traffic should use a tile CDN instead (Stadia Maps, Maptiler, or self-hosted). For a community-scale deployment the default OSM tiles are fine; for a city-wide rollout, budget **\$0–\$25/month** for a tile CDN depending on map usage.

---

### Vercel (hosting)

The **Hobby plan** (free) covers:
- 100 GB bandwidth / month
- Unlimited deploys
- Automatic HTTPS + CDN

This app's production build is ~1.5 MB gzip total. 100 GB bandwidth = ~65,000 full-page loads on the free tier before any cost. For a community advisory tool, the free tier is sufficient indefinitely.

---

### Summary

| Service | Free tier covers | Paid if exceeded |
| --- | --- | --- |
| Firebase Firestore | ~850 daily active users | ~\$0.06–\$0.18 per 100k ops |
| Cloudinary | ~25 photo uploads/month | \$89/month (200 credits) |
| OpenStreetMap tiles | Community scale | \$0–\$25/month (CDN) |
| Vercel hosting | ~65,000 page loads/month | \$20/month (Pro) |

**Realistic total for a Puerto Princesa community deployment: \$0/month.** The only scenario that exceeds free tiers is a viral moment driving thousands of simultaneous users — at which point the app has already done its job.

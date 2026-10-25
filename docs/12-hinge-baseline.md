# 12 — Hinge Baseline & Feature Map

Status: Draft v0.1 · 2026-10-25 · Owner direction: **"Hinge is the baseline; we keep most of what they have."**

This doc maps Hinge's feature set to Flinger: what the Flutter prototype already covers, what we adopt in v1, what is a fast-follow, and what is skipped. Hinge facts come from public web sources listed at the end; **anything not backed by a source is marked "from general knowledge — verify"**. Hinge does not publish its ranking formula, and third-party blogs disagree on several details, so treat numbers as indicative.

## 1. What the Flutter prototype (branch `abhinav`) already implements

An 11-step onboarding questionnaire (UI + local state only, **no API calls**; discovery uses a mock repository with `pravatar.cc` placeholder photos):

| Step | Question | Rules in the prototype |
|---|---|---|
| 1 | First name + birthday | 18+ check with an "age confirmation" dialog and an under-age block |
| 2 | "How do you identify?" | Woman · Man · Non-binary (single choice) |
| 3 | Dating or BFF | Single choice: `dating` or `bff` |
| 4 | Who would you like to meet? | Men · Women · Non-binary people (multi, with "everyone" toggle) |
| 5 | Hoping to find | Pick up to **2** of: long-term relationship, life partner, something casual, intimacy/no commitment, marriage, ethical non-monogamy |
| 6 | Height | Picker in cm (default 204 in code — should be ~170) |
| 7 | Values in a person | Pick up to **3** of 15 (ambition, kindness, honesty, humour, …) |
| 8 | Kids & family plans | Have/don't have kids; future kids (don't want / want / open / not sure) — **skippable** |
| 9 | Beliefs: religion & politics | 16 religions, 6 political options — **skippable** |
| 10 | Causes & communities | Pick up to **3** of 15 — **skippable** |
| 11 | Photos | 6 slots, image picker + cropper; prototype lets you continue with **2** |

Plus: email → OTP (6-digit, resend timer) → create password flow, location + notification permission screens, a 5-tab home (**Profile · Discover · People · Liked You · Chat**), a swipe deck (custom `swipe_cards` package), a profile card (verified badge, about, looking for, values, family, lifestyle, causes), and placeholder pages for Discover, Liked You and Chats.

**Not in the prototype:** profile prompts, like-with-comment, any of Hinge's discovery features (Standouts, Most Compatible, Roses), Your Turn, Match Note, dealbreakers/preferences, voice/video, job/education/hometown/drinking/smoking "vitals", real API integration, Profile tab content.

## 2. Hinge feature map and Flinger decision

Decision key: **v1** = in launch scope · **FF** = fast-follow after launch · **Later** = needs payments or more data · **Skip** = not planned. *Proposed* until you confirm.

| Hinge feature | What it is (source) | In prototype? | Flinger decision |
|---|---|---|---|
| **Profile: 4–6 photos + 3 prompts** | Hinge requires between 4 and 6 photos (varies by region) and 3 prompt answers; answers capped at 150 chars [S2] | Photos yes (min wrong); **prompts no** | **v1**: 4–6 photos (your decision) and **3 prompts** — prompts are Hinge's core mechanic and what makes likes meaningful |
| **Vitals** (height, religion, politics, kids, etc.) | Profile facts shown on the card | Height, religion, politics, kids, family plans | **v1** (already designed). Optional extras later: job, education, hometown, drinking/smoking *(from general knowledge — verify)* |
| **Dating intentions** | "Hoping to find" | Yes (max 2) | **v1** |
| **Like a specific photo/prompt, with optional comment** | Likes target a photo or prompt; Hinge reports likes on text prompts convert better than photo likes [S1][S3] | No (swipe only) | **v1 decision needed** — Hinge's model is *like a specific item + optional comment*, not Tinder-style swipe. Your prototype has swipe cards. See §3 |
| **Daily likes cap (free)** | Free members get a limited number of likes per day; Hinge+ removes it [S4]; reports of 8–10/day [S4] | — | **v1: 25 per day** (your decision), configurable; entitlements designed so plans can change it later |
| **Likes You (see who liked you)** | Free users see one incoming like at a time; paid sees all [S4] | Tab exists (placeholder) | **v1** a basic list; full visibility is the obvious **paid** lever later |
| **Match Note** | After both like, a note shows; the recipient views it to complete the match [S5] | No | **FF** |
| **Standouts + Roses** | Daily curated feed of prompts/photos; Roses are a premium signal that pins you at the top of someone's Likes You; sources differ on quantities [S6] | No | **Later** (needs payments); Standouts without Roses is **FF** |
| **Most Compatible** | A daily recommendation refreshed every 24 h, using ML plus the Gale–Shapley algorithm; inputs reportedly include mutual dealbreakers, activity and like patterns [S5] | No | **FF**: v1 uses the rules-based score ([discovery](06-discovery-matching-chat.md)); this is the natural upgrade |
| **Your Turn + Your Turn Limits** | Nudges you to reply; since 2024 limits new connections if too many people are waiting on you [S5] | No | **FF** (chat nudges first, limits later) |
| **We Met** | A few days after numbers are shared, Hinge asks if you met and if you'd see them again; feeds matching [S5] | No | **Later** (needs enough data and a number-sharing signal) |
| **Preferences & Dealbreakers** | Hard filters (age, distance, etc.); advanced preferences are paid [S1][S4] | Partial (age/distance planned) | **v1**: age, distance, who to see. Dealbreaker flags for a few vitals **FF**; "advanced preferences" are a paid lever |
| **Hidden Words** | Filter Likes with Comments by words/emoji you don't want to see [S5] | No | **FF** (safety/quality-of-life) |
| **Prompt Feedback** | AI grades your prompt answers privately [S3] | No | **Later** (optional; can use an LLM) |
| **Voice prompts / voice notes** | 30-second audio answers; Vice reports Hinge removed voice/video *calling* in late 2025 while keeping voice notes [S3] | No | **Skip for v1** |
| **Selfie verification** | Verified badge | Verified badge in card UI | **FF** (schema reserves `verification_status`) |
| **Subscriptions** (Hinge+, HingeX) | Hinge+ adds unlimited likes, see all likes, advanced preferences; HingeX adds enhanced recommendations, skip the line, priority likes [S4] | — | **Later** (you said evaluate plans after payments exist) |
| **Dating vs BFF** | Not a Hinge feature (Bumble has BFF) | Yes — a step in the questionnaire | **Open decision** — see §3 |

## 3. Decisions (accepted by the owner 2026-10-25: all recommendations adopted, D1–D5)

> Original options and reasoning kept below for the record.

1. **Swipe or Hinge-style "like a thing"?** Your prototype has a swipe deck; Hinge shows a scrollable profile and you like a *specific photo or prompt* (optionally with a comment). Recommendation: **keep a card stack for browsing but make likes target a photo or prompt with an optional comment** — it keeps your built UI and gets Hinge's higher-quality signal. Pure swipe is faster to ship; Hinge-style is better for the "Meet people who feel real" positioning.
2. **Prompts in v1?** Hinge requires 3 prompt answers (≤150 chars) [S2]. They are not in the prototype. Recommendation: **yes** — add a prompts step to onboarding (a library of ~30 prompts to start).
3. **Keep BFF mode?** It doubles the discovery pools (a `dating_mode` filter on everything) and moderation concerns, and isn't part of Hinge. Recommendation: **hide BFF for v1** (keep the field in the schema, default `dating`), launch dating-only, and add BFF later if demand appears.
4. **Auth with both phone and email: keep the password step?** Hinge signs in with a phone number. The prototype does email → OTP → password. With phone *and* email supported, the simplest consistent model is **passwordless OTP on either identity** (no password to set, reset or leak). The prototype's password rule also allows only 4–12 characters, which is too weak to ship. Recommendation: **drop passwords.**
5. **Orientation vs gender model:** the prototype stores `gender` ∈ {woman, man, non_binary} and `interested_in` ⊆ {men, women, non_binary people} (note the naming mismatch `woman`/`women`, normalized in the API). That is a sound base. Confirm it is enough for launch (no separate "sexuality" field, no pronouns, no "show gender on profile" toggle — Hinge has some of these *(from general knowledge — verify)*).

## 4. How this changes the requirements

See the updated [requirements](11-requirements.md): 25/day like cap, 4–6 photos, both phone and email sign-in, one account per phone and per email, India + English only, the full 11-step onboarding data set, and prompts/like-targeting as **pending decisions** (items D1–D5 above).

## Sources

- [S1] Hinge reveals Standouts and Roses — https://www.globaldatinginsights.com/news/hinge-reveals-standouts-and-roses/
- [S2] Hinge profile checklist (photo/prompt requirements, 150-char answers) — https://theeverygirl.com/hinge-expert-dating-app-profile-checklist/ (secondary source; confirm against Hinge's help center)
- [S3] Hinge Prompt Feedback press release — https://hinge.co/press/prompt-feedback ; voice prompts — https://www.globaldatinginsights.com/news/hinge-announces-audio-expansion-with-voice-prompts-and-voice-notes/
- [S4] Hinge subscription benefits (help center, as quoted in search results) — https://help.hinge.co/hc/en-us/articles/38014282744595-Subscription-and-Purchase-Benefits (page returned 403 to direct fetch; details cross-checked via https://www.swipestats.io/blog/hinge-subscription)
- [S5] Most Compatible — https://www.marieclaire.co.uk/life/sex-and-relationships/dating-app-hinge-most-compatible-696147 ; Match Note — https://hinge.co/press/match-note ; algorithm overview — https://www.swipestats.io/blog/hinge-algorithm ; We Met — https://www.calendar-uk.co.uk/frequently-asked-questions/how-does-hinge-know-i-met-someone-in-person
- [S6] Standouts/Roses — https://www.swipestats.io/blog/hinge-standouts and https://www.swipestats.io/blog/hinge-roses (sources disagree on Rose quantities)

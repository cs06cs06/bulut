# Research: ChatGPT plans compared, Free vs Go vs Plus vs Pro 100/200/500 (as of 2026-10-11)

> **Read this first: problems with the working title**
> 1. **"GPT-6 vs GPT-6 Luna" isn't how the plans split in regular chat.** The help center (updated ~Oct 9, 2026) says Free and Go chats use **GPT-5.6 Luna**. Paid plans get **"GPT-6"** in the model menu, which runs on GPT-6 Sol, and the "Pro" setting runs on GPT-6 Astra. Free and Go get **GPT-6 Luna only in the desktop app** (ChatGPT Work/Codex). The pricing page doesn't fully agree: it says "Unlimited text chats with GPT-6" on the Free card. An Oct 7, 2026 OpenAI post titled "GPT-6 and Intelligent UI for everyone" may explain this, but **I couldn't read it**. Check before you script it.
> 2. **"Space" and "Pages" aren't in the official plan comparison table.** Only **Sites** and **Dots** are. Which plans get Space comes from secondary sources only (see below).
> 3. **The official pages I fetched didn't show prices for Free, Go or Plus.** The numbers seem to load dynamically and change by region. Only the Pro prices are confirmed in official text.
> 4. **I hit the research tool limit.** I couldn't open the Dots, Space and Sites feature pages, the Go help article, the ads article or the Oct 7 post. Those items are marked "unverified".

## Outcome
- After the video, viewers can pick the cheapest plan that covers what they actually do: the model they need in chat, Sites, Dots, how much context they get, and the Pro usage tier. They'll also know how to upgrade, switch Pro tiers and buy credits without overpaying.
- Rough audience mapping (from official feature lists):
  - **Free:** casual users.
  - **Go:** regular users who want higher limits.
  - **Plus:** knowledge workers who need reasoning, Sites, Work or Codex, Projects, custom GPTs and scheduled tasks.
  - **Pro:** heavy research or coding, GPT-6 Pro reasoning, Dots, biggest context. Pick the tier by how much you use it.

## Steps (current UI)
1. **Compare plans:** go to chatgpt.com/pricing → **Individual** tab → scroll to **"Compare features across plans"**.
2. **Upgrade:** sign in → open the pricing page → choose a plan. The Plus FAQ also says you can open settings and select **"Upgrade to Plus"**. [chatgpt.com/plans/plus]
3. **Change Pro tier (100/200/500):** **Settings → My Plan**. [help 9793128]
4. **Buy extra usage (credits):** **Settings → Usage** in ChatGPT, or **Usage & Billing** in Codex. Credits only cover Codex, ChatGPT Work, and ChatGPT for Word, Excel and PowerPoint, not every model or feature. [help 9793128]
5. **Pick a model and thinking level (paid plans):** model menu → **GPT-6** (it replaced "Latest") → **Thinking** slider: **Instant / Medium / High / Extra High / Pro**. Free and Go have a **Think** option instead, which uses GPT-5.6 Luna. [help 20001354]
6. **Ultrafast (Pro 500 only):** choose it in the model picker. [help 9793128]
7. **Reduce visual answers:** on the web, **Settings → turn off "Layout and visuals"**. [help 20001354]
8. **Astra missing in the desktop app:** **Menu > Check for Updates**. Codex CLI needs version 0.153.0 or newer. [help 20001354]
9. **Cancel:** cancel on the platform where you paid (ChatGPT, Apple or Google Play). Uninstalling the app doesn't cancel. [help 9793128]

## Pricing & plans (as of 2026-10-11)
| Plan | Price (USD/mo) | Source status |
|---|---|---|
| Free | $0 | Official |
| Go | $8 (US; varies by region) | Third-party only (glbgpt says it checked official sources Sep 28, 2026; lindy, cloudzero, felloai agree). Not shown in the fetched official page. "Available in select regions." |
| Plus | $20 | Third-party only, but every source agrees. Not shown in the fetched official page. |
| Pro 100 / Pro 200 / Pro 500 | $100 / $200 / $500 | **Official** (help 9793128). Monthly billing only, no annual plan. |
| Business | $25/user monthly, $20 annual (third-party); 2-user minimum (official) | Price unverified officially |

**What each plan unlocks** (official pricing table chatgpt.com/pricing plus help 20001354):

| Feature | Free | Go | Plus | Pro |
|---|---|---|---|---|
| Model in regular chat | GPT-5.6 Luna (help) / "GPT-6" (pricing card): **conflict** | GPT-5.6 Luna (help) | GPT-6 (Sol): Medium and High; **no Extra High, no Pro setting** | GPT-6: Medium, High, Extra High, plus Pro setting (GPT-6 Pro = Astra) |
| GPT-6 Luna (table row) | Yes (desktop app Work/Codex per OpenAI blog) | Yes | Yes | Expanded |
| GPT-6 Astra | No | No | Yes, **only in Work and Codex** | Expanded (Chat, Work, Codex) |
| GPT-6.1 Sol | No | No | Yes | Expanded |
| GPT-5.6 Sol Pro | No | No | No | Yes |
| Legacy models | No | No | Yes | Yes |
| Response times | "Limited on bandwidth & availability" | same | "Fast" | "Ultrafast (on eligible tiers)" |
| Instant context / max input | 27K / ~12 pages | 54K / ~40 pages | 54K / ~40 pages | 128K / ~250 pages |
| Reasoning context / max input | Varies | 256K / ~320 pages | 256K / ~320 pages | 400K / ~680 pages |
| ChatGPT Work | Limited (desktop app) | Limited (desktop app) | Desktop, web, mobile | Desktop, web, mobile |
| Codex | Limited | Limited | Yes | Expanded |
| **Dots** | No | No | No | **Yes** |
| **Sites** | No | No | **Yes** | Yes |
| Scheduled tasks | No | Yes | Yes | Yes |
| Projects / shared projects | Yes | Yes | Yes | Yes |
| Deep research | Limited | Limited | Yes | Yes ("Maximum") |
| Image generation with Thinking | No | No | Yes | Yes |
| Voice with video | No | Yes | Yes | Yes |
| Memory | Limited | Yes | Expanded | Expanded |
| Developer mode / record mode | No | No | Yes | Yes |
| Ads | unverified | "This plan may include ads" | none stated (third-party: no ads) | none stated |

**Pro tier differences** (help 9793128, help 20001354):
- **Pro 500** is the only tier with **Ultrafast** (GPT-6 Astra Ultrafast, GPT-6.1 Sol Ultrafast) and has the highest included usage. Ultrafast uses up your allowance 8× faster, then charges credits at 6× the standard rate.
- **Pro 200** gives more usage than Pro 100. It's open to new subscribers again, but new subscriptions get a **lower allowance** than before. If you had Pro 200 active between Sep 22 and Sep 29, 2026 (10am PT), you keep the old allowance until **Oct 29, 2026**. You get an email only if this affects you.
- **Pro 100:** GPT-6 Pro and GPT-5.6 Sol Pro share **one weekly allowance**.
- **Pro 200:** when you hit the weekly GPT-6 Pro limit, ChatGPT automatically switches you to GPT-5.6 Thinking at Medium.
- Exact usage multipliers per tier are **unverified** officially. Felloai claims "25x" for Pro 500, but the quote was cut off.
- Pro $100 launched on Apr 9, 2026 (TNW, Yahoo Tech).

**Space and Pages (secondary sources only):**
- Launched at DevDay on Sep 29, 2026.
- Space **replaces Library on Pro, Business and Enterprise** (VentureBeat, nerdschalk).
- Whether Plus, Go or Free get Space: **unverified**.
- **Pages** are documents inside Space that you and ChatGPT edit together. Space also holds spreadsheets, presentations and Sites (learn.chatgpt.com/docs/space).

**Dots:**
- An always-on agent with its own memory and its own cloud computer. It keeps working after you log off (mindstudio, VentureBeat).
- Per the Sep 29 release notes, Dots are on Pro **excluding the EEA, Switzerland and the UK**, plus Business Premium (eesel, secondary source).

## Gotchas
- **"Unlimited" has limits.** Unlimited chat is "subject to abuse guardrails". GPT-6 Pro is **not unlimited on any Pro tier**. Work and Codex allowances are separate from Chat.
- **Support can't reset limits.** If you hit a limit, wait for the reset time ChatGPT shows or switch to another model.
- **Credits don't unlock Ultrafast.** Buying credits on Pro 100 or Pro 200 doesn't give you Ultrafast. Keeping a grandfathered Pro 200 allowance doesn't add Pro 500 features either.
- **Plus users won't find Extra High or Pro in chat.** Astra is only available to them inside Work and Codex.
- **No automatic switching on Plus and Pro.** Instant doesn't move up to a higher thinking level by itself, and typing "think harder" doesn't switch it either.
- **Free and Go "Think" uses GPT-5.6 Luna,** not Sol.
- **Some official plan pages are out of date.** chatgpt.com/plans/go still mentions "GPT-5 auto messages". Use /pricing and the help center as the source of truth.
- **Prices may not show,** or may show in local currency, depending on region. Go is region-limited.
- **Old desktop apps (macOS/Windows) don't support Intelligent UI.** Use the web version instead.
- **App-store subscriptions** must be cancelled or refunded through Apple or Google. Cancelling doesn't automatically refund you.
- **Merging into a Business workspace** changes how your personal Pro subscription is handled. Keep the workspaces separate if you want to keep Pro.
- **Fast mode** uses up your allowance 2.5× faster than Standard.

## Alternatives (plan-level)
- **Plus vs Pro 100:** Pro 100 adds the GPT-6 Pro setting, Dots, 128K/400K context and unlimited image creation. The trade-off: Pro models share one weekly allowance, and Ultrafast isn't included.
- **Business:** for 2+ users. Adds an admin console, SAML SSO, SOC 2, and company knowledge (all "No" on individual plans).
- **Claude Max** ($100/$200) is the competitor the $100 Pro tier was aimed at (TNW, kingy.ai). Its details are outside this research.

## Showable public pages
- **chatgpt.com/pricing:** H1 "Pricing"; "See pricing for our individual, business, and enterprise plans."; tabs "Individual" / "Business & Enterprise".
  - Cards: "Free / Best for trying out ChatGPT / Get Free"; "Go / Best for longer conversations / Get Go"; "Plus / Best for advanced work and productivity / Get Plus"; "Pro / Best for research and coding / From … / month / Get Pro".
  - Pro bullets: "Your choice of 3 usage tiers", "Pro reasoning powered by GPT-6 Astra", "Dot, your always-on agent".
  - Go note: "This plan may include ads."
  - Table: "Compare features across plans", with sections "Essentials", "Models", "Features", "Privacy", "Security & Administration", "Customer Service". Rows to highlight: "GPT-6 Luna", "GPT Instant total context window", "Dots", "Sites".
- **help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers:** H1 "About ChatGPT Pro tiers"; table "Plan | Monthly price (USD) | Ultrafast" (Pro 100 $100 Not included / Pro 200 $200 Not included / Pro 500 $500 Included); headings "Can I subscribe to Pro 200 again?", "Which Pro plans include Ultrafast?".
- **help.openai.com/articles/11909943** (redirects to "GPT-6 and other models in ChatGPT"): table "Availability by ChatGPT plan" with columns "Medium and High | Extra High | Pro"; FAQ "Why don't I see GPT-6?".
- **chatgpt.com/plans/plus/:** H1 "ChatGPT Plus"; buttons "Try ChatGPT Plus" / "Compare plans".
- **chatgpt.com/plans/pro/:** H1 "ChatGPT Pro"; "Full access to the best of ChatGPT"; "Try ChatGPT Pro".
- **chatgpt.com/plans/free/:** H1 "ChatGPT Free"; "Try ChatGPT Free" / "Compare plans".
- **chatgpt.com/plans/go/:** H1 "ChatGPT Go" (outdated GPT-5 wording; avoid showing it, or point out that it's stale).
- **openai.com/index/introducing-gpt-6-sol-and-luna/:** H1 "Introducing GPT‑6 Sol and Luna"; "Availability" section ("Free and Go users can access GPT‑6 Luna in the desktop app. These models are not yet available in Chat.").
- **chatgpt.com/features/dots/**, **/features/space/**, **/features/sites/**: these URLs appear in the official navigation, but **I couldn't check the text on the pages**.
- **learn.chatgpt.com/docs/space:** H1 "Space"; on-page text not fully verified.

## Sources
- https://chatgpt.com/pricing (fetched 2026-10-11)
- https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers (updated ~Oct 8, 2026)
- https://help.openai.com/en/articles/20001354-gpt-6-and-other-models-in-chatgpt (updated ~Oct 9, 2026)
- https://chatgpt.com/plans/free/, /plans/go/, /plans/plus/, /plans/pro/
- https://openai.com/index/introducing-gpt-6-sol-and-luna/
- https://www.glbgpt.com/hub/full-chatgpt-go-price-guide/ (Go $8)
- https://www.lindy.ai/blog/chatgpt-pricing ; https://www.cloudzero.com/blog/how-much-does-chatgpt-cost/ ; https://felloai.com/chatgpt-pricing/
- https://venturebeat.com/technology/openai-launches-dots-always-on-ai-agent-coworkers-and-chatgpt-space-where-they-can-collaborate-with-human-teams
- https://www.eesel.ai/blog/chatgpt-space ; https://nerdschalk.com/chatgpt-space-announced/ ; https://www.mindstudio.ai/blog/openai-spaces-pages-collaboration ; https://learn.chatgpt.com/docs/space
- https://thenextweb.com/news/openais-new-100-chatgpt-pro-plan-targets-claude-max-with-five-times-the-codex-access
- https://theaicareerlab.com/blog/chatgpt-pricing-plans-explained (Plus has no ads; third-party)

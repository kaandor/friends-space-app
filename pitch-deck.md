![Friends Space Logo](public/Logo.png)

# Friends Space - Pitch Deck

<!-- SVG Logos Section -->
## Slide 1: Title
![Friends Space Logo](public/Logo.png)

**Friends Space**
Social for Youth | Calls & Live Streaming
Built on Cloudflare | Biometrics & P2P

---

## Slide 13: Credits & Tech Stack
### Desenvolvedores
- **Kaandro Bezerra** - Backend & Liveness Logic
- **Maycon da Silva** - Frontend, Interface & Recursos

### Ferramenta para funcionamento
- **Google Drive** - Storage per user (o site hospeda arquivos de calls/transmissoes)
- **Cloudflare Pages** - Hospedagem do site (`friends-space.pages.dev`)
- **Vercel** - Backend API proxy (`functions/api/[[path]].js`)
- **Turso** - Banco de dados relacional
- **Cloudflare Tunnel** - Conexão segura entre domains

### Formatos de Arquivo
- `public/Logo.png` - Logo principal (PNG)
- `public/favicon.svg` - Favicon SVG
- `public/icons.svg` - Ícones SVG
- Markdown export → PDF maintains image references

---

## Slide 1: Title
**Friends Space**
Social for Youth | Calls & Live Streaming
Built on Cloudflare | Biometrics & P2P

---

## Slide 2: The Problem
- Youth need safe, high-quality social connections online
- Existing platforms compromise privacy, lack control, poor mobile experience
- No verified age-gated social apps with real-time biometrics
- Calls often unencrypted, low quality, no community features
- Complex onboarding prevents adoption

---

## Slide 3: The Solution
**Friends Space** - A social network built for youth, by youth:
- 📞 **P2P encrypted calls** with remote control
- 📺 **Live streaming up to 2K60fps**
- 👤 **Verified age-gated access** via facial biometrics + RG
- 💾 **Personal Google Drive storage** per user
- 🏘️ **Community servers** + **DM chat**
- 📱 **Fully optimized mobile** (iPhone 12+)

---

## Slide 4: Product Highlights
### Core Features
- **Calls P2P** - Cryptogarated, low latency, remote control
- **Transmissions** - Up to 2K60fps with personalized quality
- **Profile** - Biometric verification status, age gate, community links
- **Servers** - Create & manage community servers
- **Chat DM** - Private messaging within platform

### Technical Moat
- **MediaPipe Face Landmarker** - 478 facial points, yaw detection, liveness
- **dHash facial recognition** by CPF with multi-hash history (4 samples)
- **RG validation** - Selfie vs RG front comparison (skeleton + skin/iris color)
- **Cloudflare Pages** deployment + Vercel proxy architecture
- **Mobile-first**: 100dvh layout, safe-area, optimized for iPhone

---

## Slide 5: How It Works (Onboarding)
1. **Google Login** → Account creation
2. **AgeGate18** → QR code + biometrics for minors (guardian verification)
3. **BiometricQR** → Selfie + RG frontal/traseira captura
4. **MediaPipe analysis** → Yaw (left/right/center), blink detection, liveness
5. **dHash comparison** → Match against stored hashes (tolerance 0.45)
6. **Access liberated** → Profile, calls, transmissions liberados
7. **Automático no Drive** → Calls/transmissoes salvas no Google Drive do usuário

---

## Slide 5: Business Model
- **Current**: Beta/teste phase, user growth focus
- **Future monetization paths**:
  - Premium features (higher stream quality, custom server themes)
  - Community boosts (server customization, larger member limits)
  - Branded integrations (safe for youth audience)
- **Storage cost**: Google Drive per user (optimized quotas, low marginal cost)
- **Infra**: Cloudflare Pages free tier + Vercel proxy (low OpEx)

---

## Slide 6: Market Opportunity
- **TAM**: Gen Z+ youth social platforms (~50M+ in LATAM/US alone)
- **SAM**: Apps with verified age-gated + calls (~5M potential users)
- **SOM**: Early adopters seeking verified, high-quality social (~50K beta users)
- **Growth drivers**: Privacy concerns rising, demand for youth-safe platforms, mobile-first generation

---

## Slide 7: Traction & Metrics
- **Platform**: Cloudflare Pages deployed, custom domain `friends-space.pages.dev`
- **Biometrics**: MediaPipe integration, 478-face-landmark tracking
- **Mobile capture**: RG selfie optimization, 900px resize, quality 0.6/0.85
- **Deploy pipeline**: `wrangler pages deploy dist --branch production` fixed
- **Codebase**: TypeScript strict, `npx tsc -b` + `npx vite build`
- **Iterations**: 20+ bug fixes on yaw, overlay, capture, RG analysis

---

## Slide 8: Technology Stack
### Frontend
- **React + TypeScript** - Strict mode, `tsc -b` builds
- **Vite** - Fast HMR, optimized build
- **MediaPipe** - Face landmarker, blink detection, yaw calculation
- **Canvas** - Custom capture, RG analysis, dHash generation

### Backend/Infra
- **Cloudflare Pages** - Hosting, KV storage for enrolls
- **Vercel Proxy** - API endpoint proxy (`functions/api/[[path]].js`)
- **KV Store** - Biometric enrolls, sessions, user flags
- **Google Drive API** - Per-user storage for calls/transmissions

### Mobile Biometrics
- **Face Landmarker** running in VIDEO mode
- **dHash** 18×16 crop facial recognition
- **Liveness** - Blink + yaw directional (ESQUERDA/DIREITA/CENTRO)
- **RG analysis** - Brightness/flare detection, 2.5s timeout fallback

---

## Slide 9: Competitive Landscape
| Feature | Friends Space | WhatsApp | Discord | Snapchat |
|---------|--------------|----------|---------|----------|
| Verified age-gate | ✅ Biometric + RG | ❌ None | ⚠ Server-level | ⚠ Phone number |
| P2P encrypted calls | ✅ Full | ❌ None | ⚠ Voice only | ❌ None |
| 2K60fps streaming | ✅ Yes | ❌ None | ⚠ 720p max | ❌ None |
| Individual Drive storage | ✅ Per user | ❌ None | ⚠ Server storage | ❌ None |
| Community servers | ✅ Create & manage | ❌ Limited | ✅ Yes | ❌ None |
| DM chat | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Mobile-optimized biometrics | ✅ Full flow | ❌ None | ⚠ Basic | ⚠ Basic |

---

## Slide 10: Team
- **Core team**: Developers focused on Cloudflare + MediaPipe integration
- **Technical expertise**: TypeScript, Cloudflare Pages, WebRTC, Computer Vision
- **Advisors**: Youth social platforms, privacy law, mobile UX
- **Roadmap**: 0-3M users beta, premium features Q4, expansion LATAM/US

---

## Slide 11: Ask
**R$ 500K - R$ 1M** (or equivalent US$)
- **Product**: Complete biometric flow, premium features, scaling infra
- **Growth**: User acquisition, community building, partnerships
- **Team**: Hiring mobile CV engineers, UX research
- **Milestones**: 100K beta users, premium launch, revenue positive

### Use of Funds
- 40% Development (mobile CV features, backend scaling)
- 30% Growth (user acquisition, community management)
- 20% Operations (infra, compliance, legal)
- 10% Contingency

---

## Slide 12: Vision
**To become the safest, highest-quality social network for youth worldwide** - where every connection is verified, every call is private, and every user has full control over their data and community.

> "Building the social platform we wished we had at 16: verified, high-quality, and truly ours."

---
*Friends Space - Biometrics in testing, product live for community building*
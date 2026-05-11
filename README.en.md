<p align="center">
  <img src="docs/assets/logo.png" alt="NovelCut" width="120" />
</p>

<h1 align="center">NovelCut</h1>

<p align="center">
  <b>AI Short-Drama Factory · From novel to shootable storyboard, end-to-end</b>
  <br/>
  <i>novel → events → skeleton → episodes → scripts → assets → storyboard → video</i>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#"><img alt="Status" src="https://img.shields.io/badge/status-alpha-orange?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">简体中文</a> · <b>English</b></p>

---

## What is this

NovelCut is an open-source AI short-drama production workbench. Feed it a novel, it produces a shootable short-drama: scripts, character/scene reference sheets, and shot-by-shot storyboard with image generation. All under your control:

- **Local-first**: your novels and creative work never leave your machine
- **BYOK** (Bring Your Own Key): every LLM and image API call goes through your own API keys
- **Model-agnostic**: OpenAI / DeepSeek / Anthropic / SiliconFlow / new-api gateway / Kling / grsai / custom OpenAI-compatible
- **Prompts as Markdown**: all skill templates are editable .md files, no rebuild needed
- **Multi-language**: dialogues auto-written in project language (zh-CN / ru-RU / en-US / etc.)

## Pipeline (7 stages)

```
novel  →  events  →  skeleton  →  episodes  →  scripts  →  assets  →  storyboard  →  video (roadmap)
import    extract    1-liner     N episode    full        4-view     9:16
          per ch     + 3-act     blueprint    drama       refs       shot
                                                          + scene    decomp
```

Every stage is an independent re-runnable "vertical slice" with provenance tracking. Late stages don't lock early stages — add more chapters, regenerate skeleton, re-plan episodes; the system tracks staleness and prompts you to refresh downstream.

## Quick start

```bash
git clone https://github.com/xuankai110/novelcut.git
cd novelcut
echo "registry=https://registry.npmmirror.com/" > .npmrc   # optional, China mirror
pnpm install --ignore-scripts
node scripts/postinstall.mjs    # builds workspace packages + better-sqlite3
pnpm tools-dev run web
# open the URL printed (random localhost port)
```

Then in the UI:
1. **⚙ Settings** → configure LLM (DeepSeek/OpenAI/...) and Image (gpt-image-2/grsai/...) providers
2. **+ New Drama** → genre / language / platform / episode count
3. **📕 Novel** → upload .txt/.docx
4. Follow the Pipeline Stepper to events → skeleton → episodes → scripts → assets → storyboard

## Architecture highlights

- Next.js 16 App Router + Turbopack frontend, runs as a SPA
- Same-origin proxy routes for LLM (`/nc/llm/chat`) and Image (`/nc/image/generate`) — no CORS gymnastics, API keys never reach third parties
- Server-side image cache at `~/.novelcut/cache/<sha256>.png` with `Cache-Control: immutable` — generated images survive provider URL expiry
- Smart retry: standard 5xx/429 + non-standard 400/422 with load-shedding phrases (e.g. "excessive system load", common in Chinese API gateways)
- All project data in browser localStorage; images on server filesystem; nothing in cloud unless you configure it

## Status

Pre-alpha. Stage 1-7 working. Video generation on the roadmap.

## Credits

- [open-design](https://github.com/nexu-io/open-design) (Apache 2.0) — web/daemon scaffolding, Skill protocol
- [Toonflow](https://github.com/HBAI-Ltd/Toonflow-app) (Apache 2.0 + commercial) — referenced visual manual approach and pipeline design, **no code copied**

## License

Apache 2.0

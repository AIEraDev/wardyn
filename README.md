<div align="center">
  <br />
  <img src="src/wardyn.png" alt="Wardyn Logo" width="130" style="border-radius: 20px;" />
  <br />
  <h1>🛡️ Wardyn</h1>
  <p><strong>Local-First Desktop Chief-of-Staff — AI-powered inbox, life planning & research in one private app</strong></p>

  <p>
    <a href="https://github.com/AIEraDev/wardyn/releases"><img src="https://img.shields.io/github/v/release/AIEraDev/wardyn?label=latest&color=4A8FC2" alt="Latest Release" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/Tauri-v2.0-blue?logo=tauri" alt="Tauri v2" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/React-19.0-61dafb?logo=react" alt="React 19" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/Rust-1.75+-orange?logo=rust" alt="Rust" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/Ollama-local_AI-green" alt="Ollama" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/i18n-6_languages-purple" alt="i18n" /></a>
  </p>
  <br />
</div>

Wardyn is a private desktop application that acts as your personal chief-of-staff. It triages your Gmail inbox, drafts replies in your voice, tracks life goals and habits, runs free web research, and generates daily intelligence briefs — all locally on your machine. No cloud subscriptions, no data leaving your device.

---

## Table of Contents

1. [What Wardyn Does](#what-wardyn-does)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
   - [Google OAuth (Gmail)](#google-oauth-gmail)
   - [LinkedIn OAuth](#linkedin-oauth)
   - [Ollama Local AI](#ollama-local-ai)
5. [Running the App](#running-the-app)
6. [Feature Guide](#feature-guide)
7. [Building from Source](#building-from-source)
8. [Auto-Updates](#auto-updates)
9. [Supported Languages](#supported-languages)
10. [Architecture](#architecture)
11. [Privacy & Safety](#privacy--safety)

---

## What Wardyn Does

| Module           | What it does                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| **Today Brief**  | AI-generated morning summary of your inbox, deadlines, and knowledge captures                   |
| **Messages**     | Triages Gmail threads, drafts replies in your writing voice, queues them for one-click approval |
| **Content**      | Drafts LinkedIn and Twitter/X posts from your daily activity                                    |
| **Research**     | Free web search via DuckDuckGo + Wikipedia with local AI synthesis                              |
| **Analytics**    | Tracks response times and engagement patterns                                                   |
| **Productivity** | Tasks, reminders, Pomodoro sessions                                                             |
| **Deadlines**    | Syncs deadline emails to Google Calendar automatically                                          |
| **Memory**       | Captures URLs, notes, and decisions into a searchable knowledge vault                           |
| **Active Life**  | Daily habits, project time tracking, AI-generated day plans                                     |
| **Channels**     | Multi-channel integration hub                                                                   |
| **Settings**     | OAuth connections, AI models, auto-start, vault sync, language                                  |

---

## Prerequisites

Install these before setting up Wardyn.

### 1. Node.js (v18 or later)

Download from [nodejs.org](https://nodejs.org/) or install via a version manager:

```bash
# macOS — via Homebrew
brew install node

# Check version
node --version  # should be 18+
```

### 2. Rust (1.75 or later)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustc --version  # should be 1.75+
```

### 3. Tauri System Dependencies

**macOS** — no extra steps needed.

**Ubuntu / Debian:**

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

**Windows** — install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

### 4. Ollama (required for AI features)

Download from [ollama.com](https://ollama.com/) and install it. Then start the service:

```bash
ollama serve
```

Install at least one language model (the app will prompt you in Settings if none are installed):

```bash
ollama pull phi3        # 2.2 GB — lightweight, good for low RAM
ollama pull qwen2.5     # 4.7 GB — recommended, best quality
ollama pull llama3      # 4.7 GB — alternative
```

---

## Installation

### Option A — Download a Release (easiest)

1. Go to [github.com/AIEraDev/wardyn/releases](https://github.com/AIEraDev/wardyn/releases)
2. Download the latest release for your platform:
   - **macOS**: `Wardyn_x.x.x_universal.dmg`
   - **Windows**: `Wardyn_x.x.x_x64-setup.exe`
   - **Linux**: `wardyn_x.x.x_amd64.AppImage`
3. Open the installer and follow the prompts
4. Launch Wardyn from your Applications folder or Start Menu

> **macOS note:** If you see "unidentified developer" on first launch, right-click the app → Open → Open anyway.

### Option B — Build from Source

See [Building from Source](#building-from-source).

---

## Configuration

Wardyn needs OAuth credentials to connect to Gmail and LinkedIn. These stay on your machine only.

### Google OAuth (Gmail)

Gmail integration requires a Google Cloud OAuth 2.0 client.

**Step 1 — Create a Google Cloud project**

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click **Select a project → New Project**, give it a name (e.g. "Wardyn")
3. Click **Create**

**Step 2 — Enable the Gmail API**

1. In the left menu go to **APIs & Services → Library**
2. Search for **Gmail API** and click **Enable**
3. Also enable **Google Calendar API** if you want deadline sync

**Step 3 — Create OAuth credentials**

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. If prompted to configure the consent screen: choose **External**, fill in the app name ("Wardyn"), add your email as a test user, save
3. Application type: **Desktop app**
4. Name it anything (e.g. "Wardyn Desktop")
5. Click **Create** — you'll get a **Client ID** and **Client Secret**

**Step 4 — Add to your `.env` file**

```env
GOOGLE_CLIENT_ID="your_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_client_secret"
```

**Step 5 — Connect in the app**

1. Open Wardyn → **Settings → Gmail Multi-Account Integration**
2. Click **Connect Gmail Account**
3. A browser window opens — sign in and approve access
4. Your inbox will begin syncing automatically

---

### LinkedIn OAuth

LinkedIn integration enables timeline ingestion and direct post publishing.

**Step 1 — Create a LinkedIn app**

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
2. Click **Create app**
3. Fill in: App name ("Wardyn"), LinkedIn Page (your personal page or company), upload any logo
4. Click **Create app**

**Step 2 — Add products**

In your app's **Products** tab, request access to:

- **Sign In with LinkedIn using OpenID Connect** (for authentication)
- **Share on LinkedIn** (for post publishing)

Both are approved instantly.

**Step 3 — Configure the redirect URI**

1. Go to the **Auth** tab
2. Under **OAuth 2.0 settings → Authorized redirect URLs**, add:
   ```
   http://localhost:14220/callback
   ```
3. Save changes

**Step 4 — Copy your credentials**

From the **Auth** tab, copy your **Client ID** and **Client Secret**.

**Step 5 — Add to your `.env` file**

```env
LINKEDIN_CLIENT_ID="your_linkedin_client_id"
LINKEDIN_CLIENT_SECRET="your_linkedin_client_secret"
```

**Step 6 — Connect in the app**

1. Open Wardyn → **Settings → Channels → LinkedIn**
2. Click **Connect** — a browser window opens
3. Approve access — your LinkedIn feed will begin loading

---

### Ollama Local AI

All AI features (brief generation, draft writing, research summaries, habit intel) run through Ollama locally.

**Start Ollama:**

```bash
ollama serve
```

Wardyn auto-detects Ollama on startup. If no model is installed, a banner will appear guiding you to Settings → AI Models Catalog where you can install one with a single click.

**Recommended models by use case:**

| Model     | Size   | Best for                         |
| --------- | ------ | -------------------------------- |
| `phi3`    | 2.2 GB | Low-RAM machines, fast responses |
| `qwen2.5` | 4.7 GB | Best quality, multilingual       |
| `llama3`  | 4.7 GB | General purpose, strong drafting |
| `mistral` | 4.1 GB | Fast triage, concise replies     |

You can install models directly inside Wardyn: **Settings → High-Performance Local AI Models Catalog → Install Model**.

---

## Running the App

### First launch checklist

1. **Start Ollama** — `ollama serve` (or enable it to start automatically)
2. **Launch Wardyn** — from your Applications folder or via `npm run tauri dev` if building from source
3. **Connect Gmail** — Settings → Gmail → Connect Gmail Account
4. **Connect LinkedIn** — Settings → Channels → LinkedIn → Connect
5. **Install an AI model** — Settings → AI Models Catalog → Install Model (if the banner appears)
6. **Set your language** — Settings → Language (optional, defaults to English)

After first setup, Wardyn auto-starts on login and begins triaging in the background. You will receive a native desktop notification when items are ready for your review.

---

## Feature Guide

### Today Brief

The home screen. Shows your AI-generated morning brief including:

- Urgent inbox items requiring attention
- Upcoming deadlines
- Your daily habit completion status
- A motivational quote and learning topic
- Social content suggestions

Click the speaker icon to have the brief read aloud via macOS text-to-speech.

### Messages (Gmail Triage)

Wardyn reads your inbox, classifies each thread by urgency, and drafts a reply in your voice. You review each card and choose:

- **Approve** — sends immediately
- **Edit** — modify the draft before sending
- **Skip** — dismisses without sending

Nothing is ever sent automatically.

### Research

Free web search with no API key required. Type any query and Wardyn:

1. Searches DuckDuckGo (aggregates Google, Bing, news sites)
2. Falls back to Wikipedia for factual queries
3. Shows up to 8 results with titles, snippets, and source links
4. Optionally generates an AI summary of all results via Ollama

Save any result or summary to your Memory vault with one click.

### Tell Wardyn (Life Capture)

Click the floating brain button (bottom-right corner) to type anything about your life plans:

- "I have a product demo next Friday and need to prepare slides"
- "Planning a trip to London — flights, accommodation, agenda"
- "I want to exercise 3 times a week starting Monday"

Wardyn parses the input with Ollama and creates a structured plan with tasks, dates, and reminders.

### Active Life

Track daily habits, log time on projects, and generate an AI-crafted day plan. Also includes a social content brief with daily post ideas tailored to your activity.

### Memory

Capture URLs, notes, decisions, and insights. Ollama auto-tags and summarises each item in the background (~10 seconds). Items feed into your next morning brief.

### Settings

Key settings to configure after first launch:

- **Language** — switch interface language
- **AI Models** — install/uninstall Ollama models
- **Gmail** — connect multiple accounts
- **Sync Frequency** — how often Wardyn checks your inbox (2–30 min)
- **Auto-Start** — launch Wardyn silently on login
- **Notifications** — enable/disable desktop alerts
- **Vault Sync** — mirror captures to an Obsidian or Logseq markdown folder
- **Software Updates** — check for and install new versions

---

## Building from Source

```bash
# Clone the repository
git clone https://github.com/AIEraDev/wardyn.git
cd wardyn

# Install Node.js dependencies
npm install

# Copy and fill in your OAuth credentials
cp .env.example .env
# Edit .env with your GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
# LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET

# Run in development mode (hot reload)
npm run tauri dev

# Build a production binary
npm run tauri build
# Output: src-tauri/target/release/wardyn-desktop (or .app on macOS)
```

### For contributors — GitHub Actions release

Production builds are signed and published automatically when a version tag is pushed. OAuth secrets must be added to **GitHub repo → Settings → Secrets and variables → Actions**:

| Secret name                          | Where to get it                        |
| ------------------------------------ | -------------------------------------- |
| `GOOGLE_CLIENT_ID`                   | Google Cloud Console → Credentials     |
| `GOOGLE_CLIENT_SECRET`               | Google Cloud Console → Credentials     |
| `LINKEDIN_CLIENT_ID`                 | LinkedIn Developers → Your App → Auth  |
| `LINKEDIN_CLIENT_SECRET`             | LinkedIn Developers → Your App → Auth  |
| `TAURI_SIGNING_PRIVATE_KEY`          | Generated with `tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password chosen during key generation  |

---

## Auto-Updates

Wardyn checks for updates on demand. Go to **Settings → Software Auto-Updates → Check for Updates**. If a new version is available it downloads and installs automatically — restart the app to apply.

Updates are signed and verified via the Tauri updater. Only official releases from this repository are accepted.

---

## Supported Languages

Switch anytime in **Settings → Language**.

| Code | Language    |
| ---- | ----------- |
| `en` | 🇬🇧 English  |
| `fr` | 🇫🇷 Français |
| `es` | 🇪🇸 Español  |
| `de` | 🇩🇪 Deutsch  |
| `zh` | 🇨🇳 中文     |
| `ja` | 🇯🇵 日本語   |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TAURI WEBVIEW                        │
│  React 19 + TypeScript  ·  Zustand state  ·  Tailwind CSS  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri IPC (invoke / events)
┌──────────────────────────▼──────────────────────────────────┐
│                       RUST BACKEND                          │
│  SQLite (rusqlite)  ·  Gmail/LinkedIn OAuth  ·  TTS (say)  │
│  Ollama HTTP client  ·  RSS feeds  ·  Vault sync           │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
   ┌──────────▼──────────┐   ┌─────────▼──────────┐
   │  Ollama (local AI)  │   │  Gmail / LinkedIn  │
   │  localhost:11434    │   │  APIs over OAuth   │
   └─────────────────────┘   └────────────────────┘
```

| Layer         | Technology                                              |
| ------------- | ------------------------------------------------------- |
| Desktop shell | Tauri v2 + Rust                                         |
| Frontend      | React 19 + TypeScript 5.8                               |
| Styling       | Tailwind CSS v4 + Tabler Icons                          |
| State         | Zustand 5                                               |
| Database      | SQLite via rusqlite (local, encrypted at rest)          |
| Auth          | OAuth 2.0 PKCE — loopback listener on `127.0.0.1:14220` |
| AI            | Ollama local HTTP API — no external AI calls            |

---

## Privacy & Safety

- **Zero automatic sending.** Every outbound message requires an explicit click. Wardyn never sends on your behalf without approval.
- **Local AI only.** Ollama runs entirely on your machine. Your emails, notes, and decisions never leave your device to reach any AI API.
- **Local database.** All data is stored in a single SQLite file on your machine (`~/Library/Application Support/com.wardyn.desktop/wardyn.db` on macOS).
- **OAuth only.** Gmail and LinkedIn are connected via standard OAuth 2.0 — Wardyn never stores your passwords.
- **Open source.** The full codebase is auditable on GitHub.

---

## License

MIT — see `LICENSE` for details.

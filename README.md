<div align="center">
  <br />
  <img src="src/wardyn.png" alt="Wardyn Logo" width="130" style="border-radius: 20px;" />
  <br />
  <h1>🛡️ Wardyn</h1>
  <p><strong>Local-First Desktop Chief-of-Staff & Executive Multi-Channel Sentinel</strong></p>
  
  <p>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/Tauri-v2.0-blue?logo=tauri" alt="Tauri v2" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/React-19.0-61dafb?logo=react" alt="React 19" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript" alt="TypeScript 5.8" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/Tailwind-v4.0-06b6d4?logo=tailwindcss" alt="Tailwind v4" /></a>
    <a href="https://github.com/AIEraDev/wardyn"><img src="https://img.shields.io/badge/SQLite-v3-003b57?logo=sqlite" alt="SQLite" /></a>
  </p>
  <br />
</div>

---

## 🎯 Overview

**Wardyn** sits quietly in the background on your desktop, monitors your executive channels (**Gmail, Slack, Discord, Telegram, iMessage, LinkedIn, Twitter/X, WhatsApp, Teams**), triages what matters, auto-creates calendar deadlines, and drafts responses in your exact voice.

It reduces your daily involvement to three simple choices: **Approve**, **Edit**, or **Skip**. **Nothing ever sends without explicit human approval.**

```
                                  ┌────────────────────────┐
                                  │ Multi-Channel Ingestion│
                                  │ (Gmail, Slack, Telegram│
                                  │  iMessage, LinkedIn, X)│
                                  └───────────┬────────────┘
                                              │
                                              ▼
┌────────────────────────┐        ┌────────────────────────┐
│  Ollama Local Model    │ ◄────► │  Wardyn Local Engine   │
│  (Private Voice Corpus)│        │   (SQLite Persistence) │
└────────────────────────┘        └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │ Human Approval Queue   │
                                  │  [Approve] [Edit] [Skip]
                                  └────────────────────────┘
```

---

## ✨ Key Features

- 🌐 **OpenClaw-Style Multi-Channel Directory**: Native integration hub supporting Gmail, Google Calendar, Slack, Discord, Telegram, iMessage, LinkedIn, Twitter/X, WhatsApp, and Microsoft Teams.
- 🔐 **Local-First & Private**: Local SQLite storage (`wardyn.db`). Your messages, drafts, and credentials stay securely on your device.
- 🤖 **Voice-Matched AI Drafting**: Powered by local LLMs (Ollama `qwen2.5` / `llama3`) trained on your specific voice corpus (*concise, direct, warm, professional*).
- 🛡️ **Confidence Guardrails**: Items with model confidence `< 60%` surface as *"Uncertain — manual review required"* without guessing hallucinated drafts.
- ⚠️ **Visa & High-Risk Safeguards**: Automatic keyword detection (UKVI, Home Office, Visa deadlines) with warning badges and mandatory multi-step approval confirmation modals before sending.
- 📅 **Additive Calendar Sync**: Auto-creates Google Calendar events for deadline emails without requiring send approval (reversible and additive).
- 🔔 **Native System Notifications & Actions**: Real-time notifications alert you on message arrivals, approvals, edits, skips, and urgent alerts. Clicking a notification brings Wardyn to focus.
- ⚡ **Laptop Startup Diligence**: Runs automatically on system boot (`tauri-plugin-autostart`) to triage your inbox before you open your laptop.
- 🎨 **Sentinel Blue Design System**: Custom borderless dark mode UI (`#0B0E13` Ink, `#151A21` Surface, `#4A8FC2` Sentinel Blue) with seamless macOS Overlay Titlebar.

---

## 🔌 Multi-Channel Directory Support

| Channel | Category | Status | Capability |
| :--- | :--- | :---: | :--- |
| ✉️ **Gmail** | Email | Active | PKCE OAuth 2.0 inbox triage, thread monitoring & voice drafting |
| 📅 **Google Calendar** | Email | Active | Auto-sync deadline events & appointment requests |
| 💼 **LinkedIn** | Social | Active | Executive network outreach & build-in-public post briefs |
| 𝕏 **Twitter / X** | Social | Active | High-signal DMs, social mentions & viral thread drafting |
| 💬 **Slack** | Work | Configurable | Channels, DMs, workspace mentions & thread triaging |
| 🤖 **Discord** | Work | Configurable | Server channels, direct messages & bot command triggers |
| ✈️ **Telegram** | Messaging | Configurable | Bot API integration for priority direct messaging |
| 🍎 **iMessage** | Messaging | Configurable | Native macOS messaging bridge for priority contact triaging |
| 🟢 **WhatsApp** | Messaging | Configurable | Priority direct messages & scheduled status updates |
| 🟦 **Microsoft Teams** | Work | Configurable | Enterprise conversations & Bot Framework bridge |

---

## 🏗️ Architecture Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Desktop Shell** | Tauri v2 + Rust | Secure native windowing, OS autostart, system notifications, and background IPC commands |
| **Frontend UI** | React 19 + TypeScript 5.8 | Reactive daily brief interface, multi-channel directory, and keyboard accessibility |
| **Styling** | Tailwind CSS v4 + Tabler Icons | Custom Sentinel Blue color palette & typography (Inter & JetBrains Mono) |
| **State Engine** | Zustand 5 | Single source-of-truth state management mirroring local SQLite tables |
| **Database** | SQLite (`rusqlite`) | Single source-of-truth for queue items, credentials, and calendar event hashes |
| **Auth & Connectors** | OAuth 2.0 PKCE + Gmail API | Native loopback listener (`127.0.0.1:14220`) for secure Gmail Read & Send APIs |
| **Local Intelligence** | Ollama HTTP API | Local LLM text classification, confidence scoring, and voice-matched response generation |

---

## 🚀 Quick Start & Installation

### Prerequisites

Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (1.75+)
- [Ollama](https://ollama.ai/) (optional, for local LLM drafting)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/AIEraDev/wardyn.git
cd wardyn

# Install Node.js dependencies
npm install
```

### 2. Configure Credentials

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your Google Cloud OAuth 2.0 credentials:

```env
GOOGLE_CLIENT_ID="your_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_client_secret"
```

### 3. Run in Development Mode

```bash
npm run tauri dev
```

### 4. Build Production Executable

```bash
npm run tauri build
```
The compiled native executable will be saved in `src-tauri/target/release/`.

---

## 🔒 Safety & Privacy Principles

1. **Zero Unattended Sends**: Wardyn will **NEVER** send a message automatically under any circumstance. Sending requires an explicit human click on **Approve** or **Save & Approve**.
2. **Local AI Execution**: Ollama runs entirely on your local machine (`http://localhost:11434`). Your emails and voice corpus are never uploaded to third-party AI APIs.
3. **Additive Calendar Creation**: Calendar event creation is additive and reversible, automatically syncing deadlines while keeping sending locked behind manual review.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.

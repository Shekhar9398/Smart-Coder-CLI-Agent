# SmartCoder CLI

A lightweight developer AI agent that generates project summaries and daily reports from your codebase.

---

## 🚀 Installation

### 1. Install Node.js

Make sure Node.js is installed:

```bash
node -v
```

---

### 2. Install CLI globally

```bash
npm install -g smartcoder-cli
```

---

## 🔑 Setup (Optional - For AI Summary)

```bash
smartcoder set-key YOUR_CLAUDE_API_KEY
```

If no key is provided, SmartCoder will use a basic local summary.

---

## 📦 Commands

### Project Summary

```bash
smartcoder summary
```

Outputs:

* Project type
* Tech stack
* Structure summary

---

### Daily Report

```bash
smartcoder dayreport
```

Outputs:

* Today's commits
* File changes
* Work summary

---

## ⚠️ Requirements

* Must be inside a project folder
* For `dayreport`, project must be a git repository

```bash
git init
```

---

## 🧠 Features

* Works with:

  * React / React Native
  * Flutter
  * iOS (Swift / UIKit / SwiftUI)
  * Android (Kotlin / Java)
* AI-powered summaries (Claude)
* Fallback mode without API key

---

## 🔮 Upcoming

* AI-powered day reports
* Multi-model support
* Plugin system

---

## 👨‍💻 Author

SmartCoder CLI

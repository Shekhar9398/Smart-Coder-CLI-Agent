-->>-- SmartCoder CLI --<<--

A lightweight AI agent for project summaries and daily developer reports.

-- Installation --

Install the package via GitHub URL:

```bash
npm install -g git+https://github.com/Shekhar9398/Smart-Coder-CLI-Agent.git
```

-- Setup --

Set your Claude API key for AI-powered insights:

```bash
smartcoder set-key YOUR_API_KEY
```

-- Available Commands --

* dayreport: Generate an AI-powered summary of today's git activity
* summary: Get a detailed technical overview of your project
* developer [subcommand]: Start interactive developer mode (use 'mode' to enter interactive session)

-- Requirements --

* Node.js >= 18
* Run inside a git repository for dayreport

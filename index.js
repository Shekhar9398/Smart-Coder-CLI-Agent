#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import readline from "readline";
import Anthropic from "@anthropic-ai/sdk";
import { Command } from "commander";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from "chalk";
import ora from "ora";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getPrompt = (promptName, defaultPrompt = "") => {
    try {
        const promptPath = path.join(__dirname, "prompts", `${promptName}.md`);
        if (fs.existsSync(promptPath)) {
            return fs.readFileSync(promptPath, "utf-8");
        }
    } catch {}
    return defaultPrompt;
};

const checkClaudeAuth = () => {
    const claudeJsonPath = path.join(os.homedir(), ".claude.json");
    return fs.existsSync(claudeJsonPath);
};

const handleClaudeDelegate = (err, instructions, rawData) => {
    if (err.message === "CLAUDE_DELEGATE") {
        console.log("\n" + chalk.cyan.bold("-->>-- Delegating to Claude Code --<<--\n"));
        console.log("CLAUDE: The user has requested this operation. I am delegating the execution to you since I lack a separate API key. Please read the following instructions and context, and complete the user's request flawlessly.");
        console.log("\n=== INSTRUCTIONS/PROMPT ===");
        console.log(instructions);
        if (rawData) {
            console.log("\n=== CONTEXT ===");
            console.log(rawData);
        }
        return true;
    }
    return false;
};

/**
 * CORE LOGIC
 */

let isMCPMode = false;

const getConfig = () => {
    const configPath = path.join(os.homedir(), ".smartcoder", "config.json");
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
    return {};
};

const saveConfig = (config) => {
    const configDir = path.join(os.homedir(), ".smartcoder");
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
    );
};

/**
 * TECH STACK DETECTION
 */
const detectTechStack = (cwd) => {
    const contextCachePath = path.join(cwd, ".smartcoder-context.json");
    if (fs.existsSync(contextCachePath)) {
        try {
            const cached = JSON.parse(fs.readFileSync(contextCachePath, "utf-8"));
            if (cached && cached.stack) return cached;
        } catch {}
    }

    const files = fs.readdirSync(cwd).map(f => f.toLowerCase());
    const allFiles = execSync(`find "${cwd}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" 2>/dev/null | head -200`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
    })
        .split("\n")
        .map((f) => path.basename(f).toLowerCase())
        .filter(Boolean);

    const hasSwift = allFiles.some((f) => f.endsWith(".swift"));
    const hasKotlin = allFiles.some((f) => f.endsWith(".kt"));
    const hasPython = allFiles.some((f) => f.endsWith(".py"));
    const hasGo = allFiles.some((f) => f.endsWith(".go"));
    const hasTs = allFiles.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    const hasRuby = allFiles.some((f) => f.endsWith(".rb"));
    const hasPhp = allFiles.some((f) => f.endsWith(".php"));
    const hasCsharp = allFiles.some((f) => f.endsWith(".cs"));
    const hasRust = allFiles.some((f) => f.endsWith(".rs"));
    const hasJava = allFiles.some((f) => f.endsWith(".java"));
    
    const hasPubspec = files.includes("pubspec.yaml");
    const hasPodfile = files.includes("podfile");
    const hasGradle = files.includes("build.gradle") || files.includes("build.gradle.kts");
    const hasPackageJson = files.includes("package.json");
    const hasRequirements = files.includes("requirements.txt") || files.includes("pyproject.toml");

    let packageJsonDeps = [];
    if (hasPackageJson) {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
            packageJsonDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).map((d) => d.toLowerCase());
        } catch {}
    }

    let result = null;

    if (hasSwift) {
        result = { stack: "swift", displayName: "iOS Developer", persona: "You are a senior iOS developer with deep UIKit/SwiftUI expertise. Think in terms of Apple HIG, Swift concurrency, Xcode workflows, and best practices for iOS development." };
    } else if (hasKotlin || hasGradle || hasJava) {
        result = { stack: "kotlin/java", displayName: "Android/Java Developer", persona: "You are a senior Android/Java developer. Think in Material Design, lifecycle management, JVM performance, and Spring Boot/Android conventions." };
    } else if (packageJsonDeps.includes("react-native") || packageJsonDeps.includes("expo")) {
        result = { stack: "react-native", displayName: "React Native Developer", persona: "You are a cross-platform mobile developer with React Native, Expo, and native module expertise." };
    } else if (hasPubspec) {
        result = { stack: "flutter", displayName: "Flutter Developer", persona: "You are a senior Flutter developer with Dart, Widget trees, and declarative UI expertise." };
    } else if (packageJsonDeps.includes("next")) {
        result = { stack: "nextjs", displayName: "Next.js Developer", persona: "You are a senior Next.js developer with expertise in SSR, API routes, middleware, and modern React patterns." };
    } else if (packageJsonDeps.includes("react")) {
        result = { stack: "react", displayName: "React Developer", persona: "You are a senior React developer with expertise in hooks, state management, component patterns, and modern frontend architecture." };
    } else if (packageJsonDeps.includes("vue") || packageJsonDeps.includes("nuxt")) {
        result = { stack: "vue", displayName: "Vue Developer", persona: "You are a senior Vue.js developer. Think in terms of Composition API, reactivity, and Vue ecosystem best practices." };
    } else if (packageJsonDeps.includes("express") || packageJsonDeps.includes("fastify") || packageJsonDeps.includes("nestjs")) {
        result = { stack: "nodejs-backend", displayName: "Node.js Backend Developer", persona: "You are a senior backend Node.js developer with expertise in REST APIs, DB design, middleware, and scalable architecture." };
    } else if (hasTs) {
        result = { stack: "typescript", displayName: "TypeScript Developer", persona: "You are a senior TypeScript developer. Think in strict types, interfaces, generics, and robust system design." };
    } else if (hasPackageJson) {
        result = { stack: "nodejs", displayName: "JavaScript Developer", persona: "You are a senior JavaScript developer with expertise in Node.js, npm ecosystem, and modern practices." };
    } else if (hasPython || hasRequirements) {
        result = { stack: "python", displayName: "Python Developer", persona: "You are a senior Python developer with expertise in Django, FastAPI, Flask, or data science. Think in Python idioms and best practices." };
    } else if (hasGo) {
        result = { stack: "go", displayName: "Go Developer", persona: "You are a senior Go developer with expertise in concurrency, interfaces, and systems programming." };
    } else if (hasRuby) {
        result = { stack: "ruby", displayName: "Ruby/Rails Developer", persona: "You are a senior Ruby on Rails developer. Think in terms of MVC, ActiveRecord, and Ruby conventions." };
    } else if (hasPhp) {
        result = { stack: "php", displayName: "PHP/Laravel Developer", persona: "You are a senior PHP developer with Laravel/Symfony expertise. Think in modern PHP 8+ features and OOP design." };
    } else if (hasCsharp) {
        result = { stack: "csharp", displayName: ".NET Developer", persona: "You are a senior C# .NET developer. Think in terms of LINQ, async/await, Entity Framework, and cloud-native ASP.NET Core." };
    } else if (hasRust) {
        result = { stack: "rust", displayName: "Rust Developer", persona: "You are a senior Rust developer. Think in terms of the borrow checker, zero-cost abstractions, lifetimes, and safe concurrency." };
    } else if (hasPodfile) {
        result = { stack: "ios", displayName: "iOS Developer", persona: "You are a senior iOS developer with deep UIKit/SwiftUI expertise. Think in terms of Apple HIG and iOS best practices." };
    } else {
        result = { stack: "generic", displayName: "Software Developer", persona: "You are a senior software developer with broad technical expertise. Ask clarifying questions, spot mistakes, suggest strong approaches." };
    }

    try {
        fs.writeFileSync(contextCachePath, JSON.stringify(result, null, 2));
    } catch {}

    return result;
};

/**
 * CONTEXT INJECTION HELPER
 */
const getProjectContext = (cwd) => {
    const stack = detectTechStack(cwd);
    let gitStatus = "";
    let recentFiles = "";
    let fileTree = "";

    try {
        gitStatus = execSync("git status --short", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
            cwd,
        }).trim();
    } catch {
        gitStatus = "No git repo";
    }

    try {
        recentFiles = execSync("git diff HEAD~3 HEAD --name-only", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
            cwd,
        })
            .trim()
            .split("\n")
            .filter(Boolean)
            .join(", ");
    } catch {
        recentFiles = "N/A";
    }

    const getTree = (dir, depth = 0, maxDepth = 1) => {
        if (depth > maxDepth) return [];
        try {
            return fs
                .readdirSync(dir)
                .filter(f => !["node_modules", ".git", "dist", "build", ".claude", ".thinkhead"].includes(f))
                .map(f => `${"  ".repeat(depth)}* ${f}`)
                .flat();
        } catch {
            return [];
        }
    };

    fileTree = getTree(cwd).join("\n");

    return { ...stack, gitStatus, recentFiles, fileTree };
};

/**
 * CLAUDE API HELPER
 */
const callClaude = async (systemPrompt, messages, stream = false) => {
    if (isMCPMode) {
        if (stream) {
            process.stdout.write("[Using Claude Code context]\n");
            return "[Using Claude Code context]";
        }
        return "[Claude Code analysis]";
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || getConfig().apiKey;
    if (!apiKey) {
        if (checkClaudeAuth()) {
            throw new Error("CLAUDE_DELEGATE");
        } else {
            throw new Error(
                "ANTHROPIC_API_KEY not set. Run 'smartcoder set-key YOUR_API_KEY' or set the environment variable. If you have Claude Premium, please log in with 'claude login'."
            );
        }
    }

    const client = new Anthropic({ apiKey });

    try {
        if (stream) {
            const stream = await client.messages.stream({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 2048,
                system: systemPrompt,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            });

            let fullResponse = "";
            for await (const chunk of stream) {
                if (
                    chunk.type === "content_block_delta" &&
                    chunk.delta.type === "text_delta"
                ) {
                    const text = chunk.delta.text;
                    process.stdout.write(text);
                    fullResponse += text;
                }
            }
            process.stdout.write("\n");
            return fullResponse;
        } else {
            const response = await client.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 2048,
                system: systemPrompt,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            });

            return response.content[0].type === "text" ? response.content[0].text : "";
        }
    } catch (err) {
        if (err.status === 401 && checkClaudeAuth()) {
            throw new Error("CLAUDE_DELEGATE");
        }
        throw err;
    }
};

const getProjectSummaryData = () => {
    const cwd = process.cwd();
    const stack = detectTechStack(cwd);

    const getTree = (dir, depth = 0, maxDepth = 2) => {
        if (depth > maxDepth) return [];
        try {
            return fs
                .readdirSync(dir)
                .filter(f => !["node_modules", ".git", "dist", "build"].includes(f))
                .map(f => `${"  ".repeat(depth)}* ${f}`)
                .flat();
        } catch {
            return [];
        }
    };

    const fileTree = getTree(cwd).join("\n");
    let recentCommits = "";
    try {
        recentCommits = execSync("git log --oneline -10", { encoding: "utf-8" }).trim();
    } catch {
        recentCommits = "No git history.";
    }

    return { ...stack, fileTree, recentCommits };
};

/**
 * MCP SERVER IMPLEMENTATION
 */

const server = new Server(
    {
        name: "smartcoder-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_day_report",
                description: "Generates an AI-analyzed summary of today's git commits and code changes with structured insights.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_project_summary",
                description: "Analyzes the project structure, tech stack, and file tree for a deep summary.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_developer_context",
                description: "Returns detected tech stack and developer persona for this project.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_code_review",
                description: "Performs a professional code review of current git changes.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "ask_question",
                description: "Ask a question about the project with full context injection.",
                inputSchema: {
                    type: "object",
                    properties: {
                        question: { type: "string" },
                    },
                    required: ["question"],
                },
            },
            {
                name: "get_suggestions",
                description: "Get concrete improvement suggestions for the project.",
                inputSchema: { type: "object", properties: {} },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments || {};

    try {
        if (name === "get_day_report") {
            const cwd = process.cwd();
            let commits = "";
            let fullMessages = "";
            let stats = "";
            let files = "";

            try {
                commits = execSync(
                    'git log --since="00:00:00" --oneline',
                    { encoding: "utf-8", cwd }
                ).trim();
                fullMessages = execSync(
                    'git log --since="00:00:00" --pretty=format:"%s%n%b"',
                    { encoding: "utf-8", cwd }
                ).trim();
                stats = execSync("git diff HEAD~5 HEAD --stat", {
                    encoding: "utf-8",
                    cwd,
                }).trim();
                files = execSync("git diff HEAD~5 HEAD --name-only", {
                    encoding: "utf-8",
                    cwd,
                }).trim();
            } catch {
                try {
                    stats = execSync("git diff --stat", { encoding: "utf-8", cwd }).trim();
                    files = execSync("git diff --name-only", {
                        encoding: "utf-8",
                        cwd,
                    }).trim();
                } catch {}
            }

            const rawData = `Git Commits:\n${commits || "No commits today"}\n\nFull Messages:\n${fullMessages || "N/A"}\n\nFile Changes:\n${stats || "No changes"}\n\nFiles Modified:\n${files || "N/A"}`;

            let analysis = "";
            try {
                const promptTemplate = getPrompt("Dayreport", "You are a senior engineering lead reviewing a developer's daily work log. Produce a PROFESSIONAL, STRUCTURED report.");
                analysis = await callClaude(promptTemplate, [{ role: "user", content: rawData }]);
            } catch (apiError) {
                analysis = "API Error (using raw display):\n" + rawData;
            }

            return {
                content: [{ type: "text", text: analysis }],
            };
        }

        if (name === "get_project_summary") {
            const data = getProjectSummaryData();
            const rawData = `File Tree:\n${data.fileTree}\n\nTech Stack: ${data.stack} (${data.displayName})\n\nRecent commits:\n${data.recentCommits}`;
            let report = "";
            try {
                const promptTemplate = getPrompt("Summary", "You are a senior developer analyzing the project structure. Produce a detailed summary.");
                report = await callClaude(promptTemplate, [{ role: "user", content: rawData }]);
            } catch (e) {
                report = `${chalk.cyan.bold("-->>-- Project Summary --<<--\n")}
${chalk.green("-- Tech Stack --")}
${chalk.yellow(`* Stack: ${data.stack} (${data.displayName})\n`)}
${chalk.green("-- File Tree --")}
${data.fileTree}

${chalk.green("-- Recent History --")}
${data.recentCommits}`;
            }
            return {
                content: [{ type: "text", text: report }],
            };
        }

        if (name === "get_developer_context") {
            const cwd = process.cwd();
            const stack = detectTechStack(cwd);
            const context = `${chalk.cyan.bold("-->>-- Developer Context --<<--\n")}
${chalk.green("-- Tech Stack --")}
${chalk.yellow(`* ${stack.stack}\n`)}
${chalk.green("-- Role --")}
${chalk.yellow(`* ${stack.displayName}\n`)}
${chalk.green("-- Persona --")}
${chalk.yellow(`* ${stack.persona}`)}`;
            return {
                content: [{ type: "text", text: context }],
            };
        }

        if (name === "get_code_review") {
            const cwd = process.cwd();
            let diff = "";
            try {
                diff = execSync("git diff HEAD", { encoding: "utf-8", cwd }).trim();
                if (!diff) {
                    diff = execSync("git diff --cached", { encoding: "utf-8", cwd }).trim();
                }
                if (!diff) {
                    diff = execSync("git diff HEAD~1 HEAD", { encoding: "utf-8", cwd }).trim();
                }
            } catch {
                return {
                    content: [{ type: "text", text: "No git changes to review." }],
                };
            }

            let review = "";
            try {
                const promptTemplate = getPrompt("Review", "You are a senior code reviewer with 15+ years of experience. Review the following git diff and produce a PROFESSIONAL review.");
                review = await callClaude(promptTemplate, [{ role: "user", content: diff }]);
            } catch (apiError) {
                review = "API Error: could not review diff.";
            }

            return {
                content: [{ type: "text", text: review }],
            };
        }

        if (name === "ask_question") {
            const { question } = args;
            const cwd = process.cwd();
            const context = getProjectContext(cwd);

            let answer = "";
            try {
                const basePrompt = `You are a ${context.displayName} pair programmer embedded in this project.
PROJECT CONTEXT:
- Tech Stack: ${context.stack}
- Recent files changed: ${context.recentFiles}
- Git status: ${context.gitStatus}
- File tree:
${context.fileTree}`;
                const filePrompt = getPrompt("Ask", "Give production-quality, battle-tested answers.");
                const systemPrompt = basePrompt + "\n\n" + filePrompt;

                answer = await callClaude(systemPrompt, [{ role: "user", content: question }]);
            } catch (apiError) {
                answer = "API Error: could not answer question.";
            }

            return {
                content: [{ type: "text", text: answer }],
            };
        }

        if (name === "get_suggestions") {
            const cwd = process.cwd();
            const data = getProjectSummaryData();
            const rawData = `File Tree:\n${data.fileTree}\n\nTech Stack: ${data.stack} (${data.displayName})\n\nRecent commits:\n${data.recentCommits}`;

            let suggestions = "";
            try {
                const promptTemplate = getPrompt("Suggest", "You are a senior software architect reviewing this project. Give CONCRETE improvement suggestions.");
                suggestions = await callClaude(promptTemplate, [{ role: "user", content: rawData }]);
            } catch (apiError) {
                suggestions = "API Error: could not generate suggestions.";
            }

            return {
                content: [{ type: "text", text: suggestions }],
            };
        }

        throw new Error(`Tool not found: ${name}`);
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

/**
 * CLI COMMANDS
 */
const program = new Command();

program
    .command("day [subcommand]")
    .description("Generate an AI-powered summary of today's git activity")
    .action(async (subcommand) => {
        if (subcommand !== "report") {
            console.log("\n" + chalk.cyan.bold("-->>-- Day Commands --<<--\n"));
            console.log(chalk.yellow(`* Use 'smartcoder day report' to generate a daily summary.\n`));
            return;
        }
        try {
            const cwd = process.cwd();
            let commits = "";
            let fullMessages = "";
            let stats = "";
            let files = "";

            try {
                commits = execSync(
                    'git log --since="00:00:00" --oneline',
                    { encoding: "utf-8" }
                ).trim();
                fullMessages = execSync(
                    'git log --since="00:00:00" --pretty=format:"%s%n%b"',
                    { encoding: "utf-8" }
                ).trim();
                stats = execSync("git diff HEAD~5 HEAD --stat", {
                    encoding: "utf-8",
                }).trim();
                files = execSync("git diff HEAD~5 HEAD --name-only", {
                    encoding: "utf-8",
                }).trim();
            } catch {
                try {
                    stats = execSync("git diff --stat", { encoding: "utf-8" }).trim();
                    files = execSync("git diff --name-only", {
                        encoding: "utf-8",
                    }).trim();
                } catch {}
            }

            const rawData = `Git Commits:\n${commits || "No commits today"}\n\nFull Messages:\n${fullMessages || "N/A"}\n\nFile Changes:\n${stats || "No changes"}\n\nFiles Modified:\n${files || "N/A"}`;

            console.log("\n" + chalk.cyan.bold("-->>-- Today's Work Report --<<--\n"));
            const spinner = ora(chalk.blue("Analyzing commits...")).start();

            try {
                const promptTemplate = getPrompt("Dayreport", "You are a senior engineering lead reviewing a developer's daily work log. Produce a PROFESSIONAL, STRUCTURED report.");
                const analysis = await callClaude(promptTemplate, [{ role: "user", content: rawData }]);
                spinner.succeed(chalk.green("Analysis complete"));
                console.log(analysis);
            } catch (err) {
                spinner.stop();
                if (!handleClaudeDelegate(err, getPrompt("Dayreport"), rawData)) {
                    console.error(chalk.red("Error:"), err.message);
                }
            }
            console.log("");
        } catch (error) {
            console.error(chalk.red("Error generating day report:"), error.message);
            process.exit(1);
        }
    });

program
    .command("summary")
    .description("Get a detailed technical overview of your project")
    .action(() => {
        try {
            const data = getProjectSummaryData();
            console.log("\n" + chalk.cyan.bold("-->>-- Project Summary --<<--\n"));
            console.log(chalk.green("-- Tech Stack --"));
            console.log(chalk.yellow(`* ${data.stack} (${data.displayName})\n`));
            console.log(chalk.green("-- File Tree --"));
            console.log(data.fileTree);
            console.log("\n" + chalk.green("-- Recent History --"));
            console.log(data.recentCommits);
            console.log("");
        } catch (error) {
            console.error(chalk.red("Error generating summary:"), error.message);
            process.exit(1);
        }
    });

program
    .command("developer [subcommand]")
    .description("Start interactive developer mode (use 'mode' to enter interactive session)")
    .action(async (subcommand) => {
        const cwd = process.cwd();
        const context = getProjectContext(cwd);

        if (subcommand === "mode") {
            console.log("\n" + chalk.cyan.bold("-->>-- Developer Mode --<<--\n"));
            console.log(chalk.green(`-- Acting as ${context.displayName} --\n`));
            console.log(
                chalk.yellow(
                    `* Type your questions or commands.\n* Type '/exit' or leave empty to quit.\n`
                )
            );

            const conversationHistory = [];
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            const askQuestion = () => {
                rl.question(chalk.blue("> "), async (input) => {
                    if (!input || input.toLowerCase() === "/exit") {
                        console.log(chalk.green("\nGoodbye!"));
                        rl.close();
                        return;
                    }

                    conversationHistory.push({
                        role: "user",
                        content: input,
                    });

                    try {
                        const basePrompt = `You are a ${context.displayName} pair programmer embedded in this project.
PROJECT CONTEXT:
- Tech Stack: ${context.stack}
- Recent files changed: ${context.recentFiles}
- Git status: ${context.gitStatus}
- File tree:
${context.fileTree}`;
                        const devPrompt = getPrompt("DeveloperMode", "Give production-quality, battle-tested answers. If the task is vague, CROSS-QUESTION the user.");
                        const systemPrompt = basePrompt + "\n\n" + devPrompt;

                        const response = await callClaude(
                            systemPrompt,
                            conversationHistory,
                            true
                        );

                        conversationHistory.push({
                            role: "assistant",
                            content: response,
                        });

                        askQuestion();
                    } catch (err) {
                        if (!handleClaudeDelegate(err, "Please assist the user directly in Claude Code. Do not enter Developer Mode manually.", "")) {
                            console.error(chalk.red(`Error: ${err.message}`));
                        }
                        askQuestion();
                    }
                });
            };

            askQuestion();
        } else {
            console.log("\n" + chalk.cyan.bold("-->>-- Developer Context --<<--\n"));
            console.log(chalk.yellow(`* Tech Stack: ${context.stack}`));
            console.log(chalk.yellow(`* Role: ${context.displayName}`));
            console.log(
                chalk.yellow(`\n* Use 'smartcoder developer mode' to start interactive session.\n`)
            );
        }
    });

program
    .command("ask <question>")
    .description("Ask a question about the project with full context")
    .action(async (question) => {
        try {
            const cwd = process.cwd();
            const context = getProjectContext(cwd);

            console.log("\n" + chalk.cyan.bold("-->>-- Asking Question --<<--\n"));
            const spinner = ora(chalk.blue("Thinking...")).start();

            try {
                const basePrompt = `You are a ${context.displayName} pair programmer embedded in this project.
PROJECT CONTEXT:
- Tech Stack: ${context.stack}
- Recent files changed: ${context.recentFiles}
- Git status: ${context.gitStatus}
- File tree:
${context.fileTree}`;
                const filePrompt = getPrompt("Ask", "Give production-quality, battle-tested answers.");
                const systemPrompt = basePrompt + "\n\n" + filePrompt;

                spinner.stop();
                const answer = await callClaude(
                    systemPrompt,
                    [{ role: "user", content: question }],
                    true
                );
                console.log("");
            } catch (err) {
                spinner.stop();
                if (!handleClaudeDelegate(err, getPrompt("Ask"), `Context:\n${basePrompt}\nQuestion: ${question}`)) {
                    console.error(chalk.red("Error:"), err.message);
                }
            }
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

program
    .command("review")
    .description("Perform a professional code review of current changes")
    .action(async () => {
        try {
            const cwd = process.cwd();
            let diff = "";

            try {
                diff = execSync("git diff HEAD", { encoding: "utf-8" }).trim();
                if (!diff) {
                    diff = execSync("git diff --cached", { encoding: "utf-8" }).trim();
                }
                if (!diff) {
                    diff = execSync("git diff HEAD~1 HEAD", { encoding: "utf-8" }).trim();
                }
            } catch {
                console.log(chalk.yellow("No git changes to review."));
                return;
            }

            if (!diff) {
                console.log(chalk.yellow("No git changes to review."));
                return;
            }

            console.log("\n" + chalk.cyan.bold("-->>-- Code Review --<<--\n"));
            const spinner = ora(chalk.blue("Reviewing code...")).start();

            try {
                const promptTemplate = getPrompt("Review", "You are a senior code reviewer with 15+ years of experience. Review the following git diff and produce a PROFESSIONAL review.");
                const review = await callClaude(promptTemplate, [{ role: "user", content: diff }]);
                spinner.succeed(chalk.green("Review complete"));
                console.log(review);
            } catch (err) {
                spinner.stop();
                if (!handleClaudeDelegate(err, getPrompt("Review"), `Git Diff:\n${diff}`)) {
                    console.error(chalk.red("Error:"), err.message);
                }
            }
            console.log("");
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

program
    .command("explain [file]")
    .description("Explain a file or the project structure with AI")
    .action(async (file) => {
        try {
            const cwd = process.cwd();
            let content = "";
            let targetName = "Project";

            if (file) {
                const filePath = path.join(cwd, file);
                if (!fs.existsSync(filePath)) {
                    console.log(chalk.red(`File not found: ${file}`));
                    process.exit(1);
                }
                content = fs.readFileSync(filePath, "utf-8");
                targetName = path.basename(file);
            } else {
                const data = getProjectSummaryData();
                content = `File Tree:\n${data.fileTree}\n\nTech Stack: ${data.stack} (${data.displayName})\n\nRecent commits:\n${data.recentCommits}`;
            }

            console.log("\n" + chalk.cyan.bold(`-->>-- Explaining ${targetName} --<<--\n`));
            const spinner = ora(chalk.blue("Analyzing...")).start();

            try {
                spinner.stop();
                const promptTemplate = getPrompt("Explain", "You are a senior developer creating technical documentation. Explain the following code/file.");
                const explanation = await callClaude(
                    promptTemplate,
                    [{ role: "user", content: content }],
                    true
                );
                console.log("");
            } catch (err) {
                spinner.stop();
                if (!handleClaudeDelegate(err, getPrompt("Explain"), content)) {
                    console.error(chalk.red("Error:"), err.message);
                }
            }
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

program
    .command("suggest")
    .description("Get concrete improvement suggestions for the project")
    .action(async () => {
        try {
            const cwd = process.cwd();
            const data = getProjectSummaryData();
            const rawData = `File Tree:\n${data.fileTree}\n\nTech Stack: ${data.stack} (${data.displayName})\n\nRecent commits:\n${data.recentCommits}`;

            console.log("\n" + chalk.cyan.bold("-->>-- Project Suggestions --<<--\n"));
            const spinner = ora(chalk.blue("Analyzing project...")).start();

            try {
                spinner.stop();
                const promptTemplate = getPrompt("Suggest", "You are a senior software architect reviewing this project. Give CONCRETE improvement suggestions.");
                const suggestions = await callClaude(
                    promptTemplate,
                    [{ role: "user", content: rawData }],
                    true
                );
                console.log("");
            } catch (err) {
                spinner.stop();
                if (!handleClaudeDelegate(err, getPrompt("Suggest"), rawData)) {
                    console.error(chalk.red("Error:"), err.message);
                }
            }
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

program
    .command("set-key <apiKey>")
    .description("Set your Anthropic API key")
    .action((apiKey) => {
        try {
            saveConfig({ apiKey });
            console.log(
                chalk.green(
                    "\n✓ API key saved to ~/.smartcoder/config.json\n"
                )
            );
        } catch (error) {
            console.error(chalk.red("Error saving API key:"), error.message);
            process.exit(1);
        }
    });

program
    .command("init")
    .description("Initialize smartcoder configuration")
    .action(() => {
        try {
            const configDir = path.join(os.homedir(), ".smartcoder");
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
                console.log(chalk.green(`\n✓ Created ${configDir}\n`));
            } else {
                console.log(chalk.yellow(`\n✓ ${configDir} already exists\n`));
            }
            console.log(chalk.cyan("Next: run 'smartcoder set-key YOUR_API_KEY'\n"));
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

/**
 * START THE SERVER
 */
async function main() {
    if (process.argv.length > 2) {
        await program.parse();
        return;
    }

    isMCPMode = true;
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    process.stderr.write(`Server error: ${error.message}\n`);
    process.exit(1);
});

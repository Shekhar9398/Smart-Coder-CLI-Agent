#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";

const program = new Command();

/// MARK: CONFIG PATH
const getConfig = () => {
    const configPath = path.join(os.homedir(), ".smartcoder", "config.json");
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
    return {};
};

/// MARK: SET KEY COMMAND
program
    .command("set-key <key>")
    .description("Set Claude API key")
    .action((key) => {
        const configDir = path.join(os.homedir(), ".smartcoder");
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir);
        }
        const configPath = path.join(configDir, "config.json");
        fs.writeFileSync(configPath, JSON.stringify({ apiKey: key }, null, 2));
        console.log(chalk.green("✅ API key saved successfully"));
    });

/// MARK: DAY REPORT COMMAND
program
    .command("dayreport")
    .description("Show today's work report")
    .action(async () => {

        let commits = "";
        let diff = "";
        let diffFull = "";
        let branch = "";
        let authorStats = "";

        try {
            commits = execSync('git log --since="today" --oneline', {
                encoding: "utf-8",
            }).trim();

            diffFull = execSync("git diff --stat HEAD~1 HEAD 2>/dev/null || git diff --stat", {
                encoding: "utf-8",
            }).trim();

            diff = execSync("git diff --stat", { encoding: "utf-8" }).trim();

            branch = execSync("git rev-parse --abbrev-ref HEAD", {
                encoding: "utf-8",
            }).trim();

            authorStats = execSync('git log --since="today" --format="%an" | sort | uniq -c | sort -rn', {
                encoding: "utf-8",
            }).trim();
        } catch (err) {
            console.log(chalk.red("❌ Error: Make sure this is a git repository."));
            return;
        }

        const config = getConfig();

        /// MARK: AI-POWERED DAY REPORT
        if (config.apiKey && Anthropic) {
            console.log(chalk.blue("🤖 Generating AI day report...\n"));

            const prompt = `You are a senior engineering lead reviewing a developer's daily work.

Based on the git activity below, write a clear and concise daily work report covering:
1. **Summary** — 2-3 sentence overview of what was accomplished today
2. **Key Changes** — bullet list of the most important changes made
3. **Files Modified** — highlight which areas of the codebase were touched
4. **Observations** — any patterns, potential issues, or noteworthy things (e.g. large diffs, many small commits, etc.)
5. **Suggested Next Steps** — 2-3 logical follow-up tasks based on today's work

Branch: ${branch || "unknown"}

Today's Commits:
${commits || "(no commits today)"}

Diff Stats:
${diffFull || diff || "(no changes detected)"}

Author Activity:
${authorStats || "(no author data)"}

Keep the tone professional but readable. Use markdown formatting.`;

            try {
                const client = new Anthropic({ apiKey: config.apiKey });
                const response = await client.messages.create({
                    model: "claude-3-7-sonnet-20250219",
                    max_tokens: 800,
                    messages: [{ role: "user", content: prompt }],
                });

                console.log(chalk.green("📋 Day Report (AI-Powered):\n"));
                console.log(response.content[0].text);
                return;
            } catch (err) {
                console.log(chalk.yellow("⚠️  Claude unavailable, falling back to basic report.\n"));
            }
        }

        /// MARK: ENHANCED FALLBACK DAY REPORT
        console.log(chalk.green("📋 Day Report:\n"));

        // Branch
        if (branch) {
            console.log(chalk.bold("Branch: ") + chalk.cyan(branch));
        }

        // Commits section
        console.log(chalk.bold("\n── Commits Today ──"));
        if (!commits) {
            console.log(chalk.gray("  No commits found for today."));
        } else {
            const commitLines = commits.split("\n");
            console.log(chalk.cyan(`  Total: ${commitLines.length} commit(s)`));
            commitLines.forEach((line) => {
                const [hash, ...msgParts] = line.split(" ");
                console.log(`  ${chalk.yellow(hash)}  ${msgParts.join(" ")}`);
            });
        }

        // Author stats
        if (authorStats) {
            console.log(chalk.bold("\n── Contributors Today ──"));
            authorStats.split("\n").forEach((line) => {
                console.log("  " + line.trim());
            });
        }

        // File change stats
        console.log(chalk.bold("\n── File Changes ──"));
        if (!diff && !diffFull) {
            console.log(chalk.gray("  No uncommitted changes detected."));
        } else {
            const statLines = (diffFull || diff).split("\n");

            // Parse and display file changes with visual bars
            statLines.forEach((line) => {
                if (line.includes("|")) {
                    const [filePart, statPart] = line.split("|");
                    const additions = (statPart?.match(/\+/g) || []).length;
                    const deletions = (statPart?.match(/-/g) || []).length;
                    const fileName = filePart.trim();
                    const bar =
                        chalk.green("+".repeat(additions)) +
                        chalk.red("-".repeat(deletions));
                    console.log(`  ${chalk.white(fileName.padEnd(40))} ${bar}`);
                } else if (line.includes("changed")) {
                    // Summary line like "3 files changed, 42 insertions(+), 5 deletions(-)"
                    console.log("\n  " + chalk.bold(line.trim()));
                }
            });
        }

        console.log(
            chalk.gray(
                "\n💡 Tip: Add an API key with `smartcoder set-key <key>` for AI-powered insights."
            )
        );
    });

/// MARK: SUMMARY COMMAND
program
    .command("summary")
    .description("Show project summary")
    .action(async () => {
        const cwd = process.cwd();
        const files = fs.readdirSync(cwd);

        /// MARK: DETECT PROJECT TYPE
        let projectType = "Unknown";
        if (files.includes("package.json")) projectType = "JavaScript / Node.js / React / React Native";
        else if (files.includes("pubspec.yaml")) projectType = "Flutter / Dart";
        else if (files.includes("Podfile")) projectType = "iOS (UIKit / Swift)";
        else if (files.includes("Package.swift")) projectType = "Swift Package / SwiftUI";
        else if (files.includes("build.gradle") || files.includes("gradlew")) projectType = "Android (Kotlin / Java)";
        else if (files.includes("requirements.txt") || files.includes("setup.py") || files.includes("pyproject.toml")) projectType = "Python";
        else if (files.includes("go.mod")) projectType = "Go";
        else if (files.includes("Cargo.toml")) projectType = "Rust";
        else if (files.includes("pom.xml")) projectType = "Java / Maven";
        else if (files.includes("composer.json")) projectType = "PHP / Laravel";

        /// MARK: RECURSIVE FILE TREE (2 levels deep)
        const getTree = (dir, depth = 0, maxDepth = 2) => {
            if (depth > maxDepth) return [];
            try {
                return fs
                    .readdirSync(dir)
                    .filter((f) => !["node_modules", ".git", ".dart_tool", "build", "dist", ".gradle", "Pods", ".idea"].includes(f))
                    .map((f) => {
                        const fullPath = path.join(dir, f);
                        const isDir = fs.statSync(fullPath).isDirectory();
                        const indent = "  ".repeat(depth);
                        const entry = `${indent}${isDir ? "📁" : "📄"} ${f}`;
                        if (isDir && depth < maxDepth) {
                            return [entry, ...getTree(fullPath, depth + 1, maxDepth)];
                        }
                        return [entry];
                    })
                    .flat();
            } catch {
                return [];
            }
        };

        const fileTree = getTree(cwd).join("\n");

        /// MARK: READ IMPORTANT FILES
        const tryRead = (file, limit = 3000) => {
            const filePath = path.join(cwd, file);
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, "utf-8").slice(0, limit);
            }
            return "";
        };

        let importantData = "";
        importantData += tryRead("package.json");
        importantData += tryRead("README.md", 4000);
        importantData += tryRead("pubspec.yaml");
        importantData += tryRead("Podfile");
        importantData += tryRead("build.gradle");
        importantData += tryRead("requirements.txt");
        importantData += tryRead("go.mod");
        importantData += tryRead("Cargo.toml");
        importantData += tryRead("pyproject.toml");
        importantData += tryRead(".env.example");
        importantData += tryRead("docker-compose.yml");
        importantData += tryRead("Dockerfile");

        /// MARK: FETCH RECENT GIT LOG
        let recentCommits = "";
        try {
            recentCommits = execSync("git log --oneline -10", { encoding: "utf-8" }).trim();
        } catch {
            recentCommits = "(not a git repository or no commits)";
        }

        /// MARK: PREPARE AI PROMPT
        const prompt = `You are a senior software architect reviewing a codebase for the first time.

Analyze this project and provide a DETAILED technical summary covering ALL of the following:

1. **Project Overview** — What is this project? What problem does it solve?
2. **Tech Stack** — List every major framework, library, language, and tool detected
3. **Architecture & Structure** — How is the code organized? What patterns are used? (MVC, MVVM, feature-based, etc.)
4. **Key Entry Points** — Where does the app start? What are the main modules/packages?
5. **Dependencies Breakdown** — Categorize deps: UI, networking, state management, testing, utilities, etc.
6. **Configuration & Environment** — Any notable config files, env vars, Docker setup?
7. **Development Setup** — How would a new developer get started? (inferred from files)
8. **Code Quality Signals** — Any test files, linting configs, CI/CD setup detected?
9. **Potential Concerns** — Any outdated deps, missing docs, large file counts, or red flags?
10. **TL;DR** — One paragraph summary a non-technical stakeholder could understand

Be thorough and specific. Reference actual file names and dependency names where possible.

Project Type: ${projectType}

File Tree:
${fileTree}

Important File Contents:
${importantData}

Recent Git History:
${recentCommits}`;

        const config = getConfig();

        /// MARK: USE CLAUDE IF API KEY EXISTS
        if (config.apiKey && Anthropic) {
            console.log(chalk.blue("🤖 Analyzing project with Claude AI...\n"));

            try {
                const client = new Anthropic({ apiKey: config.apiKey });
                const response = await client.messages.create({
                    model: "claude-3-7-sonnet-20250219",
                    max_tokens: 2000,
                    messages: [{ role: "user", content: prompt }],
                });

                console.log(chalk.green("📦 Project Summary (AI-Powered):\n"));
                console.log(response.content[0].text);
                return;
            } catch (err) {
                console.log(chalk.yellow("⚠️  Claude unavailable, falling back to static analysis.\n"));
            }
        }

        /// MARK: ENHANCED FALLBACK — NO API KEY
        console.log(chalk.yellow("🔍 No API key found. Running static analysis...\n"));
        console.log(chalk.green("📦 Project Summary:\n"));

        // Project type
        console.log(chalk.bold("── Project Type ──"));
        console.log(`  ${chalk.cyan(projectType)}\n`);

        // File stats
        const allFiles = getTree(cwd, 0, 3);
        const fileCount = allFiles.filter((l) => l.includes("📄")).length;
        const dirCount = allFiles.filter((l) => l.includes("📁")).length;
        console.log(chalk.bold("── Structure ──"));
        console.log(`  Directories : ${chalk.cyan(dirCount)}`);
        console.log(`  Files       : ${chalk.cyan(fileCount)}`);
        console.log();

        // File tree (first 30 lines)
        console.log(chalk.bold("── File Tree ──"));
        fileTree.split("\n").slice(0, 30).forEach((line) => console.log("  " + line));
        if (allFiles.length > 30) console.log(chalk.gray(`  ... and ${allFiles.length - 30} more`));
        console.log();

        // package.json details
        if (files.includes("package.json")) {
            try {
                const pkg = JSON.parse(tryRead("package.json") || "{}");

                if (pkg.name || pkg.version || pkg.description) {
                    console.log(chalk.bold("── Package Info ──"));
                    if (pkg.name) console.log(`  Name        : ${chalk.cyan(pkg.name)}`);
                    if (pkg.version) console.log(`  Version     : ${chalk.cyan(pkg.version)}`);
                    if (pkg.description) console.log(`  Description : ${pkg.description}`);
                    console.log();
                }

                const depGroups = {
                    "Dependencies": pkg.dependencies,
                    "Dev Dependencies": pkg.devDependencies,
                    "Peer Dependencies": pkg.peerDependencies,
                };

                Object.entries(depGroups).forEach(([label, deps]) => {
                    if (deps && Object.keys(deps).length > 0) {
                        console.log(chalk.bold(`── ${label} (${Object.keys(deps).length}) ──`));
                        Object.entries(deps).forEach(([name, version]) => {
                            console.log(`  ${chalk.green("•")} ${name.padEnd(35)} ${chalk.gray(version)}`);
                        });
                        console.log();
                    }
                });

                if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
                    console.log(chalk.bold("── Available Scripts ──"));
                    Object.entries(pkg.scripts).forEach(([name, cmd]) => {
                        console.log(`  ${chalk.yellow("$")} npm run ${name.padEnd(20)} ${chalk.gray(cmd)}`);
                    });
                    console.log();
                }
            } catch { }
        }

        // pubspec.yaml details
        if (files.includes("pubspec.yaml")) {
            const pubspec = tryRead("pubspec.yaml");
            console.log(chalk.bold("── Flutter / Dart Config ──"));
            console.log(chalk.gray(pubspec.slice(0, 800)));
            console.log();
        }

        // Config files detected
        const configFiles = files.filter((f) =>
            [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".prettierrc", "jest.config.js",
                "tsconfig.json", "vite.config.js", "webpack.config.js", ".babelrc",
                "Dockerfile", "docker-compose.yml", ".github"].some((cf) => f.includes(cf))
        );
        if (configFiles.length > 0) {
            console.log(chalk.bold("── Config & Tooling Detected ──"));
            configFiles.forEach((f) => console.log(`  ${chalk.green("✓")} ${f}`));
            console.log();
        }

        // Recent git history
        if (recentCommits && !recentCommits.includes("not a git")) {
            console.log(chalk.bold("── Recent Commits ──"));
            recentCommits.split("\n").forEach((line) => {
                const [hash, ...msg] = line.split(" ");
                console.log(`  ${chalk.yellow(hash)}  ${msg.join(" ")}`);
            });
            console.log();
        }

        console.log(
            chalk.gray("💡 Tip: Add an API key with `smartcoder set-key <key>` for a full AI-powered analysis.")
        );
    });

program.parse();
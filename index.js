#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { Command } = require("commander");
const { execSync } = require("child_process");
const chalk = require("chalk").default;

let Anthropic;
try {
    Anthropic = require("@anthropic-ai/sdk");
} catch (e) {
    // SDK not installed
}

const program = new Command();

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
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir);
        const configPath = path.join(configDir, "config.json");
        fs.writeFileSync(configPath, JSON.stringify({ apiKey: key }, null, 2));
        console.log(chalk.green("✔ API key saved successfully"));
    });

/// MARK: DAY REPORT COMMAND
program
    .command("dayreport")
    .description("Generate a clean AI summary of today's work")
    .action(async () => {
        const config = getConfig();
        if (!config.apiKey || !Anthropic) {
            console.log(chalk.red("Error: Claude API key not set. Use 'set-key' first."));
            return;
        }

        try {
            const commits = execSync('git log --since="00:00:00" --oneline', { encoding: "utf-8" });
            const diff = execSync('git diff --stat HEAD~1 HEAD', { encoding: "utf-8" }).slice(0, 2000);

            if (!commits.trim()) {
                console.log(chalk.yellow("No commits found for today. Get to work!"));
                return;
            }

            console.log(chalk.blue("✨ Generating elegant daily report...\n"));

            const client = new Anthropic({ apiKey: config.apiKey });
            const response = await client.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 600,
                system: "You are an expert project manager. Transform technical git logs into a clean, executive daily status report. Use bullet points, bold text for key features, and keep it concise.",
                messages: [{
                    role: "user",
                    content: `Analyze today's work and provide a summary:\n\nCommits:\n${commits}\n\nFile Changes:\n${diff}`
                }],
            });

            console.log(chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
            console.log(response.content[0].text);
            console.log(chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

        } catch (err) {
            console.log(chalk.red("Error: " + err.message));
        }
    });

/// MARK: SUMMARY COMMAND
program
    .command("summary")
    .description("Show project summary")
    .action(async () => {
        const cwd = process.cwd();
        const files = fs.readdirSync(cwd);
        const config = getConfig();

        // Project Type Detection
        let projectType = "Unknown";
        if (files.includes("package.json")) projectType = "Node.js/JS";
        else if (files.includes("pubspec.yaml")) projectType = "Flutter";
        else if (files.includes("Podfile")) projectType = "iOS";

        let importantData = "";
        const tryRead = (file) => {
            const filePath = path.join(cwd, file);
            return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8").slice(0, 1500) : "";
        };

        importantData += `\n--- README ---\n${tryRead("README.md")}`;
        importantData += `\n--- Manifest ---\n${tryRead("package.json") || tryRead("pubspec.yaml")}`;

        if (config.apiKey && Anthropic) {
            console.log(chalk.blue("🧠 Analyzing project architecture...\n"));
            try {
                const client = new Anthropic({ apiKey: config.apiKey });
                const response = await client.messages.create({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 800,
                    system: `You are a Senior Software Architect. Your goal is to provide a high-level, extremely scannable project overview. 
                    Use the following structure:
                    - **Overview**: (1-2 sentences)
                    - **Tech Stack**: (Bullet points of core languages/libraries)
                    - **Architecture**: (Short bullets on folder structure logic)
                    - **Quick Start**: (Main command to run)`,
                    messages: [{
                        role: "user",
                        content: `Project Type: ${projectType}\nFiles: ${files.join(", ")}\n\nContent:\n${importantData}`
                    }],
                });

                console.log(chalk.green("🚀 PROJECT SUMMARY"));
                console.log(response.content[0].text);
            } catch (err) {
                console.log(chalk.red("Claude Error:"), err.message);
            }
        } else {
            console.log(chalk.yellow("No API key. Printing basic stats..."));
            console.log(`Type: ${projectType}\nFiles: ${files.length}`);
        }
    });

program.parse();
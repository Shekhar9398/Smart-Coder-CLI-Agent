#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { Command } = require("commander");
const chalk = require("chalk").default;

let Anthropic;
try {
    Anthropic = require("@anthropic-ai/sdk");
} catch (e) {
    // SDK not installed yet
}

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

        fs.writeFileSync(
            configPath,
            JSON.stringify({ apiKey: key }, null, 2)
        );

        console.log(chalk.green("API key saved successfully"));
    });

/// MARK: DAY REPORT COMMAND
program
    .command("dayreport")
    .description("Show today's work report")
    .action(() => {
        const { execSync } = require("child_process");

        try {
            /// MARK: GET TODAY COMMITS
            const commits = execSync('git log --since="today" --oneline', {
                encoding: "utf-8",
            });

            /// MARK: GET FILE CHANGES
            const diff = execSync('git diff --stat', {
                encoding: "utf-8",
            });

            console.log(chalk.green("Day Report:\n"));

            if (!commits.trim()) {
                console.log("No commits found for today.");
            } else {
                console.log("Commits:");
                console.log(commits);
            }

            console.log("\nChanges:");
            console.log(diff || "No changes detected.");
        } catch (err) {
            console.log(
                chalk.red("Error: Make sure this is a git repository.")
            );
        }
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

        if (files.includes("package.json")) {
            projectType = "JavaScript / React / React Native";
        } else if (files.includes("pubspec.yaml")) {
            projectType = "Flutter";
        } else if (files.includes("Podfile")) {
            projectType = "iOS (UIKit/Swift)";
        } else if (files.includes("Package.swift")) {
            projectType = "Swift Package / SwiftUI";
        } else if (files.includes("build.gradle") || files.includes("gradlew")) {
            projectType = "Android (Kotlin/Java)";
        }

        /// MARK: READ IMPORTANT FILES
        let importantData = "";

        const tryRead = (file) => {
            const filePath = path.join(cwd, file);
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, "utf-8").slice(0, 2000);
            }
            return "";
        };

        importantData += tryRead("package.json");
        importantData += tryRead("README.md");
        importantData += tryRead("pubspec.yaml");
        importantData += tryRead("Podfile");
        importantData += tryRead("build.gradle");
        importantData += tryRead("gradlew");

        /// MARK: PREPARE AI PROMPT
        const prompt = `
You are a senior software engineer.

Analyze this project and give a short summary:
- What is this project?
- Tech stack
- Key structure

Project Type: ${projectType}

Project Files:
${files.join(", ")}

Important Content:
${importantData}
`;

        const config = getConfig();

        /// MARK: USE CLAUDE IF API KEY EXISTS
        if (config.apiKey && Anthropic) {
            console.log(chalk.blue("Using Claude AI...\n"));

            try {
                const client = new Anthropic({
                    apiKey: config.apiKey,
                });

                const response = await client.messages.create({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 500,
                    messages: [
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                });

                const result = response.content[0].text;

                console.log(chalk.green("Project Summary:\n"));
                console.log(result);
            } catch (err) {
                console.log(chalk.red("Claude Error:"), err.message);
            }
        } else {
            /// MARK: FALLBACK WITHOUT API KEY
            console.log(chalk.yellow("No API key found. Using basic summary...\n"));

            console.log(chalk.green("Project Summary:\n"));
            console.log(`Project Type: ${projectType}`);
            console.log(`Total Files: ${files.length}`);

            /// MARK: READ DEPENDENCIES
            if (files.includes("package.json")) {
                try {
                    const pkg = JSON.parse(tryRead("package.json") || "{}");

                    console.log("\nDependencies:");
                    if (pkg.dependencies) {
                        Object.keys(pkg.dependencies).forEach((dep) => {
                            console.log("- " + dep);
                        });
                    }
                } catch { }
            }
        }
    });

program.parse();
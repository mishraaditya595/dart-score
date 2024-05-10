#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const yaml = require('js-yaml');
const { off } = require('process');

// Define the required documentation files
const REQUIRED_FILES = ['README.md', 'LICENSE', 'CONTRIBUTING.md'];
const MIN_DESCRIPTION_LENGTH = 60;

function checkDocumentation(directory) {
    const foundFiles = [];

    // Check if required documentation files are present
    for (const file of REQUIRED_FILES) {
        if (fs.existsSync(`${directory}/${file}`)) {
            foundFiles.push(file);
        }
    }

    // Check pubspec.yaml for description length
    const pubspecPath = `${directory}/pubspec.yaml`;
    if (fs.existsSync(pubspecPath)) {
        const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
        const pubspec = yaml.load(pubspecContent);
        const description = pubspec.description || '';
        if (description.length > MIN_DESCRIPTION_LENGTH) {
            console.log("   Description key found in pubspec.yaml.");
        } else {
            console.log("   Could not find sufficient description found in pubspec.yaml.");
        }
    }


    return foundFiles;
}


// Function to execute shell command and return output
function executeCommandSync(command, cwd, suppressOutput = false) {
    try {
        const options = { encoding: 'utf-8', cwd };
        if (suppressOutput) {
            options.stdio = ['pipe', 'pipe', 'ignore'];
            return execSync(command);
        } else {
            return execSync(command, { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] });
        }
    } catch (error) {
        if (suppressOutput) {
            return error.stdout.toString();
        } else {
            return error.stderr;
        }
    }
}

function getNumberOfAnalysisIssue(output) {
    const matches = output.match(/(\d+) issues? found/gi);
    let totalIssues = 0;
    if (matches) {
        for (const match of matches) {
            const countMatch = match.match(/\d+/);
            if (countMatch) {
                totalIssues += parseInt(countMatch[0]);
            }
        }
    }
    return totalIssues;
}

function parseOutdatedPackagesOutput(output) {
    const lines = output.trim().split('\n');
    let upgradableCount = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip lines that do not contain package information
        if (!line.includes('*')) {
            continue;
        }
        // Check if the line contains package information and is not empty
        if (line.includes('*') && line.trim().length > 0) {
            upgradableCount++;
        }
    }
    return upgradableCount;
}

function runFlutterFormatAnalysis(projectDirectory) {
    // Execute flutter analyze command
    const flutterOutput = executeCommandSync('flutter analyze', projectDirectory);
    if (flutterOutput !== null) {
        if (flutterOutput === '') {
            console.log("   Some error occurred while executing flutter analyze command. Run 'flutter analyze' command in your project to check for issues.");
        } else {
            const issueCount = getNumberOfAnalysisIssue(flutterOutput);
            if (issueCount > 0) {
                console.log("   Found " + issueCount + " analysis issues.");
                console.log("   Run 'flutter analyze' command in your project to check for issues.");
            } else {
                console.log(flutterOutput);
                console.log("   No analysis issues found.");
            }
        }
    } else {
        console.log("   Some error occurred while flutter analyze command. Run flutter analyze command in your project to check for issues.");
    }

    // Execute dart format command
    const dartFormatOutput = executeCommandSync('dart format --output=none .', projectDirectory);
    if (dartFormatOutput !== null) {
        const formattedFiles = dartFormatOutput.match(/Changed.*\.dart/gi);
        if (formattedFiles) {
            console.log("\n   " + formattedFiles.length + " files needs to be formatted.");
            console.log("   Run 'dart format .' command in your project to get the files formatted.");
        } else {
            console.log("   No files needed formatting.");
        }
    }
}

function analysePubspecDependencies(projectDirectory) {
    // Execute flutter pub outdated command
    const outdatedPackages = executeCommandSync('dart pub outdated', projectDirectory);
    if (outdatedPackages !== null) {
        const upgradablePackagesCount = parseOutdatedPackagesOutput(outdatedPackages);
        if (upgradablePackagesCount > 0) {
            console.log("   Found " + upgradablePackagesCount + " packages which can be updated.");
            console.log("   Run 'dart pub outdated' command in your project to know more about these.");
        } else {
            console.log("   All pub dependencies on respective latest versions.");
        }
    }
}

function countNotSupportedPackages(input) {
    const regex = /(\d+) packages doesn't support/;
    const match = input.match(regex);
    if (match) {
        return parseInt(match[1]);
    } else {
        return 0;
    }
}

function analyseSupportedPlatforms(projectDirectory) {
    // Execute dart run will_it_run:<platform> command
    const addWillItRun = executeCommandSync('dart pub add will_it_run', projectDirectory);
    if(addWillItRun.includes("Add will_it_run: Resolving dependencies") || addWillItRun.includes('"will_it_run" is already in "dependencies"')) {
        const willItRunCommand = "dart run will_it_run:"
        const osList = ["android", "ios", "web"];
        for(os of osList) {
            var command = willItRunCommand+os;
            const supportCheck = executeCommandSync(command, projectDirectory);
            const packagesNotSupportedCount = countNotSupportedPackages(supportCheck);
            if(packagesNotSupportedCount > 0) {
                console.log("   Found " + packagesNotSupportedCount + " packages not supported for " + os);
            } else {
                console.log("   All packages are supported for " + os);
            }
        }
    } else {
        console.log(addWillItRun);
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: pub-score2.js <directory>');
        process.exit(1);
    }
    console.log('\nStarting analysis...');
    const directory = args[0];

    console.log("\n1. Checking required files and descriptions...");
    const foundFiles = checkDocumentation(directory);
    console.log('   Found ' + foundFiles.length + ' documentation files');
    const missingFiles = REQUIRED_FILES.filter(file => !foundFiles.includes(file));
    if (missingFiles.length > 0) {
        console.log(`   Missing documentation file(s): ${missingFiles.join(', ')}.`);
    }

    console.log("\n2. Analysing Flutter format and warnings...");
    runFlutterFormatAnalysis(directory);

    console.log("\n3. Analysing pubspec dependecies...");
    analysePubspecDependencies(directory);

    console.log("\n4. Analysing supported platforms...");
    analyseSupportedPlatforms(directory);

    console.log("\nAnalysis finished.");
}

module.exports = main

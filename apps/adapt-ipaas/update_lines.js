const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'code_diagram.md');
let mdContent = fs.readFileSync(mdPath, 'utf-8');

const regexFullFile = /\*\*File:\*\* \[`([^`]+)`\]\((file:\/\/\/[^\)]+)\) \((\d+) lines\)([\s\S]*?)```[\w]*\n([\s\S]*?)```/g;

let updatedCount = 0;
mdContent = mdContent.replace(regexFullFile, (match, relPath, fileUrl, oldLines, interveningText, oldCode) => {
    let absPath = decodeURI(fileUrl.replace('file:///', ''));
    absPath = absPath.replace(/\//g, path.sep);
    if (fs.existsSync(absPath)) {
        let actualCode = fs.readFileSync(absPath, 'utf-8');
        actualCode = actualCode.trim();
        const newLines = actualCode.split('\n').length;
        
        let lang = 'typescript';
        if (relPath.endsWith('.tsx')) lang = 'tsx';
        else if (relPath.endsWith('.ts')) lang = 'ts';
        
        updatedCount++;
        return `**File:** [\`${relPath}\`](${fileUrl}) (${newLines} lines)${interveningText}\`\`\`${lang}\n${actualCode}\n\`\`\``;
    } else {
        console.log('Not found:', absPath);
    }
    return match;
});

// Update the overall lines count at the top of the file
const regexTotal = /> The core ADAPT iPaaS engine contains exactly \*\*([\d,]+) lines of code\*\* across (\d+) primary files/;
let totalLines = 0;
let fileSet = new Set();
// we need to count total lines in the repo to be accurate, but let's just do a naive sum for now, or don't touch it.

fs.writeFileSync(mdPath, mdContent);
console.log(`Updated ${updatedCount} full file blocks.`);

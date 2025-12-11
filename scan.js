const fs = require('fs');
const path = require('path');

// CONFIG
const DATABASE_FILE = 'database.json';
const PHOTOS_DIR = 'photos';

// 1. Load Database
const dbPath = path.join(__dirname, DATABASE_FILE);
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 2. Determine Active Month Folder (e.g., "2025-12")
const active = db.activeContest;
// Javascript months are 0-11, so we pad +1
const monthStr = String(active.monthIndex + 1).padStart(2, '0'); 
const targetFolder = `${active.year}-${monthStr}`;
const targetPath = path.join(__dirname, PHOTOS_DIR, targetFolder);

console.log(`🤖 SCANNER: Looking for photos in: /photos/${targetFolder}/`);

if (!fs.existsSync(targetPath)) {
    console.error(`❌ ERROR: Folder not found! Please create: ${targetPath}`);
    process.exit(1);
}

// 3. Scan for Images
let newEntries = [];
let nextId = 1; // Starting ID for this batch

// Get list of photographer folders (Ivan Pecek, Jack Wickes, etc.)
const photographers = fs.readdirSync(targetPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

photographers.forEach(name => {
    // Check if this person is in the official team list (optional warning)
    if (!db.teamMembers.includes(name)) {
        console.warn(`⚠️  WARNING: Found folder for "${name}", but they are not in 'teamMembers' list.`);
    }

    const personDir = path.join(targetPath, name);
    const files = fs.readdirSync(personDir);

    files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            
            // Generate the web-friendly path (forward slashes)
            const webPath = `photos/${targetFolder}/${name}/${file}`;
            
            newEntries.push({
                id: nextId++,
                photographer: name,
                filename: webPath
            });
            console.log(`   ✅ Added: ${name} -> ${file}`);
        }
    });
});

// 4. Update Database
db.activeContest.entries = newEntries;

// 5. Save
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`\n🎉 SUCCESS! Database updated with ${newEntries.length} entries.`);
console.log(`👉 Next Step: Run 'git add .' and 'git push' to go live.`);
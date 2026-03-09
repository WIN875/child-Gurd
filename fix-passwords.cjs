const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('childguard.db');

const users = [
    { username: 'admin', password: 'admin123', role: 'ADMIN' },
    { username: 'ronie', password: 'ronie123', role: 'OFFICER' }
];

console.log("Resetting passwords...");

for (const user of users) {
    const hashedPassword = bcrypt.hashSync(user.password, 10);
    const existing = db.prepare("SELECT * FROM users WHERE username = ?").get(user.username);

    if (existing) {
        db.prepare("UPDATE users SET password = ?, role = ? WHERE username = ?").run(hashedPassword, user.role, user.username);
        console.log(`Updated user: ${user.username}`);
    } else {
        db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run(user.username, hashedPassword, user.role);
        console.log(`Created user: ${user.username}`);
    }
}

console.log("Password reset complete.");
console.log("Current users in database:");
console.log(JSON.stringify(db.prepare("SELECT id, username, role FROM users").all(), null, 2));

// Builds dist/focus-board.html: inlines src/scheduler.js into src/page.html.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/page.html"), "utf8");
const scheduler = fs.readFileSync(path.join(root, "src/scheduler.js"), "utf8");

if (!page.includes("/*SCHEDULER*/")) throw new Error("src/page.html is missing the /*SCHEDULER*/ placeholder");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/focus-board.html"), page.replace("/*SCHEDULER*/", () => scheduler.trim()));
console.log("Built dist/focus-board.html");

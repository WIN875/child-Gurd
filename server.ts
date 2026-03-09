import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (important for OPENROUTER_API_KEY)
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DB_PATH = process.env.NODE_ENV === "production"
  ? "/tmp/childguard.db"
  : path.join(__dirname, "childguard.db");

const db = new Database(DB_PATH);
const PORT = parseInt(process.env.PORT || "3000", 10);
const JWT_SECRET = process.env.JWT_SECRET || "childguard-demo-secret-key";

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT CHECK(role IN ('ADMIN', 'OFFICER'))
  );
  CREATE TABLE IF NOT EXISTS missing_children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, age INTEGER, gender TEXT, location TEXT,
    photo_url TEXT, description TEXT, status TEXT DEFAULT 'MISSING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS found_children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_url TEXT, location TEXT, description TEXT,
    reporter_contact TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS match_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    missing_child_id INTEGER, found_child_id INTEGER,
    confidence_score REAL,
    status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    ai_analysis TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(missing_child_id) REFERENCES missing_children(id),
    FOREIGN KEY(found_child_id) REFERENCES found_children(id)
  );
`);

const adminExists = db.prepare("SELECT * FROM users WHERE username = ?").get("admin");
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run("admin", hashedPassword, "ADMIN");
  console.log("Seeded admin user: admin / admin123");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const UPLOAD_DIR = process.env.NODE_ENV === "production" ? "/tmp/uploads" : "./uploads";
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s/g, "_"));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
app.use("/uploads", express.static(UPLOAD_DIR));

const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};
const isAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  next();
};

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  console.log(`Login attempt: user="${username}", pass="${password}"`);
  const user: any = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    console.log(`Failed login for user: ${username}`);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
  console.log(`Successful login for user: ${username}`);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get("/api/users", authenticate, isAdmin, (req, res) => {
  res.json(db.prepare("SELECT id, username, role FROM users").all());
});
app.post("/api/users", authenticate, isAdmin, (req, res) => {
  const { username, password, role } = req.body;
  try {
    db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run(username, bcrypt.hashSync(password, 10), role);
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/api/missing-children", authenticate, upload.single("photo"), (req, res) => {
  const { name, age, gender, location, description } = req.body;
  const photo_url = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db.prepare("INSERT INTO missing_children (name, age, gender, location, photo_url, description) VALUES (?, ?, ?, ?, ?, ?)").run(name, age, gender, location, photo_url, description);
  res.json({ id: result.lastInsertRowid, photo_url });
});
app.get("/api/missing-children", authenticate, (req, res) => {
  res.json(db.prepare("SELECT * FROM missing_children ORDER BY created_at DESC").all());
});

app.post("/api/found-children", authenticate, upload.single("photo"), (req, res) => {
  const { location, description, reporter_contact } = req.body;
  const photo_url = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db.prepare("INSERT INTO found_children (photo_url, location, description, reporter_contact) VALUES (?, ?, ?, ?)").run(photo_url, location, description, reporter_contact);
  res.json({ id: result.lastInsertRowid, photo_url });
});
app.get("/api/found-children", authenticate, (req, res) => {
  res.json(db.prepare("SELECT * FROM found_children ORDER BY created_at DESC").all());
});

app.get("/api/matches", authenticate, (req, res) => {
  res.json(db.prepare(`
    SELECT m.*, mc.name as missing_name, mc.photo_url as missing_photo,
           fc.photo_url as found_photo, fc.location as found_location
    FROM match_results m
    JOIN missing_children mc ON m.missing_child_id = mc.id
    JOIN found_children fc ON m.found_child_id = fc.id
    ORDER BY m.confidence_score DESC
  `).all());
});
app.post("/api/matches", authenticate, (req, res) => {
  const { missing_child_id, found_child_id, confidence_score, ai_analysis } = req.body;
  db.prepare("INSERT INTO match_results (missing_child_id, found_child_id, confidence_score, ai_analysis) VALUES (?, ?, ?, ?)").run(missing_child_id, found_child_id, confidence_score, ai_analysis);
  res.json({ success: true });
});
app.patch("/api/matches/:id", authenticate, isAdmin, (req, res) => {
  db.prepare("UPDATE match_results SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
  res.json({ success: true });
});

// AI Face Comparison — runs server-side so API key is never exposed to the browser
app.post("/api/compare-faces", authenticate, async (req: any, res: any) => {
  const { image1Base64, image2Base64 } = req.body;
  if (!image1Base64 || !image2Base64) {
    return res.status(400).json({ error: "Two images required" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // Graceful demo fallback when no key is set
    const score = Math.floor(Math.random() * 60) + 20;
    return res.json({
      confidence_score: score,
      analysis: `Demo mode (OPENROUTER_API_KEY not set): Simulated ${score}% similarity score.`,
    });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://childguard.railway.app", // Required by OpenRouter
        "X-Title": "ChildGuard Face Matcher", // Required by OpenRouter
      },
      body: JSON.stringify({
        // We use NVIDIA's free Vision model via OpenRouter since all free Gemini models were removed today
        model: "nvidia/nemotron-nano-12b-v2-vl:free",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `You are a professional facial recognition expert. Compare these two images of children. Determine if they could be the same child. Return ONLY valid JSON with keys "confidence_score" (number 0-100) and "analysis" (string describing facial features compared).` },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image1Base64}` } },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image2Base64}` } }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("OpenRouter raw response:", JSON.stringify(data, null, 2));

    const text = data.choices[0].message.content.replace(/```json|```/g, "").trim();
    console.log("OpenRouter parsed text:", text);

    const result = JSON.parse(text);
    console.log("Final matched score:", result.confidence_score);

    res.json({
      confidence_score: result.confidence_score || 0,
      analysis: result.analysis || "No analysis provided.",
    });
  } catch (error: any) {
    console.error("OpenRouter API Error:", error?.message || error);
    res.status(500).json({ confidence_score: 0, analysis: "AI matching failed. Check OPENROUTER_API_KEY." });
  }
});

app.get("/api/stats", authenticate, (req, res) => {
  const q = (sql: string) => (db.prepare(sql).get() as any).count;
  res.json({
    missing: q("SELECT COUNT(*) as count FROM missing_children"),
    found: q("SELECT COUNT(*) as count FROM found_children"),
    pending: q("SELECT COUNT(*) as count FROM match_results WHERE status = 'PENDING'"),
    approved: q("SELECT COUNT(*) as count FROM match_results WHERE status = 'APPROVED'"),
  });
});

// Serve React build in production
const distPath = path.resolve(process.cwd(), "dist");
const alternateDistPath = path.resolve(__dirname, "../dist");

console.log(`[INFO] Current Working Directory: ${process.cwd()}`);
console.log(`[INFO] __dirname: ${__dirname}`);
console.log(`[INFO] Attempting to serve static files from: ${distPath}`);

if (process.env.NODE_ENV === "production") {
  const finalDistPath = fs.existsSync(distPath) ? distPath : alternateDistPath;
  console.log(`[INFO] Final Resolved distPath: ${finalDistPath}`);

  if (fs.existsSync(finalDistPath)) {
    console.log(`[INFO] Found dist directory. Serving static files.`);
    app.use(express.static(finalDistPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(finalDistPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error(`[ERROR] index.html not found at ${indexPath}`);
        res.status(404).send("Frontend build not found. Did you run 'npm run build'?");
      }
    });
  } else {
    console.error(`[ERROR] dist directory NOT found at ${distPath} or ${alternateDistPath}`);
  }
} else {
  console.log(`[INFO] Running in development mode with Vite middleware.`);
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ ChildGuard running on http://localhost:${PORT}`);
});

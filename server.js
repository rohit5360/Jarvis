const express    = require('express');
const bcrypt     = require('bcryptjs');
const session    = require('cookie-session');
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const fs         = require('fs');

const app = express();
const PORT = 3000;

// ═══════════════════════════════════════════════
// DATA LAYER — file-based JSON storage
// ═══════════════════════════════════════════════

app.use(express.static(path.resolve()));


const DATA_DIR = path.join(__dirname, 'data');
const PATHS = {
  users:    path.join(DATA_DIR, 'users.json'),
  memory:   path.join(DATA_DIR, 'memory.json'),
  logs:     path.join(DATA_DIR, 'logs.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  profile:  (username) => path.join(DATA_DIR, 'profiles', `${username.toLowerCase()}.json`)
};

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Users — users.json
function getUsers()           { return readJSON(PATHS.users) || []; }
function saveUsers(u)         { writeJSON(PATHS.users, u); }
function getUserById(id)      { return getUsers().find(u => u.id === id) || null; }
function getUserByUsername(n) { return getUsers().find(u => u.username.toLowerCase() === n.toLowerCase()) || null; }

// Profiles — data/profiles/[username].json
function getProfile(username) {
  const p = readJSON(PATHS.profile(username));
  return p || { username, display_name: username, age: null, bio: '', location: '', fav_things: [], theme_color: '#e8a020', joined: new Date().toISOString().split('T')[0] };
}
function saveProfile(username, data) { writeJSON(PATHS.profile(username), data); }

// Memory — memory.json
function getMemory()           { return readJSON(PATHS.memory) || []; }
function saveMemory(m)         { writeJSON(PATHS.memory, m); }

// Logs — logs.json
function getLogs()             { return readJSON(PATHS.logs) || []; }
function appendLog(entry) {
  const logs = getLogs();
  logs.unshift({ id: `log_${uuidv4().slice(0,8)}`, ...entry, timestamp: new Date().toISOString() });
  const settings = getSettings();
  writeJSON(PATHS.logs, logs.slice(0, settings.max_log_entries || 1000));
}

// Settings — settings.json
function getSettings()         { return readJSON(PATHS.settings) || {}; }
function saveSettings(s)       { writeJSON(PATHS.settings, s); }

// ═══════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: 'cue_session',
  keys: ['cue-secret-key-2026'],
  maxAge: 24 * 60 * 60 * 1000
}));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = getUserById(req.session.userId);
  if (!user) { req.session = null; return res.status(401).json({ error: 'Session invalid' }); }
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

// ═══════════════════════════════════════════════
// SEED — create admin on first run
// ═══════════════════════════════════════════════

async function seedAdmin() {
  const users = getUsers();
  if (users.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    const admin = { id: `usr_${uuidv4().slice(0,8)}`, username: 'admin', password: hash, role: 'admin', created_at: new Date().toISOString() };
    saveUsers([admin]);
    saveProfile('admin', { username: 'admin', display_name: 'Administrator', age: null, bio: 'System administrator account.', location: '', fav_things: [], theme_color: '#e8a020', joined: new Date().toISOString().split('T')[0] });
    console.log('[CUE] Admin account created — username: admin / password: admin123');
  }
}

// ═══════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  const user = getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Username not found.' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Incorrect password.' });

  req.session.userId = user.id;
  appendLog({ user_id: user.id, username: user.username, action: 'login', detail: '' });

  res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
});

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  const settings = getSettings();
  if (!settings.allow_registration) return res.status(403).json({ error: 'Registration is currently disabled.' });

  const { username, password, age, location } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (username.length < 3)   return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  if (password.length < 6)   return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores.' });
  if (getUserByUsername(username)) return res.status(409).json({ error: 'Username already taken.' });

  const hash = await bcrypt.hash(password, 10);
  const colors = ['#e8a020','#22d3ee','#a78bfa','#34d399','#fb7185','#60a5fa'];
  const color  = colors[Math.floor(Math.random() * colors.length)];
  const user   = { id: `usr_${uuidv4().slice(0,8)}`, username, password: hash, role: 'user', created_at: new Date().toISOString() };

  const users = getUsers();
  users.push(user);
  saveUsers(users);

  saveProfile(username, {
    username,
    display_name: username,
    age: age ? parseInt(age) : null,
    bio: '',
    location: location || '',
    fav_things: [],
    theme_color: color,
    joined: new Date().toISOString().split('T')[0]
  });

  req.session.userId = user.id;
  appendLog({ user_id: user.id, username, action: 'signup', detail: '' });

  res.json({ success: true, user: { id: user.id, username, role: 'user' } });
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
  appendLog({ user_id: req.user.id, username: req.user.username, action: 'logout', detail: '' });
  req.session = null;
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  const { id, username, role, created_at } = req.user;
  res.json({ id, username, role, created_at });
});

// ═══════════════════════════════════════════════
// PROFILE ROUTES
// ═══════════════════════════════════════════════

// GET /api/profile
app.get('/api/profile', requireAuth, (req, res) => {
  res.json(getProfile(req.user.username));
});

// PUT /api/profile
app.put('/api/profile', requireAuth, (req, res) => {
  const existing = getProfile(req.user.username);
  const allowed  = ['display_name', 'age', 'bio', 'location', 'fav_things', 'theme_color'];
  const updated  = { ...existing };
  allowed.forEach(k => { if (req.body[k] !== undefined) updated[k] = req.body[k]; });
  saveProfile(req.user.username, updated);
  appendLog({ user_id: req.user.id, username: req.user.username, action: 'profile_update', detail: '' });
  res.json(updated);
});

// ═══════════════════════════════════════════════
// MEMORY / CUE ROUTES
// ═══════════════════════════════════════════════

// GET /api/memory
app.get('/api/memory', requireAuth, (req, res) => {
  res.json(getMemory());
});

// POST /api/memory — add new command
app.post('/api/memory', requireAuth, (req, res) => {
  const { trigger, keywords, response, type, label } = req.body;
  if (!trigger || !keywords || !response) return res.status(400).json({ error: 'trigger, keywords, and response are required.' });

  const memory = getMemory();
  const settings = getSettings();
  if (memory.length >= (settings.max_memory_entries || 500)) return res.status(400).json({ error: 'Memory limit reached.' });

  const entry = {
    id: `mem_${uuidv4().slice(0,8)}`,
    trigger,
    keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map(k => k.trim()).filter(Boolean),
    response,
    type: type || 'custom',
    label: label || 'user-added',
    created_by: req.user.username,
    created_at: new Date().toISOString()
  };

  memory.push(entry);
  saveMemory(memory);
  appendLog({ user_id: req.user.id, username: req.user.username, action: 'memory_add', detail: trigger });
  res.json(entry);
});

// DELETE /api/memory/:id
app.delete('/api/memory/:id', requireAuth, (req, res) => {
  const memory = getMemory();
  const entry  = memory.find(m => m.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found.' });
  if (entry.type === 'builtin' && req.user.role !== 'admin') return res.status(403).json({ error: 'Built-in commands can only be deleted by admins.' });

  saveMemory(memory.filter(m => m.id !== req.params.id));
  appendLog({ user_id: req.user.id, username: req.user.username, action: 'memory_delete', detail: entry.trigger });
  res.json({ success: true });
});

// PUT /api/memory/:id (admin only)
app.put('/api/memory/:id', requireAdmin, (req, res) => {
  const memory = getMemory();
  const idx    = memory.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Entry not found.' });

  const allowed = ['trigger', 'keywords', 'response', 'label'];
  allowed.forEach(k => { if (req.body[k] !== undefined) memory[idx][k] = req.body[k]; });
  saveMemory(memory);
  res.json(memory[idx]);
});

// ═══════════════════════════════════════════════
// SMART ENGINE HELPERS
// ═══════════════════════════════════════════════

// ── Math Engine ─────────────────────────────────
// Safe recursive-descent parser — no eval(), no Function()
const MathEngine = {
  // Word → number map (supports up to trillion)
  WORDS: {
    zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
    ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
    sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,
    thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,
    hundred:100,thousand:1000,million:1e6,billion:1e9,trillion:1e12,
    'a hundred':100,'a thousand':1000
  },

  // Convert word-numbers inside a string → digits
  // e.g. "two hundred and five" → 205
  wordsToNum(str) {
    str = str.trim().toLowerCase().replace(/,/g, '');
    if (!isNaN(parseFloat(str))) return parseFloat(str);
    const tokens = str.split(/\s+/);
    let current = 0, result = 0;
    for (const t of tokens) {
      if (t === 'and') continue;
      const v = this.WORDS[t];
      if (v === undefined) return NaN;
      if (v >= 1000) { result = (result + current) * v; current = 0; }
      else if (v === 100) { current = current === 0 ? v : current * v; }
      else current += v;
    }
    return result + current;
  },

  // Extract a number from a token (handles digits + words)
  toNum(s) {
    s = s.trim();
    const n = parseFloat(s);
    if (!isNaN(n)) return n;
    return this.wordsToNum(s);
  },

  // Tokenize and flatten comma/and separated number lists
  // "1, 2, 3 and 4" → [1, 2, 3, 4]
  extractList(str) {
    return str.split(/,|\band\b/).map(s => this.toNum(s.trim())).filter(n => !isNaN(n));
  },

  // Safe symbolic expression evaluator — handles +,-,*,/,^,(,) and decimals
  evalExpr(expr) {
    // Strip spaces, allow only safe chars
    expr = expr.replace(/\s/g, '').replace(/\^/g, '**');
    if (!/^[\d+\-*/().%\s]+$/.test(expr)) return null;
    // Recursive descent
    let pos = 0;
    const peek = () => expr[pos];
    const consume = () => expr[pos++];

    function parseNum() {
      let s = '';
      if (peek() === '-' && (pos === 0 || /[+\-*/^(]/.test(expr[pos-1] || '('))) { s += consume(); }
      while (pos < expr.length && /[\d.]/.test(peek())) s += consume();
      return parseFloat(s);
    }
    function parsePrimary() {
      if (peek() === '(') {
        consume(); // (
        const v = parseExpr();
        if (peek() === ')') consume(); // )
        return v;
      }
      return parseNum();
    }
    function parsePow() {
      let base = parsePrimary();
      while (pos < expr.length && expr.slice(pos, pos+2) === '**') {
        pos += 2;
        const exp = parsePrimary();
        base = Math.pow(base, exp);
      }
      return base;
    }
    function parseMul() {
      let left = parsePow();
      while (pos < expr.length && (peek() === '*' || peek() === '/' || peek() === '%')) {
        const op = consume();
        const right = parsePow();
        if (op === '*') left *= right;
        else if (op === '/') left = right === 0 ? NaN : left / right;
        else left %= right;
      }
      return left;
    }
    function parseExpr() {
      let left = parseMul();
      while (pos < expr.length && (peek() === '+' || peek() === '-')) {
        const op = consume();
        const right = parseMul();
        if (op === '+') left += right; else left -= right;
      }
      return left;
    }

    try {
      const result = parseExpr();
      if (!isFinite(result)) return null;
      return result;
    } catch { return null; }
  },

  // Format result — no unnecessary decimals
  fmt(n) {
    if (!isFinite(n)) return null;
    const s = parseFloat(n.toPrecision(12));
    return Number.isInteger(s) ? String(s) : String(s);
  },

  // Main entry — returns { ok, expression, result } or null
  process(raw) {
    const n = raw.toLowerCase().trim();
    let nums, result, expr;

    // ── Natural language patterns ──────────────────────────────
    // "add 2 and 3" / "add 1, 2, 3"
    const addMatch = n.match(/^(?:add|sum|plus|total of?)\s+(.+)$/);
    if (addMatch) {
      nums = this.extractList(addMatch[1]);
      if (nums.length >= 1) { result = nums.reduce((a,b)=>a+b,0); expr = nums.join(' + '); }
    }

    // "subtract 3 from 10"
    if (result === undefined) {
      const m = n.match(/^(?:subtract|minus)\s+(.+?)\s+from\s+(.+)$/);
      if (m) { const a=this.toNum(m[1]), b=this.toNum(m[2]); if(!isNaN(a)&&!isNaN(b)){result=b-a; expr=`${b} - ${a}`;} }
    }
    // "10 minus 3"
    if (result === undefined) {
      const m = n.match(/^(.+?)\s+minus\s+(.+)$/);
      if (m) { const a=this.toNum(m[1]), b=this.toNum(m[2]); if(!isNaN(a)&&!isNaN(b)){result=a-b; expr=`${a} - ${b}`;} }
    }
    // "10 - 3" → handled by symbolic below

    // "multiply 5 by 6" / "5 times 6" / "product of 5 and 6"
    if (result === undefined) {
      const m = n.match(/^(?:multiply|product of?)\s+(.+?)\s+(?:by|and)\s+(.+)$/);
      if (m) { const a=this.toNum(m[1]), b=this.toNum(m[2]); if(!isNaN(a)&&!isNaN(b)){result=a*b; expr=`${a} × ${b}`;} }
    }
    if (result === undefined) {
      const m = n.match(/^(.+?)\s+times\s+(.+)$/);
      if (m) { const a=this.toNum(m[1]), b=this.toNum(m[2]); if(!isNaN(a)&&!isNaN(b)){result=a*b; expr=`${a} × ${b}`;} }
    }

    // "divide 10 by 2" / "10 divided by 2"
    if (result === undefined) {
      const m = n.match(/^(?:divide)\s+(.+?)\s+by\s+(.+)$/);
      if (m) { const a=this.toNum(m[1]), b=this.toNum(m[2]); if(!isNaN(a)&&!isNaN(b)&&b!==0){result=a/b; expr=`${a} ÷ ${b}`;} }
    }
    if (result === undefined) {
      const m = n.match(/^(.+?)\s+divided\s+by\s+(.+)$/);
      if (m) { const a=this.toNum(m[1]), b=this.toNum(m[2]); if(!isNaN(a)&&!isNaN(b)&&b!==0){result=a/b; expr=`${a} ÷ ${b}`;} }
    }

    // "X plus Y"
    if (result === undefined) {
      const m = n.match(/^(.+?)\s+plus\s+(.+)$/);
      if (m) { const a=this.toNum(m[1]), b=this.toNum(m[2]); if(!isNaN(a)&&!isNaN(b)){result=a+b; expr=`${a} + ${b}`;} }
    }

    // "2 to the power of 3" / "2 squared" / "2 cubed"
    if (result === undefined) {
      const m = n.match(/^(.+?)\s+(?:to the power of|raised to|power)\s+(.+)$/);
      if (m) { const a=this.toNum(m[1]), b=this.toNum(m[2]); if(!isNaN(a)&&!isNaN(b)){result=Math.pow(a,b); expr=`${a}^${b}`;} }
    }
    if (result === undefined && /squared/.test(n)) {
      const m = n.match(/^(.+?)\s+squared/);
      if (m) { const a=this.toNum(m[1]); if(!isNaN(a)){result=a*a; expr=`${a}²`;} }
    }
    if (result === undefined && /cubed/.test(n)) {
      const m = n.match(/^(.+?)\s+cubed/);
      if (m) { const a=this.toNum(m[1]); if(!isNaN(a)){result=a*a*a; expr=`${a}³`;} }
    }

    // square root / sqrt
    if (result === undefined) {
      const m = n.match(/^(?:square root of|sqrt of?|√)\s*(.+)$/);
      if (m) { const a=this.toNum(m[1]); if(!isNaN(a)){result=Math.sqrt(a); expr=`√${a}`;} }
    }

    // "calculate / compute / what is / solve" prefix — strip and re-try symbolic
    if (result === undefined) {
      const stripped = n.replace(/^(?:calculate|compute|what is|what's|solve|evaluate|calc)\s+/, '');
      if (stripped !== n) return this.process(stripped);
    }

    // ── Symbolic: pure expression like "2+3*4" or "2 + 3 * 4" ─
    if (result === undefined) {
      // Only try if it looks numeric
      if (/^[\d\s+\-*/^().%,]+$/.test(n)) {
        const cleaned = n.replace(/,/g, '');
        const r = this.evalExpr(cleaned);
        if (r !== null) { result = r; expr = cleaned; }
      }
    }

    if (result === undefined || result === null) return null;
    const formatted = this.fmt(result);
    if (formatted === null) return null;
    return { ok: true, expression: expr || raw, result: formatted };
  }
};

// ── Search / Open Engine ─────────────────────────────────────
const SearchEngine = {
  process(raw) {
    const n = raw.toLowerCase().trim();

    // "open youtube" / "go to youtube" / "youtube"
    if (/^(?:open\s+)?youtube\s*$/.test(n) || /^(?:go to|visit|launch)\s+youtube\s*$/.test(n)) {
      return { type: 'open_url', url: 'https://www.youtube.com', label: 'YouTube', response: 'Opening YouTube.' };
    }
    // "open google" / "go to google"
    if (/^(?:open\s+)?google\s*$/.test(n) || /^(?:go to|visit|launch)\s+google\s*$/.test(n)) {
      return { type: 'open_url', url: 'https://www.google.com', label: 'Google', response: 'Opening Google.' };
    }

    // "search X on youtube" / "search X youtube" / "find X on youtube"
    const ytMatch = n.match(/^(?:search|find|look up|lookup)\s+(.+?)\s+(?:on\s+)?youtube\s*$/);
    if (ytMatch) {
      const q = ytMatch[1].trim();
      return { type: 'open_url', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, label: 'YouTube', response: `Searching YouTube for "${q}".` };
    }

    // "youtube search X"
    const ytMatch2 = n.match(/^youtube\s+(?:search|find)\s+(.+)$/);
    if (ytMatch2) {
      const q = ytMatch2[1].trim();
      return { type: 'open_url', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, label: 'YouTube', response: `Searching YouTube for "${q}".` };
    }

    // "search X on google" / "google search X" / "search X google"
    const gMatch = n.match(/^(?:search|find|look up|lookup)\s+(.+?)\s+(?:on\s+)?google\s*$/);
    if (gMatch) {
      const q = gMatch[1].trim();
      return { type: 'open_url', url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: 'Google', response: `Searching Google for "${q}".` };
    }
    const gMatch2 = n.match(/^google\s+(?:search|find)\s+(.+)$/);
    if (gMatch2) {
      const q = gMatch2[1].trim();
      return { type: 'open_url', url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: 'Google', response: `Searching Google for "${q}".` };
    }

    // "search X" (default → Google)
    const searchMatch = n.match(/^(?:search|find|look up|lookup)\s+(.+)$/);
    if (searchMatch) {
      const q = searchMatch[1].trim();
      return { type: 'open_url', url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: 'Google', response: `Searching Google for "${q}".` };
    }

    return null;
  }
};

// POST /api/cue/process — CUE processing endpoint
app.post('/api/cue/process', requireAuth, (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).json({ error: 'Input required.' });

  const normalized = input.toLowerCase().trim();

  // ── Priority 1: Math Engine ──────────────────────────────────
  const mathResult = MathEngine.process(normalized);
  if (mathResult) {
    appendLog({ user_id: req.user.id, username: req.user.username, action: 'cue_calc', detail: input.slice(0, 80) });
    return res.json({
      found: true,
      type: 'calc',
      trigger: 'calculate',
      response: `${mathResult.expression} = ${mathResult.result}`
    });
  }

  // ── Priority 2: Search / Open Engine ────────────────────────
  const searchResult = SearchEngine.process(normalized);
  if (searchResult) {
    appendLog({ user_id: req.user.id, username: req.user.username, action: 'cue_search', detail: searchResult.url.slice(0, 80) });
    return res.json({
      found: true,
      type: 'open_url',
      trigger: 'search',
      url: searchResult.url,
      label: searchResult.label,
      response: searchResult.response
    });
  }

  // ── Priority 3: Memory.json lookup ──────────────────────────
  const memory = getMemory();
  for (const entry of memory) {
    const matched = (entry.keywords || []).some(kw => normalized.includes(kw.toLowerCase()));
    if (matched) {
      let response = entry.response;
      if (response === 'auto:time') {
        response = `Current time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      } else if (response === 'auto:date') {
        response = `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
      } else if (response === 'auto:status') {
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
        response = `System status: Online. Uptime: ${h}h ${m}m ${s}s. Memory entries: ${memory.length}. Users: ${getUsers().length}.`;
      }
      appendLog({ user_id: req.user.id, username: req.user.username, action: 'cue_hit', detail: entry.trigger });
      return res.json({ found: true, type: 'text', entry_id: entry.id, trigger: entry.trigger, response });
    }
  }

  appendLog({ user_id: req.user.id, username: req.user.username, action: 'cue_miss', detail: input.slice(0, 80) });
  res.json({ found: false, input });
});

// ═══════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════

// GET /api/admin/users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = getUsers().map(u => {
    const { password, ...safe } = u;
    return { ...safe, profile: getProfile(u.username) };
  });
  res.json(users);
});

// POST /api/admin/users
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (getUserByUsername(username)) return res.status(409).json({ error: 'Username already taken.' });

  const hash = await bcrypt.hash(password, 10);
  const user = { id: `usr_${uuidv4().slice(0,8)}`, username, password: hash, role: role || 'user', created_at: new Date().toISOString() };
  const users = getUsers();
  users.push(user);
  saveUsers(users);
  saveProfile(username, { username, display_name: username, age: null, bio: '', location: '', fav_things: [], theme_color: '#e8a020', joined: new Date().toISOString().split('T')[0] });
  appendLog({ user_id: req.user.id, username: req.user.username, action: 'admin_create_user', detail: username });
  const { password: _, ...safe } = user;
  res.json(safe);
});

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' });
  const users  = getUsers();
  const target = users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  saveUsers(users.filter(u => u.id !== req.params.id));
  appendLog({ user_id: req.user.id, username: req.user.username, action: 'admin_delete_user', detail: target.username });
  res.json({ success: true });
});

// PATCH /api/admin/users/:id/role
app.patch('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role.' });
  const users = getUsers();
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });
  users[idx].role = req.body.role === 'admin' ? 'admin' : 'user';
  saveUsers(users);
  appendLog({ user_id: req.user.id, username: req.user.username, action: 'admin_role_change', detail: `${users[idx].username} -> ${users[idx].role}` });
  res.json({ success: true, role: users[idx].role });
});

// GET /api/admin/logs
app.get('/api/admin/logs', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(getLogs().slice(0, limit));
});

// GET /api/admin/settings
app.get('/api/admin/settings', requireAdmin, (req, res) => res.json(getSettings()));

// PUT /api/admin/settings
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const current  = getSettings();
  const allowed  = ['app_name', 'tagline', 'allow_registration', 'max_memory_entries', 'max_log_entries'];
  const updated  = { ...current };
  allowed.forEach(k => { if (req.body[k] !== undefined) updated[k] = req.body[k]; });
  saveSettings(updated);
  appendLog({ user_id: req.user.id, username: req.user.username, action: 'admin_settings_update', detail: '' });
  res.json(updated);
});

// GET /api/admin/stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const users  = getUsers();
  const memory = getMemory();
  const logs   = getLogs();
  res.json({
    users:         users.length,
    admins:        users.filter(u => u.role === 'admin').length,
    memory_total:  memory.length,
    memory_builtin: memory.filter(m => m.type === 'builtin').length,
    memory_custom:  memory.filter(m => m.type === 'custom').length,
    log_entries:   logs.length,
    uptime_seconds: Math.floor(process.uptime())
  });
});

// ═══════════════════════════════════════════════
// SPA FALLBACK
// ═══════════════════════════════════════════════

app.get('/', (req, res) => res.redirect('/login.html'));

// ═══════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════

seedAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`[CUE] Server running → http://localhost:${PORT}`);
    console.log(`[CUE] Data directory: ${DATA_DIR}`);
  });
});
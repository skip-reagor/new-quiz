const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'responses.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-before-launch';
const SESSION_SECRET = process.env.SESSION_SECRET || 'local-development-secret-change-before-launch';
const COOKIE_NAME = 'wedding_quiz_admin';
const MAX_BODY = 16 * 1024;

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed.responses) ? parsed : { responses: [] };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read responses:', error.message);
    return { responses: [] };
  }
}

let data = loadData();
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...values] = rows;
  return values.map((valuesRow) => Object.fromEntries(headers.map((header, column) => [header, valuesRow[column] || ''])));
}
function loadQuiz() {
  const content = path.join(PUBLIC, 'content');
  const drinks = parseCsv(fs.readFileSync(path.join(content, 'drinks.csv'), 'utf8'));
  const questions = parseCsv(fs.readFileSync(path.join(content, 'questions.csv'), 'utf8')).sort((a, b) => Number(a.question_order) - Number(b.question_order));
  const answers = parseCsv(fs.readFileSync(path.join(content, 'answers.csv'), 'utf8'));
  const scoring = parseCsv(fs.readFileSync(path.join(content, 'scoring.csv'), 'utf8'));
  return {
    drinks,
    questions: questions.map((question) => ({ ...question, answers: answers.filter((answer) => answer.question_id === question.id).sort((a, b) => Number(a.answer_order) - Number(b.answer_order)).map((answer) => ({ ...answer, scores: scoring.filter((rule) => rule.answer_id === answer.id) })) })),
  };
}
function saveData() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, DATA_FILE);
}

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}

function text(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        const error = new Error('Request is too large');
        error.status = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { const error = new Error('Invalid JSON'); error.status = 400; reject(error); }
    });
    req.on('error', reject);
  });
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}
function sessionToken() {
  const payload = Buffer.from(JSON.stringify({ admin: true, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function isAdmin(req) {
  const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return false;
  const token = cookie.slice(COOKIE_NAME.length + 1);
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature.length !== sign(payload).length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); }
  catch { return false; }
}
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  json(res, 401, { error: 'Please sign in to view the dashboard.' });
  return false;
}

function cleanString(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}
function scoredDrink(answerIds) {
  const quiz = loadQuiz();
  if (!Array.isArray(answerIds) || answerIds.length !== quiz.questions.length) return null;
  const isSecretCombo = quiz.questions.every((question, index) => {
    const bottomAnswer = question.answers[question.answers.length - 1];
    return bottomAnswer && bottomAnswer.id === answerIds[index];
  });
  if (isSecretCombo) {
    const secretDrink = quiz.drinks.find((drink) => drink.id === 'adderall-only');
    if (secretDrink) return secretDrink;
  }
  const totals = Object.fromEntries(quiz.drinks.map((drink) => [drink.id, 0]));
  for (let index = 0; index < quiz.questions.length; index += 1) {
    const answer = quiz.questions[index].answers.find((item) => item.id === answerIds[index]);
    if (!answer) return null;
    for (const rule of answer.scores) totals[rule.drink_id] += Number(rule.points) || 0;
  }
  return [...quiz.drinks].sort((a, b) => totals[b.id] - totals[a.id])[0];
}
function responseSummary(response) {
  return {
    id: response.id,
    drinkId: response.drinkId,
    drinkName: response.drinkName,
    createdAt: response.createdAt,
    guestName: response.guestName || '',
    message: response.message || '',
  };
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC, relative));
  if (!filePath.startsWith(`${PUBLIC}${path.sep}`)) return text(res, 403, 'Forbidden');
  fs.readFile(filePath, (error, file) => {
    if (error) return text(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Could not load file');
    const type = path.extname(filePath) === '.html' ? 'text/html; charset=utf-8'
      : path.extname(filePath) === '.css' ? 'text/css; charset=utf-8'
      : path.extname(filePath) === '.js' ? 'text/javascript; charset=utf-8'
      : path.extname(filePath) === '.json' ? 'application/json; charset=utf-8'
      : ['.jpg', '.jpeg'].includes(path.extname(filePath)) ? 'image/jpeg'
      : path.extname(filePath) === '.png' ? 'image/png'
      : path.extname(filePath) === '.webp' ? 'image/webp'
      : path.extname(filePath) === '.svg' ? 'image/svg+xml'
      : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
    res.end(file);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/results') {
      const body = await readJson(req);
      const drink = scoredDrink(body.answers);
      if (!drink) return json(res, 400, { error: 'Please complete every quiz question.' });
      const response = { id: crypto.randomUUID(), drinkId: drink.id, drinkName: drink.name, createdAt: new Date().toISOString(), guestName: '', message: '' };
      data.responses.push(response);
      saveData();
      return json(res, 201, { responseId: response.id });
    }
    if (req.method === 'POST' && url.pathname === '/api/messages') {
      const body = await readJson(req);
      const response = data.responses.find((item) => item.id === cleanString(body.responseId, 80));
      const message = cleanString(body.message, 700);
      if (!response) return json(res, 404, { error: 'Quiz response not found. Please retake the quiz.' });
      if (!message) return json(res, 400, { error: 'Please write a message first.' });
      response.guestName = cleanString(body.guestName, 80);
      response.message = message;
      response.messageCreatedAt = new Date().toISOString();
      saveData();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const body = await readJson(req);
      const password = String(body.password || '');
      if (password.length !== ADMIN_PASSWORD.length || !crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD))) return json(res, 401, { error: 'Incorrect password.' });
      return json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE_NAME}=${sessionToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    if (req.method === 'GET' && url.pathname === '/api/admin/session') return json(res, 200, { authenticated: isAdmin(req) });
    if (req.method === 'GET' && url.pathname === '/api/admin/results') {
      if (!requireAdmin(req, res)) return;
      const responses = [...data.responses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const outcomes = responses.reduce((totals, item) => ({ ...totals, [item.drinkName]: (totals[item.drinkName] || 0) + 1 }), {});
      return json(res, 200, { totalResponses: responses.length, totalMessages: responses.filter((item) => item.message).length, outcomes, responses: responses.map(responseSummary) });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' });
  }
});

server.listen(PORT, () => console.log(`Wedding drink quiz running at http://localhost:${PORT}`));

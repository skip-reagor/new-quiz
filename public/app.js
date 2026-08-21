let quiz, index = 0, picks = [], responseId = null;
let barEasterEggTimer = null, maze = null, mazePlayer = null, mazeKeyHandler = null, mazeCellSize = 26;
const $ = (selector) => document.querySelector(selector);
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) { const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...values] = rows; return values.map((valuesRow) => Object.fromEntries(headers.map((header, column) => [header, valuesRow[column] || ''])));
}
async function loadQuiz() {
  const [drinks, questions, answers, scoring] = await Promise.all(['drinks', 'questions', 'answers', 'scoring'].map(async (name) => parseCsv(await (await fetch(`/content/${name}.csv`)).text())));
  return { drinks, questions: questions.sort((a, b) => Number(a.question_order) - Number(b.question_order)).map((question) => ({ ...question, answers: answers.filter((answer) => answer.question_id === question.id).sort((a, b) => Number(a.answer_order) - Number(b.answer_order)).map((answer) => ({ ...answer, scores: scoring.filter((rule) => rule.answer_id === answer.id) })) })) };
}

function scoreAnswers() {
  const totals = Object.fromEntries(quiz.drinks.map((drink) => [drink.id, 0]));
  quiz.questions.forEach((question, questionIndex) => {
    const answer = question.answers.find((item) => item.id === picks[questionIndex]);
    (answer?.scores || []).forEach((rule) => { totals[rule.drink_id] += Number(rule.points) || 0; });
  });
  return totals;
}
function winner() {
  const totals = scoreAnswers();
  return [...quiz.drinks].sort((a, b) => totals[b.id] - totals[a.id])[0];
}
function progress() {
  $('#progress-bar').style.width = `${(index / quiz.questions.length) * 100}%`;
  $('#step').textContent = `Question ${index + 1} of ${quiz.questions.length}`;
}
function renderQuestion() {
  clearBarEasterEggTimer();
  const question = quiz.questions[index];
  $('#quiz-view').classList.remove('hidden'); $('#result-view').classList.add('hidden'); $('#message-view').classList.add('hidden'); $('#maze-view').classList.add('hidden'); $('#end-view').classList.add('hidden');
  $('#prompt').textContent = question.prompt;
  $('#answers').replaceChildren(...question.answers.map((answer) => {
    const button = document.createElement('button'); button.className = 'answer'; button.type = 'button'; button.textContent = answer.text;
    button.onclick = () => { picks[index] = answer.id; index += 1; index === quiz.questions.length ? renderResult() : renderQuestion(); };
    return button;
  }));
  $('#back').disabled = index === 0; progress();
  if (question.id === 'marina-bar') startBarEasterEgg();
}

function clearBarEasterEggTimer() {
  if (barEasterEggTimer) { clearTimeout(barEasterEggTimer); barEasterEggTimer = null; }
}
function startBarEasterEgg() {
  barEasterEggTimer = setTimeout(() => {
    const button = $('#answers').lastElementChild;
    if (!button) return;
    button.textContent = "Ruby's on Summit";
    button.classList.add('answer--ruby');
    button.onclick = () => { clearBarEasterEggTimer(); startMaze(); };
  }, 30000);
}

function generateMaze(cols, rows) {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ N: true, S: true, E: true, W: true, visited: false })));
  const stack = [[0, 0]];
  cells[0][0].visited = true;
  const dirs = [['N', 0, -1, 'S'], ['S', 0, 1, 'N'], ['E', 1, 0, 'W'], ['W', -1, 0, 'E']];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = dirs.map(([dir, dx, dy, opp]) => ({ dir, dx, dy, opp, nx: x + dx, ny: y + dy }))
      .filter(({ nx, ny }) => nx >= 0 && nx < cols && ny >= 0 && ny < rows && !cells[ny][nx].visited);
    if (!options.length) { stack.pop(); continue; }
    const pick = options[Math.floor(Math.random() * options.length)];
    cells[y][x][pick.dir] = false; cells[pick.ny][pick.nx][pick.opp] = false;
    cells[pick.ny][pick.nx].visited = true; stack.push([pick.nx, pick.ny]);
  }
  return cells;
}
function drawMaze() {
  const canvas = $('#maze-canvas'); const ctx = canvas.getContext('2d');
  const cols = maze[0].length, rows = maze.length;
  canvas.width = cols * mazeCellSize; canvas.height = rows * mazeCellSize;
  ctx.fillStyle = '#fffaf3'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1c2a2e'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = maze[y][x]; const px = x * mazeCellSize; const py = y * mazeCellSize;
      ctx.beginPath();
      if (cell.N) { ctx.moveTo(px, py); ctx.lineTo(px + mazeCellSize, py); }
      if (cell.W) { ctx.moveTo(px, py); ctx.lineTo(px, py + mazeCellSize); }
      if (y === rows - 1 && cell.S) { ctx.moveTo(px, py + mazeCellSize); ctx.lineTo(px + mazeCellSize, py + mazeCellSize); }
      if (x === cols - 1 && cell.E) { ctx.moveTo(px + mazeCellSize, py); ctx.lineTo(px + mazeCellSize, py + mazeCellSize); }
      ctx.stroke();
    }
  }
  ctx.font = `${Math.round(mazeCellSize * 0.7)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🏟️', mazeCellSize / 2, mazeCellSize / 2);
  ctx.fillText('🍺', (cols - 0.5) * mazeCellSize, (rows - 0.5) * mazeCellSize);
  ctx.beginPath(); ctx.fillStyle = '#e0115f';
  ctx.arc((mazePlayer.x + 0.5) * mazeCellSize, (mazePlayer.y + 0.5) * mazeCellSize, mazeCellSize * 0.22, 0, Math.PI * 2);
  ctx.fill();
}
function startMaze() {
  $('#quiz-view').classList.add('hidden'); $('#result-view').classList.add('hidden'); $('#message-view').classList.add('hidden');
  $('#maze-view').classList.remove('hidden'); $('#end-view').classList.add('hidden');
  mazeCellSize = window.innerWidth < 380 ? 22 : 26;
  maze = generateMaze(11, 9);
  mazePlayer = { x: 0, y: 0 };
  drawMaze();
  mazeKeyHandler = (event) => {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    const dir = map[event.key]; if (!dir) return; event.preventDefault(); moveMaze(dir);
  };
  window.addEventListener('keydown', mazeKeyHandler);
}
function moveMaze(dir) {
  if (!maze) return;
  const cell = maze[mazePlayer.y][mazePlayer.x];
  const deltas = { up: [0, -1, 'N'], down: [0, 1, 'S'], left: [-1, 0, 'W'], right: [1, 0, 'E'] };
  const [dx, dy, wall] = deltas[dir]; if (cell[wall]) return;
  mazePlayer = { x: mazePlayer.x + dx, y: mazePlayer.y + dy };
  drawMaze();
  const cols = maze[0].length, rows = maze.length;
  if (mazePlayer.x === cols - 1 && mazePlayer.y === rows - 1) finishMaze();
}
function finishMaze() {
  if (mazeKeyHandler) { window.removeEventListener('keydown', mazeKeyHandler); mazeKeyHandler = null; }
  $('#maze-view').classList.add('hidden'); $('#end-view').classList.remove('hidden');
}
document.querySelectorAll('.dpad-btn').forEach((button) => { button.onclick = () => moveMaze(button.dataset.dir); });
async function renderResult() {
  const drink = winner();
  $('#quiz-view').classList.add('hidden'); $('#result-view').classList.remove('hidden'); $('#message-view').classList.remove('hidden'); $('#maze-view').classList.add('hidden'); $('#end-view').classList.add('hidden');
  const art = $('#drink-art');
  const photoDrinks = new Set(['mai-tai', 'miami-vice', 'lava-flow', 'blue-hawaii', 'bikini-blonde', 'modelo', 'tequila']);
  if (photoDrinks.has(drink.id)) { art.classList.add('has-photo'); art.style.backgroundImage = `url(/images/${drink.id}.jpg)`; }
  else { art.classList.remove('has-photo'); art.style.backgroundImage = ''; }
  $('#result-name').textContent = drink.title || drink.name; $('#tagline').textContent = drink.tagline || ''; $('#description').textContent = drink.description || '';
  $('#progress-bar').style.width = '100%'; $('#step').textContent = 'Your wedding drink';
  try {
    const result = await fetch('/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: picks }) });
    const payload = await result.json(); if (!result.ok) throw new Error(payload.error); responseId = payload.responseId;
  } catch { $('#message-status').textContent = 'Could not save this result. Try refreshing.'; }
}
$('#back').onclick = () => { if (index) { index -= 1; renderQuestion(); } };
$('#retake').onclick = () => { index = 0; picks = []; responseId = null; $('#message-form').reset(); $('#message-status').textContent = ''; renderQuestion(); };
$('#message-form').onsubmit = async (event) => {
  event.preventDefault(); const status = $('#message-status'); status.textContent = '';
  if (!responseId) { status.textContent = 'Your result is still saving. Please wait a moment.'; return; }
  const button = event.submitter; button.disabled = true; button.textContent = 'Sending…';
  try {
    const res = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responseId, guestName: $('#guest-name').value, message: $('#message').value }) });
    const payload = await res.json(); if (!res.ok) throw new Error(payload.error); status.textContent = 'Message sent — thank you!'; event.target.reset();
  } catch (error) { status.textContent = error.message || 'Could not send message.'; }
  finally { button.disabled = false; button.textContent = 'Send message'; }
};

loadQuiz().then((data) => { quiz = data; document.title = 'Wedding Drink Quiz'; $('#kicker').textContent = 'Wedding drink quiz'; $('#title').textContent = 'What Wedding Drink Are You?'; $('#intro').textContent = 'A few questions. One delightfully unscientific drink assignment. Answer honestly—or don’t.'; renderQuestion(); }).catch(() => { $('#intro').textContent = 'The quiz could not be loaded. Please refresh and try again.'; });

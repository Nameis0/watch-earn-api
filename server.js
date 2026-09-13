const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = '8439244872:AAFiAPlZhrf5hG1odhZ25Y6oGbrCtNyaRVY';
const TELEGRAM_CHAT_ID = '8954689240';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'దయచేసి కాసేపు వేచి ఉండండి.' }
});
app.use('/api/', apiLimiter);

const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    device_id TEXT UNIQUE,
    coins INTEGER DEFAULT 100,
    total_earned INTEGER DEFAULT 100,
    spins INTEGER DEFAULT 3,
    last_spin_refill INTEGER DEFAULT 0,
    payout_address TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS completed_tasks (
    user_id TEXT,
    task_name TEXT,
    PRIMARY KEY (user_id, task_name)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    device_id TEXT,
    amount INTEGER,
    coins INTEGER,
    method TEXT,
    address TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

const adSessions = new Map();

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

// 2 HOURS AUTO REFILL LOGIC (ప్రతి 2 గంటలకు 2 స్పిన్లు ఆటోమేటిక్ రీఫిల్)
function checkAndRefillSpins(user, callback) {
  const now = Date.now();
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  
  if (!user.last_spin_refill) {
    db.run(`UPDATE users SET last_spin_refill = ? WHERE id = ?`, [now, user.id], () => {
      callback(user.spins);
    });
    return;
  }

  const elapsed = now - user.last_spin_refill;
  if (elapsed >= TWO_HOURS_MS) {
    const cycles = Math.floor(elapsed / TWO_HOURS_MS);
    const addedSpins = cycles * 2;
    const newSpins = Math.min(6, (user.spins || 0) + addedSpins); // Max 6 spins cap
    const updatedTime = user.last_spin_refill + (cycles * TWO_HOURS_MS);

    db.run(`UPDATE users SET spins = ?, last_spin_refill = ? WHERE id = ?`, [newSpins, updatedTime, user.id], () => {
      callback(newSpins);
    });
  } else {
    callback(user.spins);
  }
}

// 1. LOGIN API
app.post('/api/login', (req, res) => {
  const { identifier, deviceId } = req.body;
  if (!identifier || !deviceId || identifier.length < 3) {
    return res.status(400).json({ success: false, message: 'సరైన వివరాలు ఇవ్వండి!' });
  }

  db.get(`SELECT * FROM users WHERE device_id = ?`, [deviceId], (err, row) => {
    if (err) return res.status(500).json({ success: false });

    if (row && row.id !== identifier) {
      return res.status(403).json({ 
        success: false, 
        message: 'ఈ మొబైల్‌లో ఇప్పటికే వేరే ఖాతా ఉంది! 1 Device = 1 ID మాత్రమే.' 
      });
    }

    db.get(`SELECT * FROM users WHERE id = ?`, [identifier], (err, user) => {
      db.all(`SELECT task_name FROM completed_tasks WHERE user_id = ?`, [identifier], (err, tasks) => {
        const doneTasks = tasks ? tasks.map(t => t.task_name) : [];
        if (!user) {
          const now = Date.now();
          db.run(`INSERT INTO users (id, device_id, coins, total_earned, spins, last_spin_refill) VALUES (?, ?, 100, 100, 3, ?)`,
            [identifier, deviceId, now], (err) => {
              if (err) return res.status(500).json({ success: false });
              res.json({ success: true, user: { id: identifier, device_id: deviceId, coins: 100, spins: 3, payout_address: '' }, doneTasks: [] });
          });
        } else {
          checkAndRefillSpins(user, (updatedSpins) => {
            user.spins = updatedSpins;
            res.json({ success: true, user, doneTasks });
          });
        }
      });
    });
  });
});

// 2. AD START
app.post('/api/ad/start', (req, res) => {
  const { identifier, adId, isSpecial30 } = req.body;
  if (!identifier) return res.status(400).json({ success: false });

  const sessionId = makeToken();
  adSessions.set(sessionId, {
    userId: identifier,
    adId: Number(adId),
    isSpecial30: !!isSpecial30,
    startTime: Date.now()
  });

  res.json({ success: true, sessionId });
});

// 3. AD VERIFY
app.post('/api/ad/verify', (req, res) => {
  const { sessionId } = req.body;
  const session = adSessions.get(sessionId);

  if (!session) {
    return res.status(400).json({ success: false, message: 'యాడ్ సెషన్ గడువు ముగిసింది!' });
  }

  const elapsed = (Date.now() - session.startTime) / 1000;
  const reqTime = session.isSpecial30 ? 29.5 : 14.5;

  if (elapsed < reqTime) {
    adSessions.delete(sessionId);
    return res.status(403).json({ success: false, message: 'పూర్తి సమయం వరకు యాడ్ చూడాలి!' });
  }

  adSessions.delete(sessionId);

  if (session.isSpecial30) {
    db.run(`UPDATE users SET coins = coins + 100, total_earned = total_earned + 100 WHERE id = ?`,
      [session.userId], (err) => {
        if (err) return res.status(500).json({ success: false });
        db.get(`SELECT coins, spins FROM users WHERE id = ?`, [session.userId], (err, row) => {
          res.json({ success: true, balance: row.coins, spins: row.spins, reward: 100 });
        });
    });
  } else {
    const reward = session.adId === 1 ? 50 : 70;
    db.run(`UPDATE users SET coins = coins + ?, total_earned = total_earned + ? WHERE id = ?`,
      [reward, reward, session.userId], (err) => {
        if (err) return res.status(500).json({ success: false });
        db.get(`SELECT coins, spins FROM users WHERE id = ?`, [session.userId], (err, row) => {
          res.json({ success: true, balance: row.coins, spins: row.spins, reward });
        });
    });
  }
});

// 4. WATCH AD TO GET +1 SPIN
app.post('/api/spin/refill', (req, res) => {
  const { identifier } = req.body;
  db.run(`UPDATE users SET spins = spins + 1 WHERE id = ?`, [identifier], (err) => {
    if (err) return res.status(500).json({ success: false });
    db.get(`SELECT spins FROM users WHERE id = ?`, [identifier], (err, row) => {
      res.json({ success: true, spins: row.spins });
    });
  });
});

// 5. PRECISE SPIN API
app.post('/api/spin', (req, res) => {
  const { identifier } = req.body;

  db.get(`SELECT * FROM users WHERE id = ?`, [identifier], (err, user) => {
    if (!user) return res.status(404).json({ success: false });

    checkAndRefillSpins(user, (currentSpins) => {
      if (currentSpins <= 0) {
        return res.status(403).json({ success: false, message: 'స్పిన్లు అయిపోయాయి! యాడ్ చూసి కొత్త స్పిన్ పొందండి లేదా 2 గంటలు ఆగండి.' });
      }

      // 8 Segments Array: exact order matches visual canvas
      const prizes = [100, 30, 5, 100, 20, 100, 50, 10];
      const prizeIndex = Math.floor(Math.random() * prizes.length);
      const prize = prizes[prizeIndex];

      if (prize === 100) {
        db.run(`UPDATE users SET spins = spins - 1 WHERE id = ?`, [identifier], (err) => {
          if (err) return res.status(500).json({ success: false });
          res.json({ success: true, prize, prizeIndex, spins: currentSpins - 1, balance: user.coins, requires30sAd: true });
        });
      } else {
        db.run(`UPDATE users SET coins = coins + ?, total_earned = total_earned + ?, spins = spins - 1 WHERE id = ?`,
          [prize, prize, identifier], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, prize, prizeIndex, spins: currentSpins - 1, balance: user.coins + prize, requires30sAd: false });
        });
      }
    });
  });
});

// 6. GAME EARNING REWARD
app.post('/api/game/reward', (req, res) => {
  const { identifier, gameName } = req.body;
  const reward = 25; // 25 coins per game played
  db.run(`UPDATE users SET coins = coins + ?, total_earned = total_earned + ? WHERE id = ?`,
    [reward, reward, identifier], (err) => {
      if (err) return res.status(500).json({ success: false });
      db.get(`SELECT coins FROM users WHERE id = ?`, [identifier], (err, row) => {
        res.json({ success: true, balance: row.coins, reward });
      });
  });
});

// 7. PROFILE & WITHDRAWALS
app.post('/api/profile/update-address', (req, res) => {
  const { identifier, payoutAddress } = req.body;
  db.run(`UPDATE users SET payout_address = ? WHERE id = ?`, [payoutAddress, identifier], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

app.post('/api/task/claim', (req, res) => {
  const { identifier, coins, taskName } = req.body;
  db.get(`SELECT * FROM completed_tasks WHERE user_id = ? AND task_name = ?`, [identifier, taskName], (err, row) => {
    if (row) return res.status(400).json({ success: false, message: 'ఈ టాస్క్ ఇప్పటికే పూర్తయింది!' });

    db.run(`INSERT INTO completed_tasks (user_id, task_name) VALUES (?, ?)`, [identifier, taskName], (err) => {
      if (err) return res.status(500).json({ success: false });
      db.run(`UPDATE users SET coins = coins + ?, total_earned = total_earned + ? WHERE id = ?`, [coins, coins, identifier], () => {
        db.get(`SELECT coins FROM users WHERE id = ?`, [identifier], (err, user) => {
          res.json({ success: true, balance: user.coins, taskName });
        });
      });
    });
  });
});

app.post('/api/withdraw', async (req, res) => {
  const { identifier, amount, coins, method, address } = req.body;
  db.get(`SELECT * FROM users WHERE id = ?`, [identifier], async (err, user) => {
    if (!user || user.coins < coins) {
      return res.status(400).json({ success: false, message: 'తగినన్ని కాయిన్లు లేవు!' });
    }

    db.run(`UPDATE users SET coins = coins - ? WHERE id = ?`, [coins, identifier]);
    db.run(`INSERT INTO withdrawals (user_id, device_id, amount, coins, method, address) VALUES (?, ?, ?, ?, ?, ?)`,
      [identifier, user.device_id, amount, coins, method, address]);

    const msg = `🚨 *New Withdrawal Request!*\n\n👤 *User ID:* \`${identifier}\`\n📱 *Device:* \`${user.device_id}\`\n💰 *Amount:* ₹${amount}\n🪙 *Coins Deducted:* ${coins}\n💳 *Method:* ${method}\n📍 *UPI/Paytm:* \`${address}\`\n🕒 *Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

    try {
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
      });
    } catch (e) {}

    res.json({ success: true, balance: user.coins - coins });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Watch & Earn Pro is Live at http://localhost:${PORT}`);
});

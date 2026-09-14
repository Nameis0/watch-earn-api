const express = require('express');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const app = express();

app.use(cors());
app.use(express.json());

const DB_FILE = './db.json';
const BOT_TOKEN = '8439244872:AAFiAPlZhrf5hG1odhZ25Y6oGbrCtNyaRVY';
const CHAT_ID = '8954689240';

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { users: [], withdrawals: [], tasks: [], devices: {} };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sendTelegramNotification(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(text)}&parse_mode=HTML`;
  https.get(url, (res) => {}).on('error', (e) => console.error('Telegram Bot Error:', e));
}

// User Sync / Register / Login
app.post('/api/user/sync', (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ success: false, message: 'Invalid ID' });

  const db = readDB();
  let user = db.users.find(u => u.identifier === identifier || u.id === identifier);

  if (!user) {
    user = {
      id: identifier,
      identifier: identifier,
      coins: 100,
      balance: 100,
      spins: 5,
      payout_address: '',
      adsWatched: 0,
      claimedTasks: [],
      streak: 1,
      lastClaimDate: null,
      referredBy: null,
      refCount: 0
    };
    db.users.push(user);
    writeDB(db);
  }

  res.json({
    success: true,
    coins: user.coins !== undefined ? user.coins : user.balance,
    balance: user.balance !== undefined ? user.balance : user.coins,
    spins: user.spins,
    claimedTasks: user.claimedTasks || [],
    streak: user.streak || 1,
    refCount: user.refCount || 0
  });
});

// Ad Verify
app.post('/api/ad/verify', (req, res) => {
  const { identifier, coins, reward } = req.body;
  const rewardCoins = Number(coins || reward || 20);
  const db = readDB();
  let user = db.users.find(u => u.identifier === identifier || u.id === identifier);

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  user.coins = (user.coins || 0) + rewardCoins;
  user.balance = user.coins;
  user.adsWatched = (user.adsWatched || 0) + 1;
  writeDB(db);

  res.json({ success: true, balance: user.coins, coins: user.coins, reward: rewardCoins });
});

// Task Claim (YouTube / Telegram / Daily)
app.post('/api/task/claim', (req, res) => {
  const { identifier, taskType, reward } = req.body;
  const rewardCoins = Number(reward || 50);
  const db = readDB();
  let user = db.users.find(u => u.identifier === identifier || u.id === identifier);

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (!user.claimedTasks) user.claimedTasks = [];

  if (user.claimedTasks.includes(taskType)) {
    return res.json({ success: false, message: 'Task already claimed!' });
  }

  user.claimedTasks.push(taskType);
  user.coins = (user.coins || 0) + rewardCoins;
  user.balance = user.coins;
  writeDB(db);

  res.json({ success: true, balance: user.coins, message: 'Task reward claimed!' });
});

// Spin Play Math
const SECTORS = [100, 30, 5, 100, 20, 100, 50, 10];
app.post('/api/spin/play', (req, res) => {
  const { identifier } = req.body;
  const db = readDB();
  let user = db.users.find(u => u.identifier === identifier || u.id === identifier);

  if (!user) return res.status(404).json({ success: false });
  if ((user.spins || 0) <= 0) {
    return res.json({ success: false, message: 'No spins left!' });
  }

  user.spins -= 1;
  const targetIndex = Math.floor(Math.random() * SECTORS.length);
  const prize = SECTORS[targetIndex];

  if (prize === 100) {
    writeDB(db);
    return res.json({ success: true, targetIndex, prize, spinsLeft: user.spins, requires30sAd: true });
  }

  user.coins = (user.coins || 0) + prize;
  user.balance = user.coins;
  writeDB(db);

  res.json({ success: true, targetIndex, prize, balance: user.coins, spinsLeft: user.spins, requires30sAd: false });
});

// Spin Refill
app.post('/api/spin/refill', (req, res) => {
  const { identifier } = req.body;
  const db = readDB();
  let user = db.users.find(u => u.identifier === identifier || u.id === identifier);

  if (!user) return res.status(404).json({ success: false });
  user.spins = (user.spins || 0) + 3;
  writeDB(db);

  res.json({ success: true, spins: user.spins });
});

// Withdrawal with Telegram Bot Push
app.post('/api/withdraw/request', (req, res) => {
  const { identifier, coins, account, method } = req.body;
  const reqCoins = Number(coins);
  const db = readDB();
  let user = db.users.find(u => u.identifier === identifier || u.id === identifier);

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if ((user.coins || 0) < reqCoins) {
    return res.json({ success: false, message: 'Insufficient balance' });
  }

  user.coins -= reqCoins;
  user.balance = user.coins;

  const wReq = {
    id: Date.now(),
    user: identifier,
    coins: reqCoins,
    account: account,
    method: method,
    date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  };

  if (!db.withdrawals) db.withdrawals = [];
  db.withdrawals.push(wReq);
  writeDB(db);

  // Send Direct Telegram Alert
  const msg = `🔔 <b>NEW WITHDRAWAL REQUEST</b>\n\n` +
              `👤 <b>User:</b> <code>${identifier}</code>\n` +
              `💰 <b>Amount:</b> ${reqCoins} Coins (₹${reqCoins / 100})\n` +
              `💳 <b>Method:</b> ${method}\n` +
              `📲 <b>Details:</b> <code>${account}</code>\n` +
              `⏰ <b>Time:</b> ${wReq.date}`;

  sendTelegramNotification(msg);

  res.json({ success: true, balance: user.coins, message: 'Withdrawal submitted!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

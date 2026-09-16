const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CHAT_ID = process.env.CHAT_ID || 'YOUR_CHAT_ID_HERE';

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

// Send Telegram Notification with Inline Buttons
function sendTelegramNotification(text, wId = null) {
  const payloadData = {
    chat_id: CHAT_ID,
    text: text,
    parse_mode: 'HTML'
  };

  if (wId) {
    payloadData.reply_markup = {
      inline_keyboard: [
        [
          { text: "Approve ✅", callback_data: `approve_${wId}` },
          { text: "Reject ❌", callback_data: `reject_${wId}` }
        ]
      ]
    };
  }

  const payload = JSON.stringify(payloadData);
  const req = https.request(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, () => {});

  req.on('error', (e) => console.error('Telegram Error:', e));
  req.write(payload);
  req.end();
}

// User Sync / Register / Login
app.post('/api/user/sync', (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ success: false, message: 'Invalid ID' });

  const db = readDB();
  let user = (db.users || []).find(u => u.identifier === identifier);

  if (!user) {
    user = {
      identifier,
      coins: 10000,
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    writeDB(db);
  }

  res.json({ success: true, user });
});

// Withdrawal Request Route
app.post('/api/withdraw', (req, res) => {
  const { identifier, reqCoins, method, account } = req.body;
  if (!identifier || !reqCoins || !method || !account) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }

  const db = readDB();
  const user = (db.users || []).find(u => u.identifier === identifier);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (user.coins < reqCoins) {
    return res.status(400).json({ success: false, message: 'Insufficient coins' });
  }

  // Deduct coins & create withdrawal record
  user.coins -= reqCoins;

  const wReq = {
    id: Date.now().toString(),
    identifier,
    coins: reqCoins,
    amount: reqCoins / 100,
    method,
    account,
    status: 'Pending',
    date: new Date().toLocaleString()
  };

  db.withdrawals = db.withdrawals || [];
  db.withdrawals.push(wReq);
  writeDB(db);

  // Send Direct Telegram Alert with Buttons
  const msg = `🔔 <b>NEW WITHDRAWAL REQUEST</b>\n\n` +
              `👤 <b>User:</b> <code>${identifier}</code>\n` +
              `💰 <b>Amount:</b> ${reqCoins} Coins (₹${reqCoins / 100})\n` +
              `💳 <b>Method:</b> ${method}\n` +
              `📲 <b>Details:</b> <code>${account}</code>\n` +
              `⏰ <b>Time:</b> ${wReq.date}`;

  sendTelegramNotification(msg, wReq.id);

  res.json({ success: true, balance: user.coins, message: 'Withdrawal submitted!' });
});

// Telegram Webhook Handler (Button Click Response)
app.post('/api/telegram-webhook', (req, res) => {
  const update = req.body;
  if (update && update.callback_query) {
    const cb = update.callback_query;
    const [action, wId] = (cb.data || '').split('_');

    const db = readDB();
    const item = (db.withdrawals || []).find(w => String(w.id) === String(wId));

    if (item) {
      item.status = action === 'approve' ? 'Approved' : 'Rejected';
      writeDB(db);

      const statusBadge = action === 'approve' ? 'Approved ✅' : 'Rejected ❌';
      const editPayload = JSON.stringify({
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text}\n\n👉 <b>Status: ${statusBadge}</b>`,
        parse_mode: 'HTML'
      });

      const editReq = https.request(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(editPayload)
        }
      }, () => {});
      editReq.write(editPayload);
      editReq.end();
    }

    // Stop loading indicator on the Telegram button
    https.get(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery?callback_query_id=${cb.id}`);
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

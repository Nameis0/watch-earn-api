const express = require('express');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({ users: [], withdrawals: [] }).write();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'API is running successfully', timestamp: new Date() });
});

app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  let user = db.get('users').find({ id: userId }).value();
  if (!user) {
    user = { id: userId, balance: 0, adsWatched: 0 };
    db.get('users').push(user).write();
  }
  res.json(user);
});

app.post('/api/reward', (req, res) => {
  const { userId, rewardPoints } = req.body;
  let user = db.get('users').find({ id: userId }).value();

  if (!user) {
    user = { id: userId, balance: Number(rewardPoints) || 10, adsWatched: 1 };
    db.get('users').push(user).write();
  } else {
    const updatedBalance = (user.balance || 0) + (Number(rewardPoints) || 10);
    const updatedAds = (user.adsWatched || 0) + 1;
    db.get('users').find({ id: userId }).assign({ balance: updatedBalance, adsWatched: updatedAds }).write();
    user = db.get('users').find({ id: userId }).value();
  }

  res.json({ success: true, balance: user.balance, adsWatched: user.adsWatched });
});

app.post('/api/withdraw', (req, res) => {
  const { userId, amount, upiId } = req.body;
  const user = db.get('users').find({ id: userId }).value();

  if (!user || user.balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  db.get('users').find({ id: userId }).assign({ balance: user.balance - amount }).write();
  db.get('withdrawals').push({ userId, amount, upiId, date: new Date(), status: 'Pending' }).write();

  res.json({ success: true, message: 'Withdrawal request submitted', remainingBalance: user.balance - amount });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

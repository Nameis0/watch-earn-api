const express = require('express');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({ users: [], withdrawals: [], tasks: [] }).write();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'API is running successfully', timestamp: new Date() });
});

// Login / Register Endpoint
app.post('/api/login', (req, res) => {
  const { phone, hardwareId } = req.body;
  const id = phone || hardwareId || 'user_' + Date.now();
  let user = db.get('users').find({ id }).value();
  if (!user) {
    user = {
      id,
      phone: phone || '',
      balance: 100,
      spins: 5,
      adsWatched: 0,
      claimedTasks: []
    };
    db.get('users').push(user).write();
  }
  res.json({ success: true, user });
});

// User Profile Fetch
app.get('/api/user/:id', (req, res) => {
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Spin Wheel Endpoint
app.post('/api/spin', (req, res) => {
  const { userId, points } = req.body;
  let user = db.get('users').find({ id: userId });
  if (user.value()) {
    const newBal = (user.value().balance || 0) + (points || 0);
    const spins = Math.max(0, (user.value().spins || 1) - 1);
    user.assign({ balance: newBal, spins }).write();
    return res.json({ success: true, balance: newBal, spins });
  }
  res.json({ success: true, balance: points || 0 });
});

// Spin Refill Endpoint
app.post('/api/spin/refill', (req, res) => {
  const { userId } = req.body;
  let user = db.get('users').find({ id: userId });
  if (user.value()) {
    user.assign({ spins: (user.value().spins || 0) + 3 }).write();
    return res.json({ success: true, spins: user.value().spins });
  }
  res.json({ success: true, spins: 3 });
});

// Ad Start / Verify Endpoints
app.post('/api/ad/start', (req, res) => {
  res.json({ success: true, token: 'ad_session_' + Date.now() });
});

app.post('/api/ad/verify', (req, res) => {
  const { userId, reward = 20 } = req.body;
  let user = db.get('users').find({ id: userId });
  if (user.value()) {
    const newBal = (user.value().balance || 0) + reward;
    const ads = (user.value().adsWatched || 0) + 1;
    user.assign({ balance: newBal, adsWatched: ads }).write();
    return res.json({ success: true, balance: newBal, adsWatched: ads });
  }
  res.json({ success: true, balance: reward });
});

// Task Claim Endpoint
app.post('/api/task/claim', (req, res) => {
  const { userId, reward = 50, taskId } = req.body;
  let user = db.get('users').find({ id: userId });
  if (user.value()) {
    const newBal = (user.value().balance || 0) + reward;
    user.assign({ balance: newBal }).write();
    return res.json({ success: true, balance: newBal });
  }
  res.json({ success: true, balance: reward });
});

// Reward Generic Endpoint
app.post('/api/reward', (req, res) => {
  const { userId, rewardPoints = 10 } = req.body;
  let user = db.get('users').find({ id: userId });
  if (user.value()) {
    const newBal = (user.value().balance || 0) + rewardPoints;
    user.assign({ balance: newBal }).write();
    return res.json({ success: true, balance: newBal });
  }
  res.json({ success: true, balance: rewardPoints });
});

// Withdraw Endpoint
app.post('/api/withdraw', (req, res) => {
  const { userId, amount, upiId } = req.body;
  const withdrawal = { id: Date.now(), userId, amount, upiId, status: 'pending', date: new Date() };
  db.get('withdrawals').push(withdrawal).write();
  res.json({ success: true, message: 'Withdrawal request received', withdrawal });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

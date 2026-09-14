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
  const { identifier, phone, deviceId, hardwareId } = req.body;
  const id = identifier || phone || deviceId || hardwareId || 'user_' + Date.now();
  let user = db.get('users').find({ id }).value();
  
  if (!user) {
    user = {
      id,
      identifier: id,
      coins: 100,
      balance: 100,
      spins: 5,
      payout_address: '',
      adsWatched: 0,
      claimedTasks: []
    };
    db.get('users').push(user).write();
  } else {
    // backward compatibility
    if (user.coins === undefined) user.coins = user.balance || 100;
    if (user.spins === undefined) user.spins = 5;
    if (!user.claimedTasks) user.claimedTasks = [];
  }

  res.json({
    success: true,
    user,
    doneTasks: user.claimedTasks || []
  });
});

// User Profile Fetch
app.get('/api/user/:id', (req, res) => {
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Spin Wheel Endpoint
app.post('/api/spin', (req, res) => {
  const { userId, points, identifier } = req.body;
  const id = userId || identifier;
  let user = db.get('users').find({ id });
  if (user.value()) {
    const newCoins = (user.value().coins || user.value().balance || 0) + (points || 0);
    const spins = Math.max(0, (user.value().spins || 1) - 1);
    user.assign({ coins: newCoins, balance: newCoins, spins }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins, spins });
  }
  res.json({ success: true, coins: points || 0, balance: points || 0, spins: 0 });
});

// Spin Refill Endpoint
app.post('/api/spin/refill', (req, res) => {
  const { userId, identifier } = req.body;
  const id = userId || identifier;
  let user = db.get('users').find({ id });
  if (user.value()) {
    const updatedSpins = (user.value().spins || 0) + 3;
    user.assign({ spins: updatedSpins }).write();
    return res.json({ success: true, spins: updatedSpins });
  }
  res.json({ success: true, spins: 3 });
});

// Ad Start & Verify
app.post('/api/ad/start', (req, res) => {
  res.json({ success: true, token: 'ad_session_' + Date.now() });
});

app.post('/api/ad/verify', (req, res) => {
  const { userId, identifier, reward = 50 } = req.body;
  const id = userId || identifier;
  let user = db.get('users').find({ id });
  if (user.value()) {
    const newCoins = (user.value().coins || user.value().balance || 0) + reward;
    const ads = (user.value().adsWatched || 0) + 1;
    user.assign({ coins: newCoins, balance: newCoins, adsWatched: ads }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins, adsWatched: ads });
  }
  res.json({ success: true, coins: reward, balance: reward });
});

// Task Claim Endpoint
app.post('/api/task/claim', (req, res) => {
  const { userId, identifier, reward = 50, taskType } = req.body;
  const id = userId || identifier;
  let user = db.get('users').find({ id });
  if (user.value()) {
    const currentTasks = user.value().claimedTasks || [];
    if (taskType && !currentTasks.includes(taskType)) {
      currentTasks.push(taskType);
    }
    const newCoins = (user.value().coins || user.value().balance || 0) + reward;
    user.assign({ coins: newCoins, balance: newCoins, claimedTasks: currentTasks }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins, doneTasks: currentTasks });
  }
  res.json({ success: true, coins: reward });
});

// Update Payout Address
app.post('/api/profile/update-address', (req, res) => {
  const { userId, identifier, address } = req.body;
  const id = userId || identifier;
  let user = db.get('users').find({ id });
  if (user.value()) {
    user.assign({ payout_address: address }).write();
    return res.json({ success: true, payout_address: address });
  }
  res.json({ success: true });
});

// Reward Generic Endpoint
app.post('/api/reward', (req, res) => {
  const { userId, rewardPoints = 10 } = req.body;
  let user = db.get('users').find({ id: userId });
  if (user.value()) {
    const newCoins = (user.value().coins || user.value().balance || 0) + rewardPoints;
    user.assign({ coins: newCoins, balance: newCoins }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins });
  }
  res.json({ success: true, balance: rewardPoints });
});

// Withdraw Endpoint
app.post('/api/withdraw', (req, res) => {
  const { userId, identifier, amount, upiId } = req.body;
  const id = userId || identifier;
  const withdrawal = { id: Date.now(), userId: id, amount, upiId, status: 'pending', date: new Date() };
  db.get('withdrawals').push(withdrawal).write();
  res.json({ success: true, message: 'Withdrawal request submitted!', withdrawal });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

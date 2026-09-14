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

// Login / Register
app.post('/api/login', (req, res) => {
  const { identifier, phone, deviceId, hardwareId } = req.body;
  const id = String(identifier || phone || deviceId || hardwareId || 'user_' + Date.now());
  let user = db.get('users').find({ id }).value();
  
  if (!user) {
    user = {
      id,
      identifier: id,
      coins: 20000,
      balance: 20000,
      spins: 50,
      payout_address: '',
      adsWatched: 0,
      claimedTasks: []
    };
    db.get('users').push(user).write();
  } else {
    if (user.coins === undefined) user.coins = user.balance || 20000;
    if (user.spins === undefined) user.spins = 50;
    if (!user.claimedTasks) user.claimedTasks = [];
  }

  res.json({
    success: true,
    user,
    doneTasks: user.claimedTasks || []
  });
});

// Task Claim Endpoint
app.post('/api/task/claim', (req, res) => {
  const { userId, identifier, coins, reward, taskName, taskType } = req.body;
  const id = String(userId || identifier);
  const amount = Number(coins || reward || 50);
  const task = taskName || taskType || 'Task';

  let user = db.get('users').find({ id });
  if (user.value()) {
    const currentTasks = user.value().claimedTasks || [];
    if (!currentTasks.includes(task)) {
      currentTasks.push(task);
    }
    const newCoins = Number(user.value().coins || user.value().balance || 0) + amount;
    user.assign({ coins: newCoins, balance: newCoins, claimedTasks: currentTasks }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins, doneTasks: currentTasks });
  }
  res.json({ success: true, coins: amount, balance: amount });
});

// Ad Verify Endpoint
app.post('/api/ad/verify', (req, res) => {
  const { userId, identifier, coins, reward } = req.body;
  const id = String(userId || identifier);
  const amount = Number(coins || reward || 50);

  let user = db.get('users').find({ id });
  if (user.value()) {
    const newCoins = Number(user.value().coins || user.value().balance || 0) + amount;
    const ads = Number(user.value().adsWatched || 0) + 1;
    user.assign({ coins: newCoins, balance: newCoins, adsWatched: ads }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins, adsWatched: ads });
  }
  res.json({ success: true, coins: amount, balance: amount });
});

// Spin Wheel Endpoint
app.post('/api/spin', (req, res) => {
  const { userId, identifier, points, coins } = req.body;
  const id = String(userId || identifier);
  const amount = Number(points || coins || 0);

  let user = db.get('users').find({ id });
  if (user.value()) {
    const newCoins = Number(user.value().coins || user.value().balance || 0) + amount;
    const spins = Math.max(0, Number(user.value().spins || 1) - 1);
    user.assign({ coins: newCoins, balance: newCoins, spins }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins, spins });
  }
  res.json({ success: true, coins: amount, balance: amount, spins: 0 });
});

// Spin Refill Endpoint
app.post('/api/spin/refill', (req, res) => {
  const { userId, identifier } = req.body;
  const id = String(userId || identifier);
  let user = db.get('users').find({ id });
  if (user.value()) {
    const updatedSpins = Number(user.value().spins || 0) + 3;
    user.assign({ spins: updatedSpins }).write();
    return res.json({ success: true, spins: updatedSpins });
  }
  res.json({ success: true, spins: 3 });
});

// Generic Reward / Game Reward
app.post(['/api/reward', '/api/game/reward'], (req, res) => {
  const { userId, identifier, rewardPoints, coins, reward } = req.body;
  const id = String(userId || identifier);
  const amount = Number(rewardPoints || coins || reward || 10);

  let user = db.get('users').find({ id });
  if (user.value()) {
    const newCoins = Number(user.value().coins || user.value().balance || 0) + amount;
    user.assign({ coins: newCoins, balance: newCoins }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins });
  }
  res.json({ success: true, balance: amount });
});

// Update Payout Address
app.post('/api/profile/update-address', (req, res) => {
  const { userId, identifier, address } = req.body;
  const id = String(userId || identifier);
  let user = db.get('users').find({ id });
  if (user.value()) {
    user.assign({ payout_address: address }).write();
    return res.json({ success: true, payout_address: address });
  }
  res.json({ success: true });
});

// Withdraw Endpoint
app.post('/api/withdraw', (req, res) => {
  const { userId, identifier, amount, upiId } = req.body;
  const id = String(userId || identifier);
  const withdrawal = { id: Date.now(), userId: id, amount, upiId, status: 'pending', date: new Date() };
  db.get('withdrawals').push(withdrawal).write();
  res.json({ success: true, message: 'Withdrawal request submitted!', withdrawal });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

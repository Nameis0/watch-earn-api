const express = require('express');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({ users: [], devices: {}, withdrawals: [], tasks: [] }).write();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Wheel slices clockwise starting from top (0 deg) matching frontend canvas:
// [100, 20, 100, 50, 10, 100, 30, 5]
const WHEEL_SECTORS = [100, 20, 100, 50, 10, 100, 30, 5];

app.get('/', (req, res) => {
  res.json({ status: 'API is running successfully', timestamp: new Date() });
});

// Strict Single-Device Login / Register
app.post('/api/login', (req, res) => {
  const { identifier, phone, deviceId } = req.body;
  const devId = String(deviceId || 'unknown_device');
  const userPhone = String(identifier || phone || '').trim();

  if (!userPhone) {
    return res.status(400).json({ success: false, message: 'Please enter mobile number' });
  }

  // Device-Lock Check
  let deviceMap = db.get('devices').value() || {};
  if (deviceMap[devId] && deviceMap[devId] !== userPhone) {
    return res.status(403).json({
      success: false,
      message: `Device locked to account: ${deviceMap[devId]}. Multiple accounts prohibited!`
    });
  }

  let user = db.get('users').find({ id: userPhone }).value();
  if (!user) {
    user = {
      id: userPhone,
      identifier: userPhone,
      coins: 20000,
      balance: 20000,
      spins: 50,
      payout_address: '',
      deviceId: devId,
      adsWatched: 0,
      claimedTasks: []
    };
    db.get('users').push(user).write();
    deviceMap[devId] = userPhone;
    db.set('devices', deviceMap).write();
  } else {
    if (!deviceMap[devId]) {
      deviceMap[devId] = userPhone;
      db.set('devices', deviceMap).write();
    }
  }

  res.json({
    success: true,
    user,
    balance: user.coins,
    doneTasks: user.claimedTasks || []
  });
});

// Spin Wheel Endpoint
app.post('/api/spin', (req, res) => {
  const { identifier, userId } = req.body;
  const id = String(identifier || userId);
  let user = db.get('users').find({ id });

  if (!user.value()) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  let currentSpins = user.value().spins ?? 50;
  if (currentSpins <= 0) {
    return res.json({ success: false, message: 'No spins left! Refill required.' });
  }

  const prizeIndex = Math.floor(Math.random() * WHEEL_SECTORS.length);
  const prize = WHEEL_SECTORS[prizeIndex];
  const requires30sAd = (prize === 100);

  currentSpins = Math.max(0, currentSpins - 1);
  let currentCoins = Number(user.value().coins || 0);

  if (!requires30sAd) {
    currentCoins += prize;
  }

  user.assign({ coins: currentCoins, balance: currentCoins, spins: currentSpins }).write();

  res.json({
    success: true,
    prizeIndex,
    prize,
    requires30sAd,
    spins: currentSpins,
    coins: currentCoins,
    balance: currentCoins
  });
});

// One-Time Tasks with Permanent Duplicate Guard
app.post('/api/task/claim', (req, res) => {
  const { identifier, userId, coins, taskName } = req.body;
  const id = String(identifier || userId);
  const task = String(taskName || 'Task');
  const amount = Number(coins || 50);

  let user = db.get('users').find({ id });
  if (!user.value()) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  let currentTasks = user.value().claimedTasks || [];
  if (currentTasks.includes(task)) {
    return res.json({
      success: false,
      alreadyClaimed: true,
      message: `${task} already claimed! Opening link without coins.`,
      balance: user.value().coins,
      doneTasks: currentTasks
    });
  }

  currentTasks.push(task);
  const newCoins = Number(user.value().coins || 0) + amount;
  user.assign({ coins: newCoins, balance: newCoins, claimedTasks: currentTasks }).write();

  res.json({
    success: true,
    coins: newCoins,
    balance: newCoins,
    doneTasks: currentTasks
  });
});

// Spin Refill
app.post('/api/spin/refill', (req, res) => {
  const { identifier, userId } = req.body;
  const id = String(identifier || userId);
  let user = db.get('users').find({ id });
  if (user.value()) {
    const updatedSpins = Number(user.value().spins || 0) + 3;
    user.assign({ spins: updatedSpins }).write();
    return res.json({ success: true, spins: updatedSpins });
  }
  res.json({ success: true, spins: 3 });
});

// Ad Verify Endpoint
app.post('/api/ad/verify', (req, res) => {
  const { identifier, userId, coins, reward } = req.body;
  const id = String(identifier || userId);
  const amount = Number(coins || reward || 50);

  let user = db.get('users').find({ id });
  if (user.value()) {
    const newCoins = Number(user.value().coins || 0) + amount;
    const ads = Number(user.value().adsWatched || 0) + 1;
    user.assign({ coins: newCoins, balance: newCoins, adsWatched: ads }).write();
    return res.json({ success: true, coins: newCoins, balance: newCoins, adsWatched: ads });
  }
  res.json({ success: true, coins: amount, balance: amount });
});

// Withdraw Endpoint
app.post('/api/withdraw', (req, res) => {
  const { identifier, userId, amount, coins, address, method } = req.body;
  const id = String(identifier || userId);
  const coinsNeeded = Number(coins || (amount * 100));

  let user = db.get('users').find({ id });
  if (!user.value()) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const userCoins = Number(user.value().coins || 0);
  if (userCoins < coinsNeeded) {
    return res.json({ success: false, message: 'Insufficient coins balance!' });
  }

  const remainingCoins = userCoins - coinsNeeded;
  user.assign({ coins: remainingCoins, balance: remainingCoins, payout_address: address || user.value().payout_address }).write();

  const withdrawal = {
    id: Date.now(),
    userId: id,
    amount,
    coinsDeducted: coinsNeeded,
    address: address || '',
    method: method || 'UPI',
    status: 'pending',
    date: new Date()
  };
  db.get('withdrawals').push(withdrawal).write();

  res.json({
    success: true,
    message: 'Withdrawal request submitted!',
    balance: remainingCoins,
    coins: remainingCoins
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

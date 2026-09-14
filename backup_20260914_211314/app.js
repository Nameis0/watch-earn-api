const TELEGRAM_BOT_TOKEN = "8439244872:AAFiAPlZhrf5hG1odhZ25Y6oGbrCtNyaRVY";
const TELEGRAM_CHAT_ID = "8954689240";

function openRedeemModal() {
  const modal = document.getElementById("redeemModal");
  if (modal) modal.style.display = "flex";
}

function closeRedeemModal() {
  const modal = document.getElementById("redeemModal");
  if (modal) modal.style.display = "none";
}

function getUserIdentifier() {
  const userElem = document.querySelector(".balance-card small, small");
  let text = userElem ? userElem.innerText.replace(/[^0-9]/g, "") : "";
  return text || "7893988980";
}

function getWeeklyWithdrawHistory(userId) {
  const key = "withdraw_history_" + userId;
  const history = JSON.parse(localStorage.getItem(key) || "[]");
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const validHistory = history.filter(item => item.timestamp >= sevenDaysAgo);
  localStorage.setItem(key, JSON.stringify(validHistory));
  return validHistory;
}

function submitWithdrawRequest() {
  const upiInput = document.getElementById("upiIdInput");
  const amountSelect = document.getElementById("redeemAmountSelect");

  const upiId = upiInput ? upiInput.value.trim() : "";
  const coinsToRedeem = parseInt(amountSelect ? amountSelect.value : 10000);
  const userId = getUserIdentifier();

  if (!upiId || !upiId.includes("@")) {
    alert("దయచేసి సరైన UPI ID నమోదు చేయండి (उदा: user@paytm)");
    return;
  }

  const weeklyHistory = getWeeklyWithdrawHistory(userId);
  if (weeklyHistory.length >= 3) {
    alert("⚠️ వీక్లీ లిమిట్ దాటింది!\n\nఈ వారంలో ఇప్పటికే 3 సార్లు విత్‌డ్రా చేసుకున్నారు. వచ్చే వారం మళ్లీ ప్రయత్నించండి.");
    return;
  }

  const balanceElem = document.getElementById("userBalance") || document.querySelector("h1, .balance-amount");
  let currentBalance = parseInt(balanceElem ? balanceElem.innerText.replace(/[^0-9]/g, "") : 20050);

  if (currentBalance < coinsToRedeem) {
    alert("మీ వద్ద సరిపడా కాయిన్స్ లేవు! కనీసం " + coinsToRedeem.toLocaleString() + " కాయిన్స్ అవసరం.");
    return;
  }

  currentBalance -= coinsToRedeem;
  if (balanceElem) balanceElem.innerText = currentBalance.toLocaleString();

  const newRecord = {
    amount: coinsToRedeem / 1000,
    coins: coinsToRedeem,
    upi: upiId,
    timestamp: Date.now(),
    dateStr: new Date().toLocaleDateString("en-IN")
  };
  weeklyHistory.push(newRecord);
  localStorage.setItem("withdraw_history_" + userId, JSON.stringify(weeklyHistory));

  // టెలిగ్రామ్ అలర్ట్
  sendGroupedTelegramNotification(userId, upiId, coinsToRedeem, weeklyHistory);

  closeRedeemModal();
  alert("విత్‌డ్రా రిక్వెస్ట్ నమోదైంది!\n\nమొత్తం: ₹" + (coinsToRedeem / 1000) + "\nఈ వారం పూర్తయిన విత్‌డ్రాలు: " + weeklyHistory.length + "/3");
}

function sendGroupedTelegramNotification(userId, upiId, coins, history) {
  const currentAmount = coins / 1000;
  const totalWeeklyWithdrawn = history.reduce((sum, item) => sum + item.amount, 0);

  let historyTree = "";
  history.forEach((h, index) => {
    const isLatest = (index === history.length - 1);
    const prefix = isLatest ? "└── 🆕 Req #" : "├── Req #";
    historyTree += prefix + (index + 1) + ": ₹" + h.amount + " (" + h.dateStr + ") [" + h.upi + "]\n";
  });

  const plainMessage = 
"📁 USER ACCOUNT FOLDER: " + userId + "\n" +
"━━━━━━━━━━━━━━━━━━━━━\n" +
"👤 User: " + userId + "\n" +
"💳 Current UPI: " + upiId + "\n" +
"💰 Requested: ₹" + currentAmount + " (" + coins.toLocaleString() + " Coins)\n\n" +
"📊 Weekly Limit: " + history.length + "/3 Requests Used\n" +
"💵 Weekly Total Redeemed: ₹" + totalWeeklyWithdrawn + "\n\n" +
"📂 Transaction Archive (Past 7 Days):\n" +
historyTree + "\n" +
"⏰ Time: " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: plainMessage
    })
  })
  .then(res => res.json())
  .then(data => console.log("Telegram alert response:", data))
  .catch(err => console.error("Telegram error:", err));
}

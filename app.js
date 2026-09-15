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

function setPayoutMethod(method) {
  document.getElementById("selectedPayoutMethod").value = method;
  const tabs = ["phonepe", "gpay", "paytm"];
  tabs.forEach(t => {
    const el = document.getElementById("tab-" + t);
    if (!el) return;
    if (t === method.toLowerCase()) {
      el.style.border = "1px solid #facc15";
      el.style.background = "rgba(250,204,21,0.15)";
      el.style.color = "#fff";
    } else {
      el.style.border = "1px solid rgba(255,255,255,0.1)";
      el.style.background = "rgba(15,23,42,0.6)";
      el.style.color = "#94a3b8";
    }
  });

  const label = document.getElementById("payoutInputLabel");
  const input = document.getElementById("upiIdInput");
  if (label && input) {
    if (method === "PhonePe") {
      label.innerText = "PhonePe UPI ID / Mobile Number";
      input.placeholder = "e.g., 9876543210@ybl or 10-digit mobile";
    } else if (method === "GPay") {
      label.innerText = "GPay UPI ID / Registered Mobile";
      input.placeholder = "e.g., user@okhdfcbank or mobile";
    } else {
      label.innerText = "Paytm Wallet / UPI Number";
      input.placeholder = "e.g., 9876543210@paytm or Paytm number";
    }
  }
}

function submitWithdrawRequest() {
  const upiInput = document.getElementById("upiIdInput");
  const amountSelect = document.getElementById("redeemAmountSelect");
  const method = document.getElementById("selectedPayoutMethod") ? document.getElementById("selectedPayoutMethod").value : "UPI";

  const payoutDest = upiInput ? upiInput.value.trim() : "";
  const coinsToRedeem = parseInt(amountSelect ? amountSelect.value : 10000);
  const userId = (typeof getUserIdentifier === "function") ? getUserIdentifier() : (localStorage.getItem("app_device_linked_user") || "7893988980");

  if (!payoutDest || payoutDest.length < 5) {
    if (typeof showToast === "function") {
      showToast("Please enter a valid UPI ID or Mobile Number.", "⚠️");
    }
    return;
  }

  // Tiered limit: 20 for Admin 7893988980, 3 for standard users
  const maxWeeklyLimit = (String(userId).trim() === "7893988980") ? 20 : 3;
  const weeklyHistory = getWeeklyWithdrawHistory(userId);

  if (weeklyHistory.length >= maxWeeklyLimit) {
    if (typeof showToast === "function") {
      showToast("Weekly limit reached (" + weeklyHistory.length + "/" + maxWeeklyLimit + "). Try next week.", "⚠️");
    }
    return;
  }

  const balanceElem = document.getElementById("userBalance") || document.querySelector("h1, .balance-amount");
  let currentBalance = parseInt(balanceElem ? balanceElem.innerText.replace(/[^0-9]/g, "") : 20000);

  if (currentBalance < coinsToRedeem) {
    if (typeof showToast === "function") {
      showToast("Insufficient balance! Minimum " + coinsToRedeem.toLocaleString() + " coins required.", "⚠️");
    }
    return;
  }

  currentBalance -= coinsToRedeem;
  if (balanceElem) balanceElem.innerText = currentBalance.toLocaleString();
  localStorage.setItem("user_permanent_coins", currentBalance.toString());

  const newRecord = {
    amount: coinsToRedeem / 1000,
    coins: coinsToRedeem,
    upi: "[" + method + "] " + payoutDest,
    timestamp: Date.now(),
    dateStr: new Date().toLocaleDateString("en-IN")
  };
  weeklyHistory.push(newRecord);
  localStorage.setItem("withdraw_history_" + userId, JSON.stringify(weeklyHistory));

  if (typeof sendGroupedTelegramNotification === "function") {
    sendGroupedTelegramNotification(userId, "[" + method + "] " + payoutDest, coinsToRedeem, weeklyHistory);
  }

  closeRedeemModal();

  // Show Modern Receipt Modal
  const successModal = document.getElementById("withdrawSuccessModal");
  if (successModal) {
    document.getElementById("receiptAmount").innerText = "₹" + (coinsToRedeem / 1000);
    document.getElementById("receiptMethod").innerText = method;
    document.getElementById("receiptDest").innerText = payoutDest;
    document.getElementById("receiptLimit").innerText = weeklyHistory.length + " / " + maxWeeklyLimit;
    successModal.style.display = "flex";
  }
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

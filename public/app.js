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
// Safe injection without modifying HTML structure
window.claimTask = function(type, reward, url) {
  if (url) {
    window.open(url, "_blank");
  }

  const userId = (typeof getUserIdentifier === "function") ? getUserIdentifier() : (localStorage.getItem("app_device_linked_user") || "7893988980");
  const taskKey = "task_claimed_" + type + "_" + userId;
  const alreadyClaimed = localStorage.getItem(taskKey);

  if (alreadyClaimed === "true") {
    if (typeof showToast === "function") {
      showToast("Redirecting... Reward was already claimed!", "ℹ️");
    }
    return;
  }

  localStorage.setItem(taskKey, "true");
  const taskName = (type === "tg") ? "Telegram Join Bonus" : "YouTube Subscribe Bonus";

  let current = parseInt(localStorage.getItem("user_permanent_coins") || "100");
  current += reward;
  localStorage.setItem("user_permanent_coins", current.toString());
  if (typeof currentCoins !== "undefined") currentCoins = current;

  document.querySelectorAll(".sync-coins, #userBalance").forEach(el => {
    el.innerText = current.toLocaleString();
  });

  // Log to coins history
  const cKey = "coin_history_" + userId;
  const cHistory = JSON.parse(localStorage.getItem(cKey) || "[]");
  cHistory.unshift({
    title: taskName,
    amount: reward,
    date: new Date().toLocaleDateString("en-IN"),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  localStorage.setItem(cKey, JSON.stringify(cHistory));

  if (typeof showToast === "function") {
    showToast("+" + reward + " Coins Credited for " + taskName + "!", "🎉");
  }
};

window.renderHistoryScreen = function() {
  const container = document.getElementById("historyListContainer") || document.getElementById("view-history");
  if (!container) return;

  const userId = (typeof getUserIdentifier === "function") ? getUserIdentifier() : (localStorage.getItem("app_device_linked_user") || "7893988980");
  const coinHistory = JSON.parse(localStorage.getItem("coin_history_" + userId) || "[]");
  const withdrawHistory = (typeof getWeeklyWithdrawHistory === "function") ? getWeeklyWithdrawHistory(userId) : JSON.parse(localStorage.getItem("withdraw_history_" + userId) || "[]");

  container.innerHTML = `
    <div style="display:flex; background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:4px; margin-bottom:14px;">
      <button type="button" id="tabCoinsBtn" onclick="showHistorySection('coins')" style="flex:1; padding:9px; border-radius:10px; border:none; background:#facc15; color:#0f172a; font-weight:800; font-size:12px; cursor:pointer;">Coins Earned</button>
      <button type="button" id="tabWithdrawBtn" onclick="showHistorySection('withdraws')" style="flex:1; padding:9px; border-radius:10px; border:none; background:transparent; color:#94a3b8; font-weight:700; font-size:12px; cursor:pointer;">Withdrawals</button>
    </div>

    <div id="coinsSec" style="display:block; display:flex; flex-direction:column; gap:8px;">
      ${coinHistory.length === 0 ? '<div style="text-align:center; padding:25px; color:#64748b; font-size:12px;">No coins earned yet.</div>' : 
        coinHistory.map(item => `
          <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:700; color:#fff;">${item.title}</div>
              <div style="font-size:11px; color:#64748b;">${item.date} • ${item.time}</div>
            </div>
            <div style="font-size:14px; font-weight:800; color:#4ade80;">+${item.amount}</div>
          </div>
        `).join("")}
    </div>

    <div id="withdrawSec" style="display:none; display:flex; flex-direction:column; gap:8px;">
      ${withdrawHistory.length === 0 ? '<div style="text-align:center; padding:25px; color:#64748b; font-size:12px;">No withdrawal requests yet.</div>' : 
        withdrawHistory.map(w => {
          const isDone = (Date.now() - (w.timestamp || 0)) > (24 * 60 * 60 * 1000);
          return `
            <div style="background:rgba(30,41,59,0.7); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:10px 14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <div style="font-size:13px; font-weight:800; color:#fff;">Payout ₹${w.amount}</div>
                <span style="font-size:10px; font-weight:800; padding:2px 8px; border-radius:6px; background:${isDone ? 'rgba(34,197,94,0.15)' : 'rgba(250,204,21,0.15)'}; color:${isDone ? '#22c55e' : '#facc15'}; border:1px solid ${isDone ? 'rgba(34,197,94,0.3)' : 'rgba(250,204,21,0.3)'};">
                  ${isDone ? 'Successful' : 'Pending'}
                </span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:11px; color:#94a3b8;">
                <div>${w.upi}</div>
                <div>${w.dateStr}</div>
              </div>
            </div>
          `;
        }).join("")}
    </div>
  `;
};

window.showHistorySection = function(type) {
  const cSec = document.getElementById("coinsSec");
  const wSec = document.getElementById("withdrawSec");
  const cBtn = document.getElementById("tabCoinsBtn");
  const wBtn = document.getElementById("tabWithdrawBtn");

  if (!cSec || !wSec) return;

  if (type === "coins") {
    cSec.style.display = "flex";
    wSec.style.display = "none";
    cBtn.style.background = "#facc15";
    cBtn.style.color = "#0f172a";
    wBtn.style.background = "transparent";
    wBtn.style.color = "#94a3b8";
  } else {
    cSec.style.display = "none";
    wSec.style.display = "flex";
    wBtn.style.background = "#facc15";
    wBtn.style.color = "#0f172a";
    cBtn.style.background = "transparent";
    cBtn.style.color = "#94a3b8";
  }
};

// Auto update on navigation click
document.addEventListener("DOMContentLoaded", function() {
  document.querySelectorAll("[data-target='history'], [onclick*='history'], .nav-item").forEach(el => {
    el.addEventListener("click", function() {
      setTimeout(renderHistoryScreen, 80);
    });
  });
});

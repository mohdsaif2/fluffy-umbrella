const form = document.getElementById("chatForm");
const input = document.getElementById("promptInput");
const sendButton = document.getElementById("sendButton");
const messagesEl = document.getElementById("messages");
const welcome = document.getElementById("welcomeScreen");
const historyList = document.getElementById("historyList");
const toast = document.getElementById("toast");

let chats = JSON.parse(localStorage.getItem("nexa_chats") || "[]");
let activeChatId = null;
let busy = false;

function saveChats() {
  localStorage.setItem("nexa_chats", JSON.stringify(chats));
  renderHistory();
}
function currentChat() { return chats.find(c => c.id === activeChatId); }
function newChat() {
  activeChatId = null;
  messagesEl.innerHTML = "";
  welcome.hidden = false;
  input.focus();
  renderHistory();
}
function renderHistory() {
  historyList.innerHTML = "";
  if (!chats.length) {
    historyList.innerHTML = '<div class="empty-history">Your recent chats will appear here.</div>';
    return;
  }
  chats.slice().reverse().forEach(chat => {
    const btn = document.createElement("button");
    btn.className = "history-item" + (chat.id === activeChatId ? " active" : "");
    btn.textContent = chat.title || "New conversation";
    btn.title = chat.title || "New conversation";
    btn.addEventListener("click", () => openChat(chat.id));
    historyList.appendChild(btn);
  });
}
function openChat(id) {
  activeChatId = id;
  const chat = currentChat();
  if (!chat) return;
  welcome.hidden = true;
  messagesEl.innerHTML = "";
  chat.messages.forEach(m => addMessage(m.role, m.text, false));
  renderHistory();
  closeSidebar();
}
function addMessage(role, text, withActions = true) {
  welcome.hidden = true;
  const row = document.createElement("article");
  row.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "assistant" ? "✦" : "Y";
  const body = document.createElement("div");
  body.className = "message-body";
  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = role === "assistant" ? "NEXA AI" : "YOU";
  const content = document.createElement("div");
  content.className = "message-text";
  content.innerHTML = role === "assistant" ? formatMarkdown(text) : "";
  if (role === "user") content.textContent = text;
  body.append(name, content);
  if (role === "assistant" && withActions) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const copy = document.createElement("button");
    copy.textContent = "▢ Copy response";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(text); showToast("Response copied"); }
      catch { showToast("Clipboard unavailable in this browser"); }
    });
    actions.appendChild(copy);
    body.appendChild(actions);
  }
  row.append(avatar, body);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  document.getElementById("chatArea").scrollTop = document.getElementById("chatArea").scrollHeight;
  return row;
}

// Small Markdown renderer: escapes HTML first, then supports common AI response formatting.
function formatMarkdown(raw) {
  let s = String(raw).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = [];
  s = s.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `@@BLOCK${blocks.length - 1}@@`;
  });
  s = s.replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>");
  s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  s = s.split(/\n{2,}/).map(part => {
    if (/^@@BLOCK\d+@@$/.test(part) || /^<h[1-3]>/.test(part) || /^<ul>/.test(part)) return part;
    return part.replace(/\n/g, "<br>");
  }).join("<p></p>");
  s = s.replace(/@@BLOCK(\d+)@@/g, (_, i) => blocks[Number(i)]);
  return s;
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}
function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  sendButton.innerHTML = value ? '<span>…</span>' : '<span>↑</span>';
  input.disabled = value;
}
function showTyping() {
  const row = document.createElement("article");
  row.className = "message assistant";
  row.id = "typingIndicator";
  row.innerHTML = '<div class="message-avatar">✦</div><div class="message-body"><div class="message-name">NEXA AI</div><div class="typing"><span></span><span></span><span></span></div></div>';
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
async function sendMessage(text) {
  const prompt = text.trim();
  if (!prompt || busy) return;
  if (!activeChatId) {
    activeChatId = crypto.randomUUID();
    chats.push({ id: activeChatId, title: prompt.slice(0, 34) + (prompt.length > 34 ? "…" : ""), messages: [] });
  }
  const chat = currentChat();
  chat.messages.push({ role: "user", text: prompt });
  addMessage("user", prompt);
  input.value = "";
  input.style.height = "auto";
  saveChats();
  setBusy(true);
  showTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chat.messages.map(m => ({ role: m.role, text: m.text }))
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    document.getElementById("typingIndicator")?.remove();
    chat.messages.push({ role: "assistant", text: data.reply });
    addMessage("assistant", data.reply);
    saveChats();
  } catch (err) {
    document.getElementById("typingIndicator")?.remove();
    const errorText = `**Couldn't get a response.**\n\n${err.message}\n\nCheck that the server is running and your Gemini API key is configured in the .env file.`;
    addMessage("assistant", errorText);
    showToast("Message could not be sent");
  } finally {
    setBusy(false);
    input.focus();
  }
}
form.addEventListener("submit", e => { e.preventDefault(); sendMessage(input.value); });
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; });
input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
document.getElementById("newChat").addEventListener("click", newChat);
document.querySelectorAll(".suggestion-card").forEach(card => card.addEventListener("click", () => sendMessage(card.dataset.prompt)));
document.getElementById("openSidebar").addEventListener("click", () => { document.getElementById("sidebar").classList.add("open"); document.getElementById("mobileScrim").classList.add("show"); });
document.getElementById("closeSidebar").addEventListener("click", closeSidebar);
document.getElementById("mobileScrim").addEventListener("click", closeSidebar);
function closeSidebar() { document.getElementById("sidebar").classList.remove("open"); document.getElementById("mobileScrim").classList.remove("show"); }

renderHistory();
if (chats.length) openChat(chats[chats.length - 1].id);

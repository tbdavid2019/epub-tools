// XTC Flasher — 主程式
// 用 esptool-js 透過 Web Serial API 跟 ESP32-C3 溝通

import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.5.7/bundle.js";

// ========== DOM 參照 ==========
const $ = (id) => document.getElementById(id);
const statusLine = $("status-line");
const progressWrap = $("progress-wrap");
const progressFill = $("progress-fill");
const progressText = $("progress-text");
const logWrap = $("log-wrap");
const logEl = $("log");
const browserWarning = $("browser-warning");

const allButtons = () => document.querySelectorAll("button.btn");

// ========== 工具函式 ==========
function setStatus(text, state = "idle") {
  statusLine.textContent = text;
  statusLine.className = "";
  statusLine.classList.add(`status-${state}`);
}

function setProgress(current, total) {
  if (total <= 0) {
    progressWrap.classList.add("hidden");
    return;
  }
  progressWrap.classList.remove("hidden");
  const pct = Math.min(100, (current / total) * 100);
  progressFill.style.width = pct.toFixed(1) + "%";
  progressText.textContent =
    `${(current / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB  (${pct.toFixed(1)}%)`;
}

function resetProgress() {
  progressWrap.classList.add("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = "0%";
}

function log(msg) {
  logWrap.classList.remove("hidden");
  const ts = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  logEl.textContent += `[${ts}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setButtonsDisabled(disabled) {
  allButtons().forEach((b) => (b.disabled = disabled));
}

// esptool-js 的 Terminal 介面
const terminal = {
  clean() { /* 不清空 log，保留歷史 */ },
  writeLine(data) { log(data); },
  write(data) { log(data); },
};

// ========== 相容性檢查 ==========
if (!("serial" in navigator)) {
  browserWarning.classList.remove("hidden");
  setStatus("瀏覽器不支援 Web Serial API，無法使用此工具。", "error");
  setButtonsDisabled(true);
} else {
  log("瀏覽器支援 Web Serial API，可以開始。");
}

// ========== 連線建立 ==========
async function connect() {
  setStatus("請在彈窗中選擇 X3 / X4 的 USB 連線埠……", "running");
  log("等待使用者選擇 serial port…");

  const device = await navigator.serial.requestPort({});
  const transport = new Transport(device, true);

  const loader = new ESPLoader({
    transport,
    baudrate: 921600,
    terminal,
    romBaudrate: 115200,
  });

  setStatus("連線中…", "running");
  log("開始連線到 ESP32-C3…");
  await loader.main();

  log(`連線成功，晶片：${loader.chip.CHIP_NAME}`);
  setStatus(`已連線到 ${loader.chip.CHIP_NAME}`, "running");
  return { loader, transport };
}

async function disconnect(transport, skipReset = false) {
  try {
    if (!skipReset) {
      await transport.setDTR(false);
      await transport.setRTS(false);
    }
    await transport.disconnect();
    log("已斷開連線。");
  } catch (e) {
    log(`斷線時出錯（可忽略）：${e.message}`);
  }
}

// ========== 功能 1：備份完整韌體 ==========
async function backupFullFlash() {
  setButtonsDisabled(true);
  resetProgress();
  let transport;

  try {
    const { loader, transport: t } = await connect();
    transport = t;

    const flashSize = 0x1000000; // 16 MB
    setStatus("讀取韌體中，約 25 分鐘，請勿拔線……", "running");
    log(`開始讀取 Flash：0x0 ~ 0x${flashSize.toString(16)}（16 MB）`);

    const data = await loader.readFlash(0, flashSize, (packet, progress, total) => {
      setProgress(progress, total);
    });

    log("讀取完成，正在產生下載連結…");

    // 下載為 xtc-backup-YYYYMMDD-HHMM.bin
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `xtc-backup-${ts}.bin`;

    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log(`✅ 備份已下載：${filename}`);
    setStatus(`備份完成！檔案已下載：${filename}`, "success");
  } catch (err) {
    log(`❌ 錯誤：${err.message}`);
    setStatus(`備份失敗：${err.message}`, "error");
    console.error(err);
  } finally {
    if (transport) await disconnect(transport, true);
    setButtonsDisabled(false);
  }
}

// ========== 功能 2：刷入 bin 檔（使用者自備，自己備份的或網路下載的都行）==========
async function flashBin() {
  const fileInput = $("file-restore");
  if (!fileInput.files || fileInput.files.length === 0) {
    setStatus("請先選擇一個 bin 檔。", "error");
    return;
  }

  const file = fileInput.files[0];
  if (file.size < 1024 * 1024) {
    setStatus(`檔案太小（${(file.size / 1024).toFixed(1)} KB），可能不是完整的韌體 bin。`, "error");
    return;
  }

  setButtonsDisabled(true);
  resetProgress();
  let transport;

  try {
    // ⚠️ 關鍵：先要 USB 權限（必須在 user gesture 同一 tick 內），再做其他事
    const { loader, transport: t } = await connect();
    transport = t;

    setStatus(`讀取 bin 檔 ${file.name}…`, "running");
    log(`bin 檔大小：${(file.size / 1024 / 1024).toFixed(2)} MB`);

    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binStr = "";
    for (let i = 0; i < bytes.length; i++) binStr += String.fromCharCode(bytes[i]);

    setStatus("刷入 bin 檔中，約 15 分鐘，請勿拔線…", "running");
    log("開始從 offset 0x0 寫入整片 bin…");

    await loader.writeFlash({
      fileArray: [{ data: binStr, address: 0x0 }],
      flashSize: "keep",
      flashMode: "dio",
      flashFreq: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        setProgress(written, total);
      },
    });

    log("✅ 刷入完成！");
    setStatus("刷入成功！請按 Reset 後長按電源 3 秒。", "success");
  } catch (err) {
    log(`❌ 錯誤：${err.message}`);
    setStatus(`刷入失敗：${err.message}`, "error");
    console.error(err);
  } finally {
    if (transport) await disconnect(transport, true);
    setButtonsDisabled(false);
  }
}

// ========== 綁定按鈕 ==========
$("btn-backup").addEventListener("click", backupFullFlash);
$("btn-restore").addEventListener("click", flashBin);

log("XTC Flasher 已就緒。建議先做完整備份，再進行任何刷入動作。");

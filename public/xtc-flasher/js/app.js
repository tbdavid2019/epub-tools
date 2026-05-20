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
const logCountEl = $("log-count");
const browserWarning = $("browser-warning");

const allButtons = () => document.querySelectorAll("button.btn");

// ========== Log 狀態 ==========
let logLineCount = 0;
let logHasError = false;
let autoScroll = true;

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
  const line = `[${ts}] ${msg}\n`;
  logEl.textContent += line;
  logLineCount += 1;

  // 偵測錯誤關鍵字 → 標紅 + 切換 log 邊框
  if (!logHasError && /[❌]|錯誤|失敗|error|fail/i.test(msg)) {
    logHasError = true;
    logEl.classList.add("has-error");
    logCountEl.classList.add("has-error");
  }

  updateLogCount();

  if (autoScroll) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function updateLogCount() {
  logCountEl.textContent = logHasError
    ? `${logLineCount} 行（含錯誤）`
    : `${logLineCount} 行`;
}

function getLogText() {
  return logEl.textContent || "";
}

function buildErrorReport() {
  const ua = navigator.userAgent;
  const lang = navigator.language || "unknown";
  const platform = navigator.platform || "unknown";
  const now = new Date().toLocaleString("zh-TW", { hour12: false });
  const statusText = statusLine.textContent || "（無）";
  return [
    "===== 閱星曈刷機錯誤回報 =====",
    `時間：${now}`,
    `目前狀態：${statusText}`,
    `平台：${platform}`,
    `語系：${lang}`,
    `瀏覽器：${ua}`,
    "----- 完整 Log -----",
    getLogText().trim() || "（無 log）",
    "===== 回報結束 =====",
  ].join("\n");
}

async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fallthrough */ }
  // Fallback：用隱形 textarea + execCommand
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

function flashCopied(btn, label = "已複製 ✓") {
  const original = btn.textContent;
  btn.classList.add("copied");
  btn.textContent = label;
  setTimeout(() => {
    btn.classList.remove("copied");
    btn.textContent = original;
  }, 1800);
}

function downloadLogTxt() {
  const text = getLogText();
  if (!text.trim()) return;
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `xtc-flasher-log-${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toggleAutoScroll(btn) {
  autoScroll = !autoScroll;
  btn.setAttribute("aria-pressed", String(autoScroll));
  btn.textContent = `自動滾動：${autoScroll ? "開" : "關"}`;
  if (autoScroll) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function clearLog() {
  logEl.textContent = "";
  logLineCount = 0;
  logHasError = false;
  logEl.classList.remove("has-error");
  logCountEl.classList.remove("has-error");
  updateLogCount();
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

// ========== 功能 3：OTA 快速刷入 ==========
// 改作自 CrossPoint Reader（MIT，by daveallie） https://github.com/crosspoint-reader/crosspoint-reader
// 只刷 app 分區，跳過 NVS / SPIFFS，保留書籤與設定

// CRC32（ESP-IDF 用來校驗 otadata 的 ota_seq）
const CRC32_TABLE = new Uint32Array(256);
(() => {
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC32_TABLE[i] = c >>> 0;
  }
})();
function crc32(data, previous = 0) {
  let crc = previous === 0 ? 0 : (previous ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < data.length; i++) crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 小端序 byte 工具
function u32ToLE(v) {
  return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);
}
function leToU32(b) {
  return ((b[0] || 0) + (((b[1] || 0) << 8) >>> 0) + (((b[2] || 0) << 16) >>> 0) + (((b[3] || 0) << 24) >>> 0)) >>> 0;
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function otaSeqCrc(seq) {
  // ESP-IDF: crc32_le(UINT32_MAX, ota_seq, 4)
  return u32ToLE(crc32(u32ToLE(seq), 0xFFFFFFFF));
}

// X3 / X4 分區表（CrossPoint 已驗證）
const X4_LAYOUT = { app0Offset: 0x10000, app1Offset: 0x650000, appSize: 0x640000 };
const X3_LAYOUT = { app0Offset: 0x10000, app1Offset: 0x780000, appSize: 0x770000 };

const X4_TABLE = [
  { type: "data-nvs",       offset: 0x9000,   size: 0x5000   },
  { type: "data-ota",       offset: 0xE000,   size: 0x2000   },
  { type: "app-ota_0",      offset: 0x10000,  size: 0x640000 },
  { type: "app-ota_1",      offset: 0x650000, size: 0x640000 },
  { type: "data-spiffs",    offset: 0xC90000, size: 0x360000 },
  { type: "data-coredump",  offset: 0xFF0000, size: 0x10000  },
];
const X3_TABLE = [
  { type: "data-nvs",       offset: 0x9000,   size: 0x5000   },
  { type: "data-ota",       offset: 0xE000,   size: 0x2000   },
  { type: "app-ota_0",      offset: 0x10000,  size: 0x770000 },
  { type: "app-ota_1",      offset: 0x780000, size: 0x770000 },
  { type: "data-spiffs",    offset: 0xEF0000, size: 0x100000 },
  { type: "data-coredump",  offset: 0xFF0000, size: 0x10000  },
];

// 解析分區表（ESP32 分區表是 32 byte 一筆，最多 0x2000 大小，放在 0x8000）
const PARTITION_TYPES = {
  0x00: { 0x10: "app-ota_0", 0x11: "app-ota_1" },
  0x01: { 0x00: "data-ota", 0x01: "data-phy", 0x02: "data-nvs", 0x03: "data-coredump", 0x82: "data-spiffs" },
};
function parsePartitionTable(data) {
  const out = [];
  for (let off = 0; off < data.length; off += 32) {
    const c = data.slice(off, off + 32);
    if (c.length !== 32) break;
    let allFF = true;
    for (let i = 0; i < 32; i++) if (c[i] !== 0xFF) { allFF = false; break; }
    if (allFF) break;
    if (c[0] === 0xEB && c[1] === 0xEB) continue; // md5 chksum entry
    const type = PARTITION_TYPES[c[2]]?.[c[3]] || "unknown";
    out.push({ type, offset: leToU32(c.slice(4, 8)), size: leToU32(c.slice(8, 12)) });
  }
  return out;
}
function tableMatches(actual, expected) {
  return actual.length === expected.length && expected.every((e, i) =>
    actual[i].type === e.type && actual[i].offset === e.offset && actual[i].size === e.size);
}

// 解析 otadata（0xE000，8KB，兩個 4KB slot）
const OTA_STATE = { NEW: 0, PENDING_VERIFY: 1, VALID: 2, INVALID: 3, ABORTED: 4 };
const INVALID_STATES = new Set([OTA_STATE.INVALID, OTA_STATE.ABORTED]);

function parseOtaSlot(data, offset) {
  const sequence = leToU32(data.slice(offset, offset + 4));
  const state = leToU32(data.slice(offset + 0x18, offset + 0x1C));
  const crcBytes = data.slice(offset + 0x1C, offset + 0x20);
  return { sequence, state, crcValid: bytesEqual(crcBytes, otaSeqCrc(sequence)) };
}
function parseOtadata(data) {
  const slot0 = parseOtaSlot(data, 0);
  const slot1 = parseOtaSlot(data, 0x1000);
  const candidates = [];
  if (!INVALID_STATES.has(slot0.state) && slot0.crcValid) candidates.push({ label: "app0", ...slot0 });
  if (!INVALID_STATES.has(slot1.state) && slot1.crcValid) candidates.push({ label: "app1", ...slot1 });
  candidates.sort((a, b) => b.sequence - a.sequence);
  const currentBoot = candidates[0]?.label || "app0";
  const backup = currentBoot === "app0" ? "app1" : "app0";
  const nextSeq = (candidates[0]?.sequence || 0) + 1;
  return { slot0, slot1, currentBoot, backup, nextSeq };
}
function buildNewOtadata(existing, backupLabel, nextSeq) {
  const out = new Uint8Array(existing);
  const off = backupLabel === "app1" ? 0x1000 : 0;
  out.set(u32ToLE(nextSeq), off);
  out.set(u32ToLE(OTA_STATE.NEW), off + 0x18);
  out.set(otaSeqCrc(nextSeq), off + 0x1C);
  return out;
}

// 把 Uint8Array 轉成 binary string（esptool-js writeFlash 要 binary string）
function bytesToBinStr(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

async function flashOTA() {
  const fileInput = $("file-ota");
  if (!fileInput.files || fileInput.files.length === 0) {
    setStatus("請先選擇一個 app 分區的 bin 檔。", "error");
    return;
  }
  const file = fileInput.files[0];

  // 預先大小檢查（X3 比較大，用 X3 上限做寬鬆驗證；下限取 CrossPoint 用的 0xF0000 = 960 KB）
  if (file.size < 0xF0000) {
    setStatus(`檔案太小（${(file.size / 1024).toFixed(1)} KB），不像 app 分區韌體。`, "error");
    return;
  }
  if (file.size > X3_LAYOUT.appSize) {
    setStatus(`檔案太大（${(file.size / 1024 / 1024).toFixed(2)} MB），超過 X3 最大 7.44 MB。`, "error");
    return;
  }

  setButtonsDisabled(true);
  resetProgress();
  let transport;

  try {
    log(`OTA 模式：bin 檔大小 ${(file.size / 1024 / 1024).toFixed(2)} MB`);

    // [1/6] 連線
    setStatus("[1/6] 連線中…", "running");
    const { loader, transport: t } = await connect();
    transport = t;

    // [2/6] 驗證並辨識分區表
    setStatus("[2/6] 讀取並驗證分區表…", "running");
    log("讀取分區表（0x8000，8 KB）…");
    const tableRaw = await loader.readFlash(0x8000, 0x2000);
    const tableBytes = (tableRaw instanceof Uint8Array) ? tableRaw : new Uint8Array(tableRaw);
    const parsed = parsePartitionTable(tableBytes);
    log(`分區表共 ${parsed.length} 個分區。`);

    let layout, model;
    if (tableMatches(parsed, X4_TABLE)) {
      layout = X4_LAYOUT; model = "X4";
    } else if (tableMatches(parsed, X3_TABLE)) {
      layout = X3_LAYOUT; model = "X3";
    } else {
      const dump = parsed.map(p => `  ${p.type} @ 0x${p.offset.toString(16)} (${p.size} bytes)`).join("\n");
      throw new Error(`分區表不符合 X3 或 X4 標準佈局。建議改用②完整刷入。\n讀到的分區表：\n${dump}`);
    }
    log(`✅ 辨識為 ${model}，app 分區最大 ${(layout.appSize / 1024 / 1024).toFixed(2)} MB。`);

    // 檢查檔案大小是否超過該機型 app 分區
    if (file.size > layout.appSize) {
      throw new Error(`bin 檔 ${(file.size / 1024 / 1024).toFixed(2)} MB 超過 ${model} app 分區上限 ${(layout.appSize / 1024 / 1024).toFixed(2)} MB。`);
    }

    // [3/6] 讀 otadata
    setStatus("[3/6] 讀取 OTA 啟動紀錄…", "running");
    log("讀取 otadata（0xE000，8 KB）…");
    const otaRawRead = await loader.readFlash(0xE000, 0x2000);
    const otaRaw = (otaRawRead instanceof Uint8Array) ? otaRawRead : new Uint8Array(otaRawRead);
    const ota = parseOtadata(otaRaw);
    log(`目前開機分區：${ota.currentBoot}（slot0 seq=${ota.slot0.sequence}, slot1 seq=${ota.slot1.sequence}）`);
    log(`本次寫入目標：${ota.backup}（@ 0x${(ota.backup === "app0" ? layout.app0Offset : layout.app1Offset).toString(16)}）`);

    // [4/6] 寫 app 分區到 backup
    const targetOffset = ota.backup === "app0" ? layout.app0Offset : layout.app1Offset;
    const buf = await file.arrayBuffer();
    const firmwareBytes = new Uint8Array(buf);
    const firmwareBinStr = bytesToBinStr(firmwareBytes);

    setStatus(`[4/6] 寫入韌體到 ${ota.backup} 分區，約 5～7 分鐘，請勿拔線…`, "running");
    log(`開始寫入：0x${targetOffset.toString(16)}（${(firmwareBytes.length / 1024 / 1024).toFixed(2)} MB）`);
    await loader.writeFlash({
      fileArray: [{ data: firmwareBinStr, address: targetOffset }],
      flashSize: "keep",
      flashMode: "keep",
      flashFreq: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (_, written, total) => setProgress(written, total),
    });
    log("✅ app 分區寫入完成。");
    resetProgress();

    // [5/6] 改寫 otadata 並驗證
    setStatus("[5/6] 切換開機分區並驗證…", "running");
    log(`寫入新 otadata（指向 ${ota.backup}, seq=${ota.nextSeq}）…`);
    const newOta = buildNewOtadata(otaRaw, ota.backup, ota.nextSeq);
    const newOtaBinStr = bytesToBinStr(newOta);
    await loader.writeFlash({
      fileArray: [{ data: newOtaBinStr, address: 0xE000 }],
      flashSize: "keep",
      flashMode: "keep",
      flashFreq: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (_, written, total) => setProgress(written, total),
    });

    // 寫後驗證
    log("讀回 otadata 驗證切換是否成功…");
    const verifyRawRead = await loader.readFlash(0xE000, 0x2000);
    const verifyRaw = (verifyRawRead instanceof Uint8Array) ? verifyRawRead : new Uint8Array(verifyRawRead);
    const verify = parseOtadata(verifyRaw);
    if (verify.currentBoot !== ota.backup) {
      throw new Error(`otadata 切換驗證失敗：預期 ${ota.backup}，實際 ${verify.currentBoot}。請重試或改用②完整刷入。`);
    }
    log(`✅ 驗證通過：開機分區已切到 ${verify.currentBoot}。`);
    resetProgress();

    // [6/6] 完成
    setStatus(`[6/6] OTA 完成！${model} 已更新到 ${ota.backup} 分區。請按 Reset 後長按電源 3 秒。`, "success");
    log(`🎉 OTA 快速更新完成（${model} → ${ota.backup}）。舊韌體完整保留，萬一新版有問題重刷一次會切回。`);
  } catch (err) {
    log(`❌ 錯誤：${err.message}`);
    setStatus(`OTA 失敗：${err.message}`, "error");
    console.error(err);
  } finally {
    if (transport) await disconnect(transport, true);
    setButtonsDisabled(false);
  }
}

// ========== 綁定按鈕 ==========
$("btn-backup").addEventListener("click", backupFullFlash);
$("btn-restore").addEventListener("click", flashBin);
$("btn-ota").addEventListener("click", flashOTA);

// log 工具列
$("btn-copy-all").addEventListener("click", async (e) => {
  const ok = await copyToClipboard(getLogText());
  if (ok) flashCopied(e.currentTarget, "已複製全部 ✓");
  else flashCopied(e.currentTarget, "複製失敗，請手動選取");
});
$("btn-copy-error").addEventListener("click", async (e) => {
  const ok = await copyToClipboard(buildErrorReport());
  if (ok) flashCopied(e.currentTarget, "錯誤回報已複製 ✓");
  else flashCopied(e.currentTarget, "複製失敗");
});
$("btn-download-log").addEventListener("click", downloadLogTxt);
$("btn-toggle-scroll").addEventListener("click", (e) => toggleAutoScroll(e.currentTarget));
$("btn-clear-log").addEventListener("click", () => {
  if (confirm("確定要清空目前的 log 嗎？（已寫到裝置的內容不會被清掉）")) {
    clearLog();
  }
});

// 使用者手動往上捲 → 自動暫停滾動；捲回最底 → 恢復
logEl.addEventListener("scroll", () => {
  const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24;
  const btn = $("btn-toggle-scroll");
  if (!nearBottom && autoScroll) {
    autoScroll = false;
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = "自動滾動：關";
  } else if (nearBottom && !autoScroll) {
    autoScroll = true;
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "自動滾動：開";
  }
});

log("XTC Flasher 已就緒。建議先做完整備份，再進行任何刷入動作。");

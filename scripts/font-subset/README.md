# 中文字體子集化工具

掃描 HelloRuru 全站 HTML/JS 檔案，提取用到的中文字元，將完整字體（OTF/TTF）子集化為輕量 woff2。

## 效果

| 字體 | 原始大小 | 子集化後 | 壓縮率 |
|------|---------|---------|-------|
| 源雲明朝 Regular | 21.7 MB | 815 KB | 96% |
| 源雲明朝 SemiBold | 21.6 MB | 831 KB | 96% |
| 思源宋體 Regular | 23.4 MB | 1579 KB | 93% |
| 思源宋體 SemiBold | 23.6 MB | 1616 KB | 93% |

## 安裝

```bash
pip install fonttools brotli
```

## 使用

```bash
cd tools/scripts/font-subset

# 源雲明朝
python subset-font.py \
  --source /tmp/genwan \
  --output ../../../helloruru.github.io/fonts \
  --fonts GenWanMin2TC-R.otf:GenWanMin2TC-Regular.woff2 \
         GenWanMin2TC-SB.otf:GenWanMin2TC-SemiBold.woff2

# 思源宋體（V2.5 文青版內文用）
python subset-font.py \
  --source /tmp/noto-serif \
  --output ../../../helloruru.github.io/fonts \
  --fonts NotoSerifCJKtc-Regular.otf:NotoSerifTC-Regular.woff2 \
         NotoSerifCJKtc-SemiBold.otf:NotoSerifTC-SemiBold.woff2
```

## 參數

| 參數 | 說明 | 預設 |
|------|------|------|
| `--source` | OTF/TTF 來源目錄 | 必填 |
| `--output` | woff2 輸出目錄 | `.`（當前目錄） |
| `--fonts` | 字體對應（`來源:輸出`） | 必填，可多組 |
| `--scan` | 自訂掃描目錄 | tools/lab/newday 三站 |
| `--extra-chars` | 額外要包含的字元 | 無 |

## 原理

1. 遞迴掃描指定目錄的 `.html`、`.js`、`.jsx`、`.tsx` 檔案
2. 用正規表達式提取所有 CJK 字元（U+4E00–U+9FFF、U+3400–U+4DBF）
3. 加上基本拉丁字母、數字、常用標點符號
4. 用 fontTools 的 Subsetter 裁剪字體，只保留用到的字符
5. 輸出為 woff2 格式（Brotli 壓縮）

## 字體來源

- **源雲明朝**（GenWanMinCho）：[ButTaiwan/genwan-font](https://github.com/ButTaiwan/genwan-font)，SIL OFL 授權
- **思源宋體**（Noto Serif CJK TC）：[notofonts/noto-cjk](https://github.com/notofonts/noto-cjk)，SIL OFL 授權
- ~~源泉圓體~~：V2.5 起不再使用

子集化後的 woff2 檔案部署於 `lab.helloruru.com/fonts/`。

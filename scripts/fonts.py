"""把字型裁成遊戲用得到的字，放進 src/fonts/（離線也能顯示、不用連 Google Fonts）。

  .venv-voice/bin/python scripts/fonts.py <ChironGoRoundTC[wght].ttf> <BricolageGrotesque[opsz,wdth,wght].ttf>

原始字型從 github.com/google/fonts（ofl/chirongoroundtc、ofl/bricolagegrotesque）下載，
授權是 SIL Open Font License，可以裁切、內嵌、再散布（授權檔放在 src/fonts/）。
遊戲裡的字全部寫在程式碼裡（沒有使用者輸入的文字會顯示成這個字型以外的字，
排行榜暱稱例外，找不到的字會用系統字型補），所以掃一遍 src/ 就知道要哪些字。
改了台詞、課程之後重跑一次。
"""

import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "fonts"


def used_chars() -> str:
    chars = set()
    for p in list((ROOT / "src").rglob("*.ts")) + list((ROOT / "src").rglob("*.tsx")) + [ROOT / "index.html"]:
        chars.update(p.read_text(encoding="utf-8"))
    chars.update(chr(c) for c in range(0x20, 0x7F))
    chars.update("，。、：；！？「」『』（）…—～・＋－×÷％０１２３４５６７８９〈〉《》→←↑↓▶★？")
    return "".join(sorted(c for c in chars if ord(c) >= 0x20))


def make(src: str, axes: dict, text: str, dest: Path):
    # 先裁字再固定粗細：整套變體字型有 5 萬多字，先裁快很多
    font = TTFont(src)
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    inst = instancer.instantiateVariableFont(font, axes)
    inst.flavor = "woff2"
    inst.save(dest)
    print(f"{dest.name}: {dest.stat().st_size / 1024:.0f} KB")


def main():
    chiron, bric = sys.argv[1], sys.argv[2]
    OUT.mkdir(parents=True, exist_ok=True)
    text = used_chars()
    print(f"{len(text)} 個字")
    for w in (700, 900):
        make(chiron, {"wght": w}, text, OUT / f"chiron-{w}.woff2")
    latin = "".join(chr(c) for c in range(0x20, 0x7F)) + "−×–—·•"
    for w in (700, 800):
        make(bric, {"wght": w, "wdth": 100, "opsz": 14}, latin, OUT / f"bricolage-{w}.woff2")


if __name__ == "__main__":
    main()

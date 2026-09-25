#!/usr/bin/env python3
"""把台詞生成成語音檔（edge-tts + ffmpeg），每個角色一個固定的聲音。
（從 haunted-reviews 專案搬過來的，效果積木一樣。）

讀（--data，預設 voice/）：
  cast.json        角色與聲音設定（edge 聲音、語速、音高、ffmpeg 效果）
  *.lines.json     台詞：{ "lineId": { "who": "meiling", "text": "…" } }
                   可選欄位：tts（實際唸的字，跟字幕不同時用）、rate、pitch（覆蓋角色設定）、
                   fx（額外效果，接在角色效果後面）
寫（--out，預設 public/voice/）：
  <lineId>.mp3
  manifest.json    { lineId: { file, who, text, dur, hash } }
  cast.json

增量：台詞文字或聲音設定沒變就跳過；已經不存在的台詞會刪掉對應的檔案。

用法：
  python3 -m venv .venv-voice && .venv-voice/bin/pip install edge-tts
  npx tsx scripts/voice-lines.ts                            # 從遊戲資料產生台詞表
  .venv-voice/bin/python scripts/gen_voices.py              # 只生成有變的
  .venv-voice/bin/python scripts/gen_voices.py --force      # 全部重生
  .venv-voice/bin/python scripts/gen_voices.py --only lin   # 只重生某個角色
  .venv-voice/bin/python scripts/gen_voices.py --data voice/audition --out voice-audition

需要 ffmpeg / ffprobe（有 libmp3lame）。edge-tts 是微軟 Edge 的線上語音，需要網路；
僅供非商業使用。
"""
import argparse
import asyncio
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "voice"
OUT = ROOT / "public" / "voice"

# 改了效果的定義就把這個數字 +1，所有台詞會重新生成
FX_VERSION = 4

# ffmpeg 效果積木。每個是 (前段濾鏡, 要不要在殘響前補靜音)。
# 前段濾鏡依序串起來；需要尾巴的（回音、殘響）會先 apad 再接。
FX = {
    "plain": ["highpass=f=80"],
    # 老人：輕微顫音 + 收掉刺耳的高頻
    "elder": ["vibrato=f=5.2:d=0.07", "lowpass=f=7200"],
    # 阿桂：比 elder 更明顯的抖
    "tremble": ["vibrato=f=6.2:d=0.16", "tremolo=f=6.2:d=0.12", "lowpass=f=7500"],
    # 沙啞：削掉低頻、壓一點破音、再收高頻
    "raspy": ["highpass=f=120", "equalizer=f=2600:t=q:w=1.4:g=4", "volume=5dB", "asoftclip=type=atan", "volume=-5dB", "lowpass=f=4600"],
    # 粗聲：低頻厚、中高頻壓、壓縮
    "gruff": ["equalizer=f=150:t=q:w=1:g=5", "equalizer=f=3200:t=q:w=1:g=-3", "acompressor=threshold=-20dB:ratio=3:attack=10:release=120", "lowpass=f=6200"],
    # 溫暖：低中頻稍厚
    "warm": ["equalizer=f=280:t=q:w=1:g=3", "equalizer=f=5000:t=q:w=1:g=-2"],
    # 豪爽：低頻 + 一點壓縮
    "hearty": ["equalizer=f=200:t=q:w=1:g=4", "acompressor=threshold=-18dB:ratio=2.5"],
    "bright": ["equalizer=f=4200:t=q:w=1.2:g=3"],
    "loud": ["acompressor=threshold=-24dB:ratio=4:attack=5:release=80:makeup=4"],
    "smooth": ["equalizer=f=240:t=q:w=1:g=3", "equalizer=f=6000:t=q:w=1:g=-2", "acompressor=threshold=-20dB:ratio=3"],
    "child": ["equalizer=f=3500:t=q:w=1:g=2"],
    # 醉：很慢的音高搖晃
    "drunk": ["vibrato=f=0.8:d=0.5", "lowpass=f=5200"],
    # 神祕：收高頻 + 小房間回音
    "mystic": ["lowpass=f=7000", "PAD", "aecho=0.8:0.55:110|230:0.22|0.12"],
    # 鬼：削低頻、合唱、多重回音（空靈）
    "ghost": [
        "highpass=f=150",
        "chorus=0.75:0.9:32|51:0.28|0.22:0.35|0.5:1.6|2.3",
        "PAD",
        "aecho=0.85:0.62:75|150|245:0.3|0.2|0.12",
    ],
    # 尖叫：拉高、強顫音、破音、回音
    "scream": [
        "asetrate=24000*1.22",
        "aresample=24000",
        "vibrato=f=9:d=0.45",
        "volume=9dB",
        "asoftclip=type=tanh",
        "highpass=f=320",
        "PAD",
        "aecho=0.8:0.5:90|190:0.3|0.18",
        "afade=t=out:st=1.7:d=0.7",
    ],
}

LOUDNESS = {"default": -16, "scream": -12}


def load_json(p: pathlib.Path):
    return json.loads(p.read_text(encoding="utf-8"))


def run(cmd: list[str]) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:4])}…\n{r.stderr[-1500:]}")
    return r.stdout


def build_filter(fx: list[str], scream: bool) -> str:
    # 頭尾的靜音都修掉（edge-tts 會在句尾多塞將近一秒的靜音，短短的「碰！」會被拖長）
    parts = [
        "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05",
        "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse",
    ]
    padded = False
    for name in fx:
        for f in FX[name]:
            if f == "PAD":
                if not padded:
                    parts.append("apad=pad_dur=0.7")
                    padded = True
                continue
            parts.append(f)
    target = LOUDNESS["scream" if scream else "default"]
    parts.append(f"loudnorm=I={target}:TP=-1.5:LRA=11")
    parts.append("aresample=24000")
    if padded:
        # 補的靜音裡回音散完之後，把尾巴多餘的靜音修掉
        parts.append("areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.08,areverse")
    return ",".join(parts)


def profile_for(line: dict, cast: dict) -> dict:
    c = cast[line["who"]]
    v = c["voice"]
    return {
        "voice": v["voice"],
        "rate": line.get("rate", v.get("rate", "+0%")),
        "pitch": line.get("pitch", v.get("pitch", "+0Hz")),
        "volume": v.get("volume", "+0%"),
        "fx": list(v.get("fx", [])) + list(line.get("fx", [])),
        "tts": line.get("tts", line["text"]),
    }


def line_hash(prof: dict) -> str:
    blob = json.dumps({"p": prof, "fxv": FX_VERSION, "fx": {k: FX[k] for k in prof["fx"]}}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:12]


async def tts(text: str, prof: dict, dest: pathlib.Path, retries: int = 4) -> None:
    for attempt in range(retries):
        try:
            com = edge_tts.Communicate(text, prof["voice"], rate=prof["rate"], pitch=prof["pitch"], volume=prof["volume"])
            await com.save(str(dest))
            if dest.stat().st_size > 1000:
                return
            raise RuntimeError("edge-tts 回傳的檔案太小")
        except Exception as e:  # 網路不穩就重試
            if attempt == retries - 1:
                raise
            wait = 1.5 * (attempt + 1)
            print(f"  重試 {attempt + 1}/{retries - 1}（{e.__class__.__name__}），{wait:.1f}s 後", file=sys.stderr)
            await asyncio.sleep(wait)


def duration(p: pathlib.Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(p)])
    return round(float(out.strip()), 2)


async def render(line_id: str, line: dict, cast: dict, tmp: pathlib.Path, sem: asyncio.Semaphore) -> dict:
    prof = profile_for(line, cast)
    raw = tmp / f"{line_id}.raw.mp3"
    dest = OUT / f"{line_id}.mp3"
    async with sem:
        await tts(prof["tts"], prof, raw)
    af = build_filter(prof["fx"], "scream" in prof["fx"])
    await asyncio.to_thread(
        run,
        ["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", af, "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "64k", str(dest)],
    )
    return {"file": dest.name, "who": line["who"], "text": line["text"], "dur": duration(dest), "hash": line_hash(prof)}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="全部重新生成")
    ap.add_argument("--only", help="只重生這個角色 id 的台詞")
    ap.add_argument("--data", help="台詞與角色設定的資料夾（預設 voice/）")
    ap.add_argument("--out", help="輸出資料夾（預設 public/voice/）")
    args = ap.parse_args()
    global DATA, OUT
    if args.data:
        DATA = ROOT / args.data
    if args.out:
        OUT = ROOT / args.out
    if not shutil.which("ffmpeg"):
        sys.exit("找不到 ffmpeg")

    cast_list = load_json(DATA / "cast.json")
    cast = {c["id"]: c for c in cast_list}
    lines: dict[str, dict] = {}
    for f in sorted(DATA.glob("*.lines.json")):
        for k, v in load_json(f).items():
            if k in lines:
                sys.exit(f"台詞 id 重複：{k}（{f.name}）")
            if v["who"] not in cast:
                sys.exit(f"{f.name} 的 {k}：沒有這個角色 {v['who']}")
            lines[k] = v

    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    old = load_json(manifest_path) if manifest_path.exists() else {}

    todo, manifest = [], {}
    for k, v in lines.items():
        h = line_hash(profile_for(v, cast))
        prev = old.get(k)
        stale = args.force or (args.only and v["who"] == args.only)
        if prev and prev.get("hash") == h and (OUT / prev["file"]).exists() and not stale:
            manifest[k] = {**prev, "text": v["text"]}
        else:
            todo.append(k)

    print(f"台詞 {len(lines)} 句，要生成 {len(todo)} 句")
    sem = asyncio.Semaphore(4)
    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t)
        results = await asyncio.gather(*(render(k, lines[k], cast, tmp, sem) for k in todo), return_exceptions=True)
    failed = 0
    for k, r in zip(todo, results):
        if isinstance(r, Exception):
            failed += 1
            print(f"✗ {k}: {r}", file=sys.stderr)
            if k in old:  # 失敗就保留舊檔
                manifest[k] = old[k]
        else:
            manifest[k] = r
            print(f"✓ {k:18s} {r['dur']:5.2f}s  {lines[k]['who']}")

    # 刪掉已經沒有台詞的檔案
    keep = {m["file"] for m in manifest.values()}
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
            print(f"- 刪除 {f.name}")

    manifest = {k: manifest[k] for k in sorted(manifest)}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (OUT / "cast.json").write_text(json.dumps(cast_list, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(f.stat().st_size for f in OUT.glob("*.mp3"))
    print(f"完成：{len(manifest)} 句，{total / 1024:.0f} KB" + (f"，失敗 {failed}" if failed else ""))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

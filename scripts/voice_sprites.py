#!/usr/bin/env python3
"""把每個角色的語音短檔接成一個音檔（audio sprite），附上每句的位置。

讀：voice-build/clips/manifest.json 與那些 mp3
寫：public/voice/<角色>.<內容雜湊>.mp3（檔名帶雜湊，可以放心長期快取）
    public/voice/index.json   { voices: { 角色: { file, clips: { "tile.m1": [開始秒, 長度秒], … } } } }

一場只要載四個檔（三個對手＋你），比幾百個小檔好。句子之間留 0.25 秒空白，
瀏覽器解碼時就算差幾十毫秒（mp3 編碼器延遲），也只會落在空白裡。

用法：.venv-voice/bin/python scripts/voice_sprites.py
"""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import wave

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLIPS = ROOT / "voice-build" / "clips"
OUT = ROOT / "public" / "voice"
RATE = 24000
GAP = 0.25
LEAD = 0.1
BITRATE = "40k"


def pcm(path: pathlib.Path) -> bytes:
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-"],
        capture_output=True,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode()[-800:])
    return r.stdout


def main() -> None:
    manifest = json.loads((CLIPS / "manifest.json").read_text(encoding="utf-8"))
    groups: dict[str, list[str]] = {}
    for k, v in manifest.items():
        groups.setdefault(v["who"], []).append(k)

    OUT.mkdir(parents=True, exist_ok=True)
    index: dict[str, dict] = {}
    total = 0
    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t)
        for who, keys in sorted(groups.items()):
            keys.sort()
            buf = bytearray(b"\0\0" * int(LEAD * RATE))
            clips: dict[str, list[float]] = {}
            for k in keys:
                data = pcm(CLIPS / manifest[k]["file"])
                start = len(buf) / 2 / RATE
                buf += data
                clips[k[len(who) + 1 :]] = [round(start, 3), round(len(data) / 2 / RATE, 3)]
                buf += b"\0\0" * int(GAP * RATE)
            wav = tmp / f"{who}.wav"
            with wave.open(str(wav), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(RATE)
                w.writeframes(bytes(buf))
            enc = tmp / f"{who}.mp3"
            r = subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", BITRATE, str(enc)],
                capture_output=True,
            )
            if r.returncode != 0:
                sys.exit(r.stderr.decode()[-800:])
            h = hashlib.sha1(enc.read_bytes()).hexdigest()[:8]
            dest = OUT / f"{who}.{h}.mp3"
            dest.write_bytes(enc.read_bytes())
            index[who] = {"file": dest.name, "clips": clips}
            size = dest.stat().st_size
            total += size
            print(f"{who:10s} {len(keys):3d} 句  {len(buf) / 2 / RATE:6.1f} 秒  {size / 1024:5.0f} KB")

    keep = {v["file"] for v in index.values()}
    for f in OUT.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
            print(f"- 刪除 {f.name}")
    (OUT / "index.json").write_text(json.dumps({"voices": index}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"完成：{len(index)} 個聲音，共 {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()

// 手機開打時，能全螢幕＋鎖橫向就鎖（Android Chrome 可以）。
// iPhone 的 Safari 不給網頁鎖方向，那邊靠直拿時整個畫面轉 90 度（bits.tsx 的 Stage）。
// 一定要在使用者點擊的當下呼叫（瀏覽器規定）。

export async function goLandscape() {
  if (!window.matchMedia?.('(pointer: coarse)').matches) return // 電腦不用
  const el = document.documentElement
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await o.lock?.('landscape')
  } catch {
    // 不支援或被拒絕：沒關係，畫面會自己轉
  }
}

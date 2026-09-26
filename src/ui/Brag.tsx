// 炫耀卡：預覽、分享（手機跳分享選單）、存圖、複製圖片。

import { useEffect, useState } from 'react'
import { headline, makeBragCard } from '../brag'
import { canPlayOnline } from '../net'
import { myName, useUI } from '../store'
import { Sheet } from './Overlays'

export function BragSheet() {
  const snap = useUI((s) => s.bragSnap)
  const { brag, showToast } = useUI.getState()
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!snap) return
    let live = true
    let url = ''
    setImg(null)
    setErr('')
    makeBragCard(snap, myName())
      .then((blob) => {
        if (!live) return
        url = URL.createObjectURL(blob)
        setImg({ blob, url })
      })
      .catch((e: Error) => live && setErr(e.message))
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [snap])
  if (!snap) return null
  const file = img ? new File([img.blob], `胡了-${headline(snap)}.png`, { type: 'image/png' }) : null
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write
  // claude.ai 的試玩版不能下載檔案：改成在圖片上長按／右鍵另存
  const canSave = canPlayOnline()
  const share = async () => {
    try {
      await navigator.share({ files: [file!], text: `胡了！${headline(snap)} ${snap.tai} 台` })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') showToast('分享不了，改用存圖')
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': img!.blob })])
      showToast('圖片複製好了，到 LINE 貼上')
    } catch {
      showToast('這個瀏覽器不能複製圖片，改用存圖')
    }
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = img!.url
    a.download = file!.name
    a.click()
  }
  return (
    <Sheet open onClose={() => brag(null)} label="炫耀卡">
      <div className="brag">
        <div className="brag-preview">
          {img ? <img src={img.url} alt={`${headline(snap)} ${snap.tai} 台的炫耀卡`} /> : <span className="muted">{err || '畫卡片中…'}</span>}
        </div>
        <div className="brag-side">
          <h3>炫耀卡</h3>
          <p className="help-lead">
            把這一手傳給朋友看。手機按「分享」可以直接傳到 LINE。{!canSave && '也可以在圖片上長按（電腦按右鍵）另存。'}
          </p>
          <div className="brag-actions">
            {canShare && (
              <button type="button" className="btn primary" onClick={share}>
                分享
              </button>
            )}
            {canSave && (
              <button type="button" className={canShare ? 'btn' : 'btn primary'} disabled={!img} onClick={download}>
                存圖
              </button>
            )}
            {canCopy && (
              <button type="button" className="btn" disabled={!img} onClick={copy}>
                複製圖片
              </button>
            )}
            <button type="button" className="btn" onClick={() => brag(null)}>
              關閉
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

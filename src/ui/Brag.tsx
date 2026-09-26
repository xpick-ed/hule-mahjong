// 分享圖卡：炫耀卡（你胡的大牌）、家庭牌局戰報。預覽、分享（手機跳分享選單）、存圖、複製圖片。

import { useEffect, useMemo, useState } from 'react'
import { headline, makeBragCard } from '../brag'
import { canPlayOnline } from '../net'
import { myName, useUI, type ShareCard } from '../store'
import { Sheet } from './Overlays'

export function BragSheet() {
  const snap = useUI((s) => s.bragSnap)
  const brag = useUI((s) => s.brag)
  // 同一手只畫一次（重畫會閃）
  const card = useMemo<ShareCard | null>(
    () =>
      snap && {
        title: '炫耀卡',
        lead: '把這一手傳給朋友看。手機按「分享」可以直接傳到 LINE。',
        make: () => makeBragCard(snap, myName()),
        filename: `胡了-${headline(snap)}.png`,
        text: `胡了！${headline(snap)} ${snap.tai} 台`,
        alt: `${headline(snap)} ${snap.tai} 台的炫耀卡`,
      },
    [snap],
  )
  if (!card) return null
  return (
    <Sheet open onClose={() => brag(null)} label="炫耀卡">
      <CardShare card={card} onClose={() => brag(null)} />
    </Sheet>
  )
}

/** 別的地方要分享的圖卡（家庭牌局戰報） */
export function ShareCardSheet() {
  const card = useUI((s) => s.shareCard)
  const close = () => useUI.setState({ shareCard: null })
  if (!card) return null
  return (
    <Sheet open onClose={close} label={card.title}>
      <CardShare card={card} onClose={close} />
    </Sheet>
  )
}

function CardShare({ card, onClose }: { card: ShareCard; onClose: () => void }) {
  const { showToast } = useUI.getState()
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    let url = ''
    card
      .make()
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
  }, [card])
  const file = img ? new File([img.blob], card.filename, { type: 'image/png' }) : null
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write
  // claude.ai 的試玩版不能下載檔案：改成在圖片上長按／右鍵另存
  const canSave = canPlayOnline()
  const share = async () => {
    try {
      await navigator.share({ files: [file!], text: card.text })
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
    <div className="brag">
      <div className="brag-preview">{img ? <img src={img.url} alt={card.alt} /> : <span className="muted">{err || '畫卡片中…'}</span>}</div>
      <div className="brag-side">
        <h3>{card.title}</h3>
        <p className="help-lead">
          {card.lead}
          {!canSave && '也可以在圖片上長按（電腦按右鍵）另存。'}
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
          <button type="button" className="btn" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

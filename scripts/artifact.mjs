// 把 build 出來的遊戲包成單一 HTML（CSS、JS 都內嵌），給 claude.ai 的 Artifact 預覽用。
//   npm run artifact  →  dist-artifact/hule.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('dist/index.html', 'utf8')
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1]
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1]
const code = readFileSync(`dist/${js}`, 'utf8').replaceAll('</script', '<\\/script')
// CSS 裡的中文（例如 content: '已過關'）轉成 \\XXXX，不管頁面編碼怎麼判斷都不會變亂碼
// 字型（assets/ 裡的 woff2）轉成 data URI 內嵌
const cssDir = css.slice(0, css.lastIndexOf('/') + 1)
const style = readFileSync(`dist/${css}`, 'utf8')
  .replace(/[^\x00-\x7f]/g, (ch) => `\\${ch.codePointAt(0).toString(16)} `)
  .replace(/url\((?:\.\/)?([^)]+\.woff2)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(`dist/${cssDir}${f}`).toString('base64')})`)

const out = `<title>胡了！</title>
<meta name="description" content="台灣十六張麻將，跟巷口阿姨、公司主管、過年的阿嬤打，一路打到雀神。">
<style>${style}</style>
<div id="root"></div>
<script type="module">${code}</script>
`
mkdirSync('dist-artifact', { recursive: true })
writeFileSync('dist-artifact/hule.html', out)
console.log(`dist-artifact/hule.html ${(out.length / 1024).toFixed(0)} KB`)

import { ipcMain } from 'electron'
import logger from 'electron-log/main'

const RSS_URL = 'https://eminium.ovh/api/rss'

export interface RssNewsItem {
  title: string
  link: string
  description: string
  content: string
  image: string | null
  author: string
  createdAt: string
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#0*39;|&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(Number(code))
      } catch {
        return ''
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16))
      } catch {
        return ''
      }
    })
}

function pickTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? decodeEntities(match[1].trim()) : ''
}

function pickEnclosure(block: string): string | null {
  const match = block.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i)
  return match ? match[1].trim() : null
}

function parseRss(xml: string): RssNewsItem[] {
  const items: RssNewsItem[] = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []

  for (const block of blocks) {
    const title = pickTag(block, 'title')
    if (!title) continue
    items.push({
      title,
      link: pickTag(block, 'link'),
      description: pickTag(block, 'description'),
      content: pickTag(block, 'content:encoded'),
      image: pickEnclosure(block),
      author: pickTag(block, 'dc:creator') || 'Eminium',
      createdAt: pickTag(block, 'pubDate')
    })
  }

  return items
}

export function registerNewsHandlers() {
  ipcMain.handle('news:get_news', async (): Promise<RssNewsItem[]> => {
    try {
      const res = await fetch(RSS_URL, { headers: { Accept: 'application/rss+xml, application/xml' } })
      if (!res.ok) throw new Error(`RSS request failed: HTTP ${res.status}`)
      return parseRss(await res.text())
    } catch (err) {
      logger.error('Failed to fetch RSS news:', err)
      return []
    }
  })

  ipcMain.handle('news:get_categories', async (): Promise<string[]> => {
    // The RSS feed has no categories.
    return []
  })
}

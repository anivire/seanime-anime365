/// <reference path="./onlinestream-provider.d.ts" />

const BASE = 'https://smotret-anime.app'
const API = BASE + '/api'
// The first server is Seanime's default; it remembers the user's last choice.
const SERVER_TYPES: Record<string, string> = {'Русские субтитры': 'subRu', 'Русская озвучка': 'voiceRu'}
const MAX_TRANSLATIONS = 15
const MAIN_EPISODE_TYPES = ['tv', 'ova', 'ona', 'movie']

// Anime365 API responses (https://smotret-anime.app/api-docs), only the fields used here.

interface A365Series {
  id: number
  isHentai?: number
  typeTitle?: string
  titles?: {romaji?: string, en?: string, ru?: string, ja?: string}
}

interface A365Episode {
  id: number
  episodeInt: number | string
  episodeType?: string // tv, ova, ona, movie, preview, special, tv_special, opening, ending, menu, bonus, other
  episodeTitle?: string
}

interface A365Translation {
  id: number
  type: string // subRu, voiceRu, subEn, voiceEn, raw, ...
  priority?: number
  title?: string
  authorsSummary?: string
}

interface A365Embed {
  stream?: {height: number, urls?: string[]}[]
  download?: {height: number, url?: string}[]
  subtitlesUrl?: string
}

const isHttps = (url: unknown): url is string => typeof url === 'string' && /^https:\/\//.test(url)

function absoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  if (url.startsWith('//')) return 'https:' + url
  return BASE + (url.startsWith('/') ? '' : '/') + url
}

class Provider {
  getSettings(): Settings {
    return {episodeServers: Object.keys(SERVER_TYPES), supportsDub: false}
  }

  private async api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const pairs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    const url = API + path + (pairs.length ? '?' + pairs.join('&') : '')
    const res = await fetch(url, {headers: {'Accept': 'application/json', 'User-Agent': 'Seanime-Anime365/0.1'}})
    if (!res.ok) throw new Error('Anime365 HTTP ' + res.status + ' (' + path + ')')
    const obj: {data?: T, error?: {code?: number, message?: string}} = JSON.parse(await res.text())
    if (obj.error) throw new Error('Anime365: ' + (obj.error.message || JSON.stringify(obj.error)))
    return obj.data as T
  }

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    const q = (opts.query || '').trim()
    if (q.length < 2) return []
    const series = await this.api<A365Series[]>('/series', {query: q, limit: '30', isActive: '1'})
    if (!Array.isArray(series)) return []
    return series.filter(s => !s.isHentai || opts.media.isAdult).map(s => ({
      id: String(s.id),
      title: (s.titles && (s.titles.romaji || s.titles.en || s.titles.ru || s.titles.ja)) || s.typeTitle || q,
      url: BASE + '/catalog/anime/' + s.id,
      subOrDub: 'both' as SubOrDub,
    }))
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    const rows = await this.api<A365Episode[]>('/episodes', {seriesId: id, isActive: '1', limit: '1000'})
    if (!Array.isArray(rows)) return []
    const numbered = rows.filter(e => Number.isInteger(Number(e.episodeInt)) && Number(e.episodeInt) > 0)
    // Trailers, openings, specials etc. reuse numbers of real episodes ("Трейлер" is episode 1).
    // Keep them only for entries that have nothing else, e.g. a series made of specials.
    const main = numbered.filter(e => MAIN_EPISODE_TYPES.includes(e.episodeType || ''))
    const byNumber: Record<number, A365Episode> = {}
    for (const e of (main.length ? main : numbered).sort((a, b) => a.id - b.id)) {
      if (!byNumber[Number(e.episodeInt)]) byNumber[Number(e.episodeInt)] = e
    }
    return Object.values(byNumber)
      .map(e => ({id: String(e.id), number: Number(e.episodeInt), title: e.episodeTitle || ('Серия ' + e.episodeInt), url: BASE + '/episodes/' + e.id}))
      .sort((a, b) => a.number - b.number)
  }

  async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
    const token = $getUserPreference('apiToken')
    if (!token) throw new Error('Set Anime365 API Token in the extension settings.')
    const wanted = SERVER_TYPES[server]
    if (!wanted) throw new Error('Unknown Anime365 server: ' + server)
    const translations = await this.api<A365Translation[]>('/translations', {episodeId: episode.id, isActive: '1', limit: '100'})
    const picked = (Array.isArray(translations) ? translations : [])
      .filter(t => t.type === wanted)
      .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))
      .slice(0, MAX_TRANSLATIONS)
    if (!picked.length) throw new Error('No Anime365 ' + wanted + ' translations for episode ' + episode.id)
    // Fetch embeds in parallel, then keep Anime365's priority order so the best translation is the default.
    const embeds = await Promise.all(picked.map(t =>
      this.api<A365Embed>('/translations/embed/' + t.id, {access_token: token}).catch(() => null)))
    const sources: VideoSource[] = []
    const usedQualities: Record<string, boolean> = {}
    picked.forEach((t, i) => {
      const embed = embeds[i]
      if (!embed) return
      const author = t.authorsSummary || t.title || t.type
      const subtitles: VideoSubtitle[] = embed.subtitlesUrl
        ? [{id: String(t.id), url: absoluteUrl(embed.subtitlesUrl).replace(/\?willcache$/, ''), language: 'ru', isDefault: true}]
        : []
      const options = [
        ...(Array.isArray(embed.stream) ? embed.stream : []).map(o => ({height: o.height, url: Array.isArray(o.urls) ? o.urls.find(isHttps) : undefined})),
        ...(Array.isArray(embed.download) ? embed.download : []).map(o => ({height: o.height, url: o.url})),
      ].filter((o): o is {height: number, url: string} => isHttps(o.url))
        .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0))
      // Stream mirrors and download links are the same file, so keep one link per resolution.
      const usedHeights: Record<string, boolean> = {}
      for (const o of options) {
        if (usedHeights[o.height]) continue
        usedHeights[o.height] = true
        let quality = o.height + 'p · ' + author
        if (usedQualities[quality]) quality += ' #' + t.id
        usedQualities[quality] = true
        const type: VideoSourceType = /\.m3u8($|[?#])/i.test(o.url) ? 'm3u8' : 'mp4'
        sources.push({url: o.url, type, quality, label: author, subtitles})
      }
    })
    if (!sources.length) throw new Error('Anime365 returned no compatible direct MP4/HLS links for ' + server + '.')
    return {server, headers: {}, videoSources: sources}
  }
}

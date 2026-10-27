const BASE = 'https://smotret-anime.app'
const API = BASE + '/api'
const SERVER = 'Anime365 (RU)'

class Provider {
  getSettings(): Settings {
    return { episodeServers: [SERVER], supportsDub: true }
  }

  private async api(path: string, params: Record<string, string> = {}): Promise<any> {
    const pairs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    const url = API + path + (pairs.length ? '?' + pairs.join('&') : '')
    const res = await fetch(url, {headers: {'Accept': 'application/json', 'User-Agent': 'Seanime-Anime365/0.1'}})
    if (!res.ok) throw new Error('Anime365 HTTP ' + res.status + ' (' + path + ')')
    const obj = JSON.parse(await res.text())
    if (obj.error) throw new Error('Anime365: ' + (obj.error.message || JSON.stringify(obj.error)))
    return obj.data
  }

  async search(opts: SearchOptions): Promise<SearchResult[]> {
    const q = (opts.query || '').trim()
    if (q.length < 2) return []
    const series = await this.api('/series', {query: q, limit: '30', isActive: '1'})
    if (!Array.isArray(series)) return []
    return series.filter((s: any) => !s.isHentai || opts.media.isAdult).map((s: any) => ({
      id: String(s.id),
      title: (s.titles && (s.titles.romaji || s.titles.en || s.titles.ru || s.titles.ja)) || s.typeTitle || q,
      url: BASE + '/catalog/anime/' + s.id,
      subOrDub: 'both' as SubOrDub,
    }))
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {
    const rows = await this.api('/episodes', {seriesId: id, isActive: '1', limit: '1000'})
    if (!Array.isArray(rows)) return []
    return rows.filter((e: any) => Number.isInteger(Number(e.episodeInt)) && Number(e.episodeInt) > 0)
      .map((e: any) => ({id: String(e.id), number: Number(e.episodeInt), title: e.episodeTitle || ('Серия ' + e.episodeInt), url: BASE + '/episodes/' + e.id}))
      .sort((a: EpisodeDetails, b: EpisodeDetails) => a.number - b.number)
  }

  async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
    const token = $getUserPreference('apiToken')
    if (!token) throw new Error('Set Anime365 API Token in the extension settings.')
    const translations = await this.api('/translations', {episodeId: episode.id, isActive: '1', limit: '100'})
    if (!Array.isArray(translations) || !translations.length) throw new Error('No Anime365 translations for episode ' + episode.id)
    const sources: VideoSource[] = []
    for (const t of translations) {
      if (!['voiceRu','subRu'].includes(t.type)) continue
      let embed: any
      try {
          embed = await this.api('/translations/embed/' + t.id, {access_token: token})
      } catch (err) { continue }
      const author = t.authorsSummary || t.title || t.type
      // API embed schema is intentionally permissive; only direct media URLs are accepted.
      const entries: any[] = []
      for (const k of ['streams','streamUrls','downloads','downloadUrls','videos','urls','videoUrls']) {
        if (Array.isArray(embed[k])) entries.push(...embed[k])
      }
      if (embed.streamUrl) entries.push(embed.streamUrl)
      if (embed.videoUrl) entries.push(embed.videoUrl)
      for (const entry of entries) {
        const url = typeof entry === 'string' ? entry : (entry.url || entry.src || entry.href || '')
        if (typeof url !== 'string' || !/^https:\/\//.test(url)) continue
        const clean = url.split('?')[0].toLowerCase()
        if (!clean.endsWith('.mp4') && !clean.endsWith('.m3u8')) continue
        const type = clean.endsWith('.m3u8') ? 'm3u8' : 'mp4'
        const quality = (typeof entry === 'object' && (entry.quality || entry.label)) || 'auto'
        sources.push({url, type, quality: String(quality) + ' · ' + author, label: author, subtitles: []})
      }
    }
    if (!sources.length) throw new Error('Anime365 returned no compatible direct MP4/HLS links. The embed response needs mapping; see README.')
    return {server: SERVER, headers: {Referer: BASE + '/'}, videoSources: sources}
  }
}

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
      for (const option of Array.isArray(embed.stream) ? embed.stream : []) {
        for (const [index, url] of (Array.isArray(option.urls) ? option.urls : []).entries()) {
          if (typeof url !== 'string' || !/^https:\/\//.test(url)) continue
          const type = url.split('?')[0].toLowerCase().endsWith('.mp4') ? 'mp4' : 'm3u8'
          sources.push({url, type, quality: option.height + 'p · ' + author + ' · ' + (index + 1), label: author, subtitles: []})
        }
      }
      for (const option of Array.isArray(embed.download) ? embed.download : []) {
        if (typeof option.url !== 'string' || !/^https:\/\//.test(option.url)) continue
        sources.push({url: option.url, type: 'mp4', quality: option.height + 'p · ' + author + ' · download', label: author, subtitles: []})
      }
    }
    if (!sources.length) throw new Error('Anime365 returned no compatible direct MP4/HLS links. The embed response needs mapping; see README.')
    return {server: SERVER, headers: {Referer: BASE + '/'}, videoSources: sources}
  }
}

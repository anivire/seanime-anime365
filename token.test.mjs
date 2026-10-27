import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url)))
assert.equal(manifest.userConfig?.fields?.find(field => field.name === 'apiToken')?.type, 'text')

const requests = []
const source = stripTypeScriptTypes(readFileSync(new URL('./provider.ts', import.meta.url), 'utf8'))
const Provider = runInNewContext(source + '\nProvider', {
    $getUserPreference: () => 'private-test-token',
    fetch: async url => {
        requests.push(url)
        const data = url.includes('/translations/embed/')
            ? {streamUrl: 'https://example.com/video.m3u8'}
            : [{id: 42, type: 'voiceRu'}]
        return {ok: true, text: async () => JSON.stringify({data})}
    },
})
const result = await new Provider().findEpisodeServer({id: '7'}, 'Anime365 (RU)')
assert.equal(result.videoSources.length, 1)
assert.equal(new URL(requests[1]).searchParams.get('access_token'), 'private-test-token')
console.log('Token configuration and playback request: OK')

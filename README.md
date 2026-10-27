<div align="center">

<img src="icon.png" width="96" alt="Anime365 logo">

# Anime365 for Seanime

Watch anime from [Anime365](https://smotret-anime.app) inside [Seanime](https://github.com/5rahim/seanime), with Russian subtitles over the original audio or Russian voice-over.

![type](https://img.shields.io/badge/Seanime-online%20streaming%20provider-6d28d9)
![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fanivire%2Fseanime-anime365%2Fmain%2Fmanifest.json&query=%24.version&label=version&color=6d28d9)
![audio](https://img.shields.io/badge/audio-JP%20%2B%20RU%20subs%20%7C%20RU%20dub-555)
![quality](https://img.shields.io/badge/quality-up%20to%201080p-555)
![subscription](https://img.shields.io/badge/Anime365-subscription%20required-555)

</div>

## Install

In Seanime go to **Extensions** and **Add extension**, paste this URL and confirm:

```
https://raw.githubusercontent.com/anivire/seanime-anime365/main/manifest.json
```

Updates come through the same URL, so later on a click on **Check for updates** is enough.

## Token

Anime365 only hands out video links to accounts with an active subscription, so the extension needs your personal `access_token`.

1. Log in at [smotret-anime.app](https://smotret-anime.app) in your browser.
2. Create API app and generate `access_token`,
3. Copy the `access_token` value from the response and paste it into the **Access Token** field in the extension settings.

The token never expires and only stops working when you change your password. Keep it private: anyone who has it can watch on your subscription. The `app` ID is not a secret.

## Servers

| Server | What's inside | Subtitles |
|---|---|---|
| Русские субтитры (Russian subs, default) | Japanese audio, `subRu` translations | ASS softsubs when the translation has them, otherwise burned in |
| Русская озвучка (Russian dub) | `voiceRu` voice-overs | Signs, when the translation has them |

Pick the server from the dropdown next to the provider; Seanime remembers your choice. Each translation shows up as its own entry in the quality list, e.g. `1080p · Crunchyroll`. The order follows Anime365's own ranking, and the top translation in 1080p plays by default. Each server loads at most 15 translations.

Video streams load directly. Seanime downloads subtitle files on the server for its player, so the extension does not need to proxy them with the video.

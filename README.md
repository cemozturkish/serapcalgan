# The sky on the day you were born

A birthday surprise: open the site, tap, and look up at the real sky over
Istanbul on 19 November 2002 — then watch the stars spell out a birthday wish.

## Personalising it

Everything personal is at the top of [`js/config.js`](js/config.js):

| Setting     | What it does                                                              |
| ----------- | ------------------------------------------------------------------------- |
| `name`      | Her name, written in stars at the end. Leave empty for just the greeting. |
| `birthTime` | Local time of birth (`'12:01'`). The story pauses at that minute.         |
| `from`      | Who it is from: name, birthday and time of birth. Their sky opens the story and the days between the two birthdays are counted. `null` leaves it out. |
| `voice`     | Recorded narration: `{ lang: 'tr', ext: 'm4a' }` once the recordings are in `voice/tr/`. The script is in [`voice/SCRIPT.md`](voice/SCRIPT.md). |
| `lang`      | `'auto'` (Turkish on a Turkish phone, otherwise English), `'en'` or `'tr'` |

All the on-screen text, in both languages, is in the same file.

To preview without editing anything, add parameters to the address:
`?name=Ada&lang=tr&t=21:30` (add `&solo` to preview without the opening part)

## What is real

- **Stars** – 41,411 stars down to magnitude 8 from the Hipparcos-based
  catalogue shipped with d3-celestial, placed for the exact minute and place
  (precession and nutation included). Colours come from each star's B–V index.
- **Sun, Moon, planets** – computed with Astronomy Engine, as seen from the
  Galata Tower. The Moon's phase is drawn from the real Sun–Moon geometry
  (it was full: 99.9 % lit that evening).
- **The Leonid meteor storm** – on 19 November 2002 the Leonids peaked over
  Europe at about 04:10 UT (06:10 in Istanbul) at well over 2,000 meteors an
  hour. Meteors on the site radiate from the true radiant in Leo and follow
  that activity curve; the rate on screen is turned up a little for effect.
- **The skyline** – landmarks sit at their true compass bearings from the
  Galata Tower; their heights are exaggerated so they read as silhouettes.
- **Artistic licence** – the Milky Way is painted procedurally along the real
  galactic plane, and the sky is shown as it would look with no city lights
  and no moonlight washing out the faint stars.

## Running it locally

It is a plain static site with no build step:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Rebuilding the star data

```sh
npm install d3-celestial
node tools/build-data.mjs node_modules/d3-celestial/data
```

## Credits

- [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT)
- Star and constellation data from [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD-3-Clause)
- [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) by Christian Thalmann (SIL OFL)

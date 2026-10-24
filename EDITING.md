# Editing the TV lists

Two TV apps read their lists from this site every time they open:

| App on the TV | File you edit | What the TV downloads |
|---|---|---|
| **YouTube** | [`config/youtube.json`](config/youtube.json) | `config/youtube.json` + `data/youtube.json` |
| **Learn & Earn** | [`config/learn.json`](config/learn.json) | `config/learn.json` + `data/learn.json` |

No rebuild or reinstall is needed. Close the app on the TV and open it again.

> **This repo is public.** Never put the Learn & Earn unlock code or settings PIN here
> (`unlockCode`, `adminPin`), and no API keys. They live only inside the app on the TV.
> The publish script refuses to publish a file that has them.

## Edit on a phone or computer (github.com)

Edit the **gh-pages** branch. That is the branch the TV reads, so the change is live in about a minute:

- YouTube lists: <https://github.com/Think-Define-Create/kidstube-player/edit/gh-pages/config/youtube.json>
- Lessons: <https://github.com/Think-Define-Create/kidstube-player/edit/gh-pages/config/learn.json>

Sign in, change the text, tap **Commit changes**. (On the phone app or mobile site: open the file,
make sure the branch picker says `gh-pages`, then tap the pencil.)

What is live right away and what needs publish:

- **Live right away** (on the next app launch): Featured and other hand-picked videos, lessons, quiz questions, row names
  and order, removing a channel, and moving a channel to another row.
- **Needs `publish`**: the videos *inside* a channel row. The TV can't read YouTube's channel feeds
  itself, so the box looks them up and writes `data/youtube.json`. A channel you just added shows an
  empty row (or no row) until publish runs. Publish also checks every ID and picks up new uploads.
  Run it after you add a channel, and now and then to get fresh videos.

If you break the JSON (for example a missing comma), the TV ignores the broken file and uses
the last published list instead, so nothing breaks on screen. Publish then stops and tells you the line.

## Publish (on the box)

```bash
/workspace/kidstube-player/tools/publish.sh            # pull, check, look up videos, push, wait for Pages
/workspace/kidstube-player/tools/publish.sh --dry-run  # check only, write nothing
```

It pulls first (both `main` and `gh-pages`), so edits made on github.com are included.

## JSON rules (the usual mistakes)

- Text goes in "double quotes". Numbers and `true`/`false` don't.
- Items in a list are separated by commas, and there is **no comma after the last item**.
- Every `{` needs a `}` and every `[` needs a `]`.
- To check a file, paste it into <https://jsonlint.com>.

## YouTube app: `config/youtube.json`

### Add a Featured video
Add a line to `"videos"` (they show in this order in the **Featured** row at the top):
```json
{ "id": "7yDmGnA8Hw0", "title": "Can you solve the bridge riddle?", "channel": "TED-Ed" },
```
The **video ID** is the 11 characters after `v=` in `https://www.youtube.com/watch?v=7yDmGnA8Hw0`,
or after `youtu.be/` or `/shorts/`. On the phone: **Share → Copy link** and take the part after the last `/`
(and before any `?`). Type the `title`, since it shows on the card straight away.

### Add a video to another row (for example Soccer Skills)
Add `"row"` to the video's line. It then shows first in that row instead of in Featured:
```json
{ "id": "yREWtO19RQc", "title": "All About Soccer Skills: Defending", "channel": "MOJO", "row": "Soccer Skills" },
```
A row can hold only hand-picked videos, only channels, or both (hand-picked videos come first).

### Remove a video, channel or lesson
Delete its whole `{ ... }` line, and the comma before it if it was the last item.

### Add a channel
Add a line to `"channels"`:
```json
{ "id": "UCsooa4yRKGN_zEE8iknghZA", "name": "TED-Ed", "row": "Think & Grow" },
```
- `row`: channels with the same row name are mixed into one row. A new row name is added after
  the ones in `"rows"`. Add it to `"rows"` to choose its place.
- `name` is the label shown under each video.
- Then run **publish**, so the box looks up the channel's videos (newest first, no Shorts, only videos
  that allow embedding, up to `maxVideosPerChannel`).

**Finding a channel ID** (starts with `UC`, 24 characters; an `@handle` does not work):
- On the box: `node /workspace/kidstube-player/tools/channel-id.js @TEDEd` prints a ready-made line.
- In a browser: open the channel → tap the description / **more** → **Share channel** → **Copy channel ID**.
- Or, if the channel's address is `youtube.com/channel/UC...`, the ID is that `UC...` part.
- Or, on a computer: open the channel page, **View page source**, search for `"externalId":"UC`.

### Other settings
| Key | Meaning |
|---|---|
| `rows` | Order of the channel rows, below Featured. |
| `videosSectionTitle` | Title of the top row (`"Featured"`). |
| `maxVideosPerChannel` | Videos taken from each channel (the feed has at most 15, fewer after Shorts are removed). |
| `maxVideosPerRow` | Cap on a row that mixes several channels. |
| `hideShorts` | `true` leaves Shorts out. |
| `afterVideo` | `"grid"` = back to the home screen when a video ends, `"next"` = play the next one in the row. |
| `playlists` | Optional rows from playlists: `{ "id": "PL...", "name": "...", "row": "..." }` (the part after `list=`). Needs publish too. |

## Learn & Earn: `config/learn.json`

### Add a lesson
Add a block to `"lessons"`:
```json
{
  "videoId": "7yDmGnA8Hw0",
  "title": "Can you solve the bridge riddle?",
  "channel": "TED-Ed",
  "questionsConfirmed": true,
  "questions": [
    { "q": "How many people can be on the bridge at the same time?",
      "answers": ["1", "2", "3", "4"], "correct": 1 },
    { "q": "...", "answers": ["...", "...", "..."], "correct": 0 },
    { "q": "...", "answers": ["...", "...", "..."], "correct": 2 }
  ]
}
```
- 3 to 5 questions, each with 3 or 4 answers.
- `correct` is the **position of the right answer counting from 0** (0 = first, 1 = second, ...).
  Answers are shuffled on screen.
- The same `videoId` can't be used twice.
- Order matters: the TV shows lesson number (day mod number of lessons), so adding or removing a lesson
  changes which lesson falls on which day.
- Keep the words "kid(s)" and "parent" out of titles and questions (publish warns about them).

### Other settings
| Key | Meaning |
|---|---|
| `rewardMinutes` | The number in "You earned N minutes!". |
| `passScore` | `"all"` = every question right first time, or a number such as `4`. |
| `watchPercent` | How much of the video must be watched before the quiz unlocks (10 to 100). |
| `allowReshowCode` | `true` = "Show my code again" after today's lesson is done. |

The **unlock code** and **settings PIN** are changed only in `/workspace/learnearn/config.json` on the
box, followed by a rebuild and reinstall of Learn & Earn.

## How the TV decides what to show
On every launch each app downloads `config/<app>.json` and `data/<app>.json` from
`https://think-define-create.github.io/kidstube-player/` (with `?t=<time>` so no old cached copy is used,
5 second timeout). It uses, best first:
1. the config file, if it is valid, with the channel videos from the data file;
2. the data file (last publish);
3. the last good copy saved on the TV;
4. the copy built into the app.

The YouTube app also tries each channel's live YouTube feed first, in case the TV allows it.

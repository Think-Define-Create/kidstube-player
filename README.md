# kidstube-player

A tiny static player page for the private "Kids YouTube" LG webOS TV app by Think Define Create LLC.

The TV app loads `player.html?v=VIDEO_ID` in a full-screen frame. Being served from a real HTTPS
origin lets YouTube's embedded player (youtube-nocookie.com) identify the embedder, which avoids
YouTube Error 153 that happens when embedding directly from a packaged `file://` TV app.

The page plays only the single video ID it is given and takes commands only from the embedding app.
It contains no keys, tracking, or other content.

#!/bin/bash
# Double-click to run the portal locally. Serves this folder on http://localhost:4173
# and opens it in Chrome. Close the Terminal window (or press Ctrl-C) to stop.

cd "$(dirname "$0")" || exit 1
PORT=4173

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Something is already serving port $PORT — opening the browser."
else
  echo "Starting Tipolo Portal on http://localhost:$PORT"
  ( sleep 1; open -a "Google Chrome" "http://localhost:$PORT/" ) &
  exec python3 -m http.server $PORT
fi

open -a "Google Chrome" "http://localhost:$PORT/"

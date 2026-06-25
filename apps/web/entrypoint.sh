#!/bin/sh
LOG_DIR=/app/logs
mkdir -p "$LOG_DIR"

# Rotate logs if > 10MB (keep 2 old copies)
for f in access.log error.log; do
  if [ -f "$LOG_DIR/$f" ]; then
    size=$(wc -c < "$LOG_DIR/$f")
    if [ "$size" -gt 10485760 ]; then
      [ -f "$LOG_DIR/$f.2" ] && rm "$LOG_DIR/$f.2"
      [ -f "$LOG_DIR/$f.1" ] && mv "$LOG_DIR/$f.1" "$LOG_DIR/$f.2"
      mv "$LOG_DIR/$f" "$LOG_DIR/$f.1"
    fi
  fi
done

exec nginx -g "daemon off;"

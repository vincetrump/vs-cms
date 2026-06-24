#!/bin/sh
LOG=/app/logs/api.log
mkdir -p /app/logs

# Rotate if > 10MB (keep 2 old copies)
if [ -f "$LOG" ]; then
  size=$(wc -c < "$LOG")
  if [ "$size" -gt 10485760 ]; then
    [ -f "$LOG.2" ] && rm "$LOG.2"
    [ -f "$LOG.1" ] && mv "$LOG.1" "$LOG.2"
    mv "$LOG" "$LOG.1"
  fi
fi

exec node dist/main.js 2>&1 | tee -a "$LOG"

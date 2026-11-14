#!/bin/sh
set -eu

mkdir -p /app/data/private-runs /app/data/runs /app/public/runs
chown node:node /app/data /app/data/runs
find /app/data/private-runs /app/public/runs -mindepth 0 ! -user node -exec chown node:node {} +

if [ "$#" -eq 0 ]; then
  set -- sh -c 'npm run db:migrate && exec npm run start'
fi

exec gosu node "$@"

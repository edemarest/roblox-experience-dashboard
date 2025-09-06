#!/usr/bin/env bash
set -euo pipefail

cp -n .env.example .env || true
npm run migrate
npm run dev
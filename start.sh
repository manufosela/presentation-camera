#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-8000}
USER_DEFINED_PORT=false

if [ $# -gt 0 ]; then
  USER_DEFINED_PORT=true
fi

is_port_free() {
  python3 - "$1" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    try:
        sock.bind(('', port))
    except OSError:
        raise SystemExit(1)
PY
}

if $USER_DEFINED_PORT; then
  if ! is_port_free "${PORT}"; then
    echo "El puerto ${PORT} ya está en uso. Elige otro: ./start.sh <puerto>"
    exit 1
  fi
else
  while ! is_port_free "${PORT}"; do
    NEXT=$((PORT + 1))
    echo "Puerto ${PORT} ocupado, probando ${NEXT}..."
    PORT=${NEXT}
  done
fi

echo "Iniciando servidor estático en http://localhost:${PORT}"
echo "Pulsa Ctrl+C para detenerlo."

python3 -m http.server "${PORT}"

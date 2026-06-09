#!/usr/bin/env python3
"""Calcula la latencia round-trip BLE a partir del CSV exportado por la app.

Reproduce la cifra de latencia usada en el capítulo de Resultados de la memoria.
Cada comando registrado por la app tiene una marca de tiempo de envío (ble_tx) y
otra de recepción de la respuesta (ble_rx). La latencia round-trip es la diferencia
entre ambas. El emparejamiento es FIFO, igual que la cola de despacho del servidor:
cada respuesta cierra el comando pendiente más antiguo.

Se excluyen del cálculo:
  - Los envíos periódicos type='samples' (push del servidor, no son respuesta a una
    petición del cliente).
  - Los heartbeat_ack (el servidor no responde a ellos por diseño).

Uso:
    python scripts/latency_from_csv.py <export.csv>
"""
import csv
import re
import sys
import statistics
from collections import defaultdict, deque

# Fuerza UTF-8 en stdout para que los acentos no salgan como mojibake en consolas
# Windows (cp1252). En Linux/Mac no tiene efecto.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

_CMD_RE = re.compile(r"command='(\w+)'")


def _percentile(data, q):
    """Percentil q (0-100) sobre una lista ya ordenada."""
    if not data:
        return 0.0
    k = (len(data) - 1) * q / 100
    lo = int(k)
    if lo == len(data) - 1:
        return data[lo]
    return data[lo] + (data[lo + 1] - data[lo]) * (k - lo)


def main():
    if len(sys.argv) < 2:
        sys.exit("Uso: python scripts/latency_from_csv.py <export.csv>")
    path = sys.argv[1]

    pending = deque()          # (ts_ms, cmd_name) de cada ble_tx a la espera de respuesta
    latencies = []             # latencia round-trip global (ms)
    by_cmd = defaultdict(list)  # latencias agrupadas por comando

    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Asegura orden temporal (el export ya viene ordenado, pero por robustez).
    rows.sort(key=lambda r: int(r["timestamp"]))

    for r in rows:
        ts = int(r["timestamp"])
        kind = r["type"]
        content = r["content"]

        if kind == "ble_tx":
            if "heartbeat" in content:
                continue  # el servidor no responde a heartbeat_ack
            m = _CMD_RE.search(content)
            pending.append((ts, m.group(1) if m else "?"))

        elif kind == "ble_rx":
            if "type='samples'" in content or '"type": "samples"' in content:
                continue  # push periódico, no es respuesta a una petición
            if not pending:
                continue  # respuesta huérfana (sin tx previo emparejable)
            tx_ts, cmd = pending.popleft()
            dt = ts - tx_ts
            if 0 <= dt < 10000:  # descarta huecos por reconexión / desfases
                latencies.append(dt)
                by_cmd[cmd].append(dt)

    if not latencies:
        sys.exit("No se emparejó ninguna petición/respuesta en el CSV.")

    latencies.sort()
    n = len(latencies)

    print("=" * 60)
    print(f"LATENCIA ROUND-TRIP BLE — {path}")
    print("=" * 60)
    print(f"\n  pares petición/respuesta : {n}")
    print(f"  mínimo                   : {latencies[0]:.0f} ms")
    print(f"  mediana                  : {statistics.median(latencies):.0f} ms")
    print(f"  media                    : {statistics.mean(latencies):.0f} ms")
    print(f"  p95                      : {_percentile(latencies, 95):.0f} ms")
    print(f"  máximo                   : {latencies[-1]:.0f} ms")

    print("\n  POR COMANDO")
    print(f"    {'comando':<18}{'n':>5}{'mediana':>10}{'media':>9}{'p95':>8}")
    for cmd, lat in sorted(by_cmd.items(), key=lambda kv: -len(kv[1])):
        lat.sort()
        print(f"    {cmd:<18}{len(lat):>5}{statistics.median(lat):>8.0f}ms"
              f"{statistics.mean(lat):>7.0f}ms{_percentile(lat, 95):>6.0f}ms")


if __name__ == "__main__":
    main()

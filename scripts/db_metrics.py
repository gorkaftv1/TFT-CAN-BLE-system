#!/usr/bin/env python3
"""Extrae métricas de la base de datos de diagnóstico (diagnostics.db).

Genera las cifras usadas en el capítulo de Resultados de la memoria:
  - Totales del dataset (sesiones, muestras, comandos, DTCs).
  - Vehículos distinguibles por VIN (modo 0x09).
  - DTCs leídos por vehículo.
  - Estadísticas por PID (min/max/avg) por vehículo.
  - Cadencia real de la monitorización continua (a partir de monotonic_ts).

Uso:
    python scripts/db_metrics.py [ruta_db]   # por defecto: diagnostics.db
"""
import sqlite3
import sys
import binascii
import statistics
from collections import defaultdict

DB = sys.argv[1] if len(sys.argv) > 1 else "diagnostics.db"


def decode_vin(response_hex):
    """Decodifica la respuesta del modo 0x09 PID 0x02 (cabecera 49 02 01 + ASCII)."""
    try:
        raw = binascii.unhexlify(response_hex)
        return bytes(raw[3:]).decode("ascii", "replace")
    except Exception:
        return response_hex


def main():
    c = sqlite3.connect(DB)
    cur = c.cursor()

    print("=" * 60)
    print(f"MÉTRICAS DE {DB}")
    print("=" * 60)

    # ---- Totales ----
    print("\n[1] TOTALES DEL DATASET")
    for tbl in ("sessions", "samples", "commands", "dtcs"):
        n = cur.execute(f"select count(*) from {tbl}").fetchone()[0]
        print(f"    {tbl:<10} {n}")
    rango = cur.execute("select min(wall_ts), max(wall_ts) from samples").fetchone()
    print(f"    rango temporal: {rango[0]}  ->  {rango[1]}")

    # ---- Vehículos por VIN ----
    print("\n[2] VEHÍCULOS POR VIN (modo 0x09)")
    vin_por_sesion = {}
    for sid, resp in cur.execute("select session_id, response_hex from commands where command='get_vin'"):
        vin = decode_vin(resp)
        vin_por_sesion.setdefault(vin, set()).add(sid)
    for vin, sids in sorted(vin_por_sesion.items()):
        print(f"    {vin:<20} sesiones={sorted(sids)}")

    # ---- DTCs ----
    print("\n[3] DTCs LEÍDOS (por código)")
    for code, desc, n in cur.execute(
        "select code, description, count(*) from dtcs group by code, description order by 3 desc"
    ):
        print(f"    {code:<8} x{n:<3} {str(desc)[:55]}")

    # ---- Stats por PID, opcionalmente filtrando por sesiones ----
    def pid_stats(titulo, session_ids=None):
        print(f"\n[4] ESTADÍSTICAS POR PID — {titulo}")
        if session_ids:
            ph = ",".join("?" * len(session_ids))
            q = (f"select pid,name,unit,count(*),min(value),max(value),round(avg(value),2) "
                 f"from samples where session_id in ({ph}) group by pid,name,unit order by count(*) desc")
            rows = cur.execute(q, tuple(session_ids))
        else:
            rows = cur.execute(
                "select pid,name,unit,count(*),min(value),max(value),round(avg(value),2) "
                "from samples group by pid,name,unit order by pid")
        print(f"    {'pid':>5} {'nombre':<28}{'unid':<6}{'n':>6}{'min':>9}{'max':>9}{'avg':>9}")
        for pid, name, unit, n, mn, mx, av in rows:
            print(f"    0x{pid:02X} {str(name)[:27]:<28}{str(unit):<6}{n:>6}{mn:>9.1f}{mx:>9.1f}{av:>9.1f}")

    # Škoda Yeti (VIN real TMB...) y simulador
    skoda = sorted(vin_por_sesion.get("TMBJF45LXF6022462", set()))
    if skoda:
        pid_stats(f"Škoda Yeti real (sesiones {skoda})", skoda)
    pid_stats("TODAS las sesiones")

    # ---- Cadencia de monitorización ----
    print("\n[5] CADENCIA DE MONITORIZACIÓN (intervalo entre muestras por PID)")
    # sesiones con más muestras = monitorización continua
    big = cur.execute(
        "select session_id, count(*) c from samples group by session_id order by c desc limit 6").fetchall()
    print(f"    {'sesion':>7}{'pids':>6}{'mediana':>10}{'media':>9}{'p10':>7}{'p90':>7}")
    for sid, _ in big:
        rows = cur.execute(
            "select pid, monotonic_ts from samples where session_id=? and monotonic_ts is not null "
            "order by pid, monotonic_ts", (sid,)).fetchall()
        bypid = defaultdict(list)
        for pid, ts in rows:
            bypid[pid].append(ts)
        diffs = []
        for ts in bypid.values():
            for a, b in zip(ts, ts[1:]):
                d = b - a
                if 0 < d < 5:  # descarta huecos por reconexión
                    diffs.append(d)
        if diffs:
            diffs.sort()
            print(f"    {sid:>7}{len(bypid):>6}{statistics.median(diffs)*1000:>9.0f}ms"
                  f"{statistics.mean(diffs)*1000:>8.0f}ms{diffs[len(diffs)//10]*1000:>6.0f}"
                  f"{diffs[len(diffs)*9//10]*1000:>7.0f}")

    c.close()


if __name__ == "__main__":
    main()

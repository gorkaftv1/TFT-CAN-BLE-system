"""Elimina sesiones sin muestras de diagnostics.db y compacta la base de datos."""

import os
import sqlite3
import sys

_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "diagnostics.db"))

if not os.path.exists(_DB_PATH):
    print(f"No se encontró la base de datos: {_DB_PATH}")
    sys.exit(1)

conn = sqlite3.connect(_DB_PATH)
cur = conn.cursor()

cur.execute(
    "SELECT COUNT(*) FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM samples)"
)
count = cur.fetchone()[0]

if count == 0:
    print("No hay sesiones vacías.")
else:
    cur.execute(
        "DELETE FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM samples)"
    )
    conn.commit()
    conn.execute("VACUUM")
    print(f"{count} sesiones vacías eliminadas. DB compactada.")

conn.close()

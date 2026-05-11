"""
Creates fixture.duckdb with source tables at controlled timestamps.
Run once before dbt commands or e2e tests:

    python setup_fixture.py

Tables created in the default DuckDB schema (main):
  - events_fresh      loaded 5 minutes ago  → PASS  (warn=1hr, error=6hr)
  - events_stale      loaded 12 hours ago   → ERROR STALE
  - events_no_config  loaded 7 days ago     → no freshness config on source
"""

import duckdb
import os
from datetime import datetime, timedelta, timezone

db_path = os.path.join(os.path.dirname(__file__), "fixture.duckdb")
now = datetime.now(timezone.utc)

con = duckdb.connect(db_path)

con.execute("""
    CREATE OR REPLACE TABLE events_fresh AS
    SELECT ? AS event_at, 'click' AS event_type
""", [now - timedelta(minutes=5)])

con.execute("""
    CREATE OR REPLACE TABLE events_stale AS
    SELECT ? AS event_at, 'view' AS event_type
""", [now - timedelta(hours=12)])

con.execute("""
    CREATE OR REPLACE TABLE events_no_config AS
    SELECT ? AS event_at, 'session' AS event_type
""", [now - timedelta(days=7)])

con.close()
print(f"fixture.duckdb created at {db_path}")

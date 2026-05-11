{{ config(materialized='table') }}

select
    event_type,
    count(*) as event_count,
    max(event_at) as latest_event_at
from {{ ref('stg_events') }}
group by event_type

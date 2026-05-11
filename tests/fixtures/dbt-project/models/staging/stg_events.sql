{{ config(materialized='view') }}

select
    event_at,
    event_type
from {{ source('raw', 'events_fresh') }}

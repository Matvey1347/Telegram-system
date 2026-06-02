WITH graph_data AS (
  SELECT
    snapshot."workspaceId",
    snapshot."telegramChannelId",
    snapshot."syncedAt",
    graph.key AS metric,
    graph.value->'data' AS payload
  FROM "TelegramChannelStatsSnapshot" snapshot
  CROSS JOIN LATERAL jsonb_each(snapshot."normalizedStats"->'graphs') graph
  WHERE graph.value->>'status' = 'available'
    AND jsonb_typeof(graph.value->'data'->'columns') = 'array'
),
graph_columns AS (
  SELECT
    graph_data.*,
    column_value.value AS graph_column
  FROM graph_data
  CROSS JOIN LATERAL jsonb_array_elements(graph_data.payload->'columns') column_value
),
x_columns AS (
  SELECT
    "workspaceId",
    "telegramChannelId",
    "syncedAt",
    metric,
    payload,
    graph_column
  FROM graph_columns
  WHERE graph_column->>0 = 'x'
),
value_columns AS (
  SELECT
    "workspaceId",
    "telegramChannelId",
    "syncedAt",
    metric,
    payload,
    graph_column,
    graph_column->>0 AS series
  FROM graph_columns
  WHERE graph_column->>0 <> 'x'
),
points AS (
  SELECT
    value_columns."workspaceId",
    value_columns."telegramChannelId",
    value_columns."syncedAt",
    value_columns.metric,
    value_columns.series,
    COALESCE(value_columns.payload->'names'->>value_columns.series, value_columns.series) AS "seriesLabel",
    value_columns.payload->'colors'->>value_columns.series AS color,
    COALESCE(value_columns.payload->'types'->>value_columns.series, 'line') AS "graphType",
    to_timestamp((x_value.value#>>'{}')::double precision / 1000)::date AS date,
    (series_value.value#>>'{}')::double precision AS value
  FROM value_columns
  JOIN x_columns
    ON x_columns."telegramChannelId" = value_columns."telegramChannelId"
   AND x_columns."syncedAt" = value_columns."syncedAt"
   AND x_columns.metric = value_columns.metric
  CROSS JOIN LATERAL jsonb_array_elements(x_columns.graph_column) WITH ORDINALITY x_value(value, ordinal)
  JOIN LATERAL jsonb_array_elements(value_columns.graph_column) WITH ORDINALITY series_value(value, ordinal)
    ON series_value.ordinal = x_value.ordinal
  WHERE x_value.ordinal > 1
    AND series_value.ordinal > 1
),
latest_points AS (
  SELECT DISTINCT ON ("telegramChannelId", metric, series, date)
    "workspaceId",
    "telegramChannelId",
    "syncedAt",
    metric,
    series,
    "seriesLabel",
    color,
    "graphType",
    date,
    value
  FROM points
  ORDER BY "telegramChannelId", metric, series, date, "syncedAt" DESC
)
INSERT INTO "TelegramChannelStatsPoint" (
  "id",
  "workspaceId",
  "telegramChannelId",
  metric,
  series,
  "seriesLabel",
  color,
  "graphType",
  date,
  value,
  "latestSyncedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  md5("telegramChannelId" || metric || series || date::text),
  "workspaceId",
  "telegramChannelId",
  metric,
  series,
  "seriesLabel",
  color,
  "graphType",
  date,
  value,
  "syncedAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM latest_points
ON CONFLICT ("telegramChannelId", metric, series, date)
DO UPDATE SET
  "seriesLabel" = EXCLUDED."seriesLabel",
  color = EXCLUDED.color,
  "graphType" = EXCLUDED."graphType",
  value = EXCLUDED.value,
  "latestSyncedAt" = EXCLUDED."latestSyncedAt",
  "updatedAt" = CURRENT_TIMESTAMP;

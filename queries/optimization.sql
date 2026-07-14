-- =============================================================================
-- Componente de Datos & SQL Avanzado — FinCard
-- Tabla: transactions (Amazon Redshift, ~500M registros)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Consulta 1: Liquidación mensual por aliado (últimos 12 meses) — Redshift
-- -----------------------------------------------------------------------------
-- Notas de optimización para Redshift:
--   * Se filtra por transaction_date ANTES de agrupar para aprovechar zone maps.
--   * Recomendado: DISTKEY(partner_id) y SORTKEY(transaction_date) en la tabla,
--     de modo que el filtro por fecha por bloques y el GROUP BY por aliado
--     no requiera redistribución de datos entre nodos.
SELECT
    t.partner_id,
    t.partner_name,
    TO_CHAR(t.transaction_date, 'YYYY-MM')            AS year_month,
    SUM(t.points_earned)                              AS total_earned,
    SUM(t.points_redeemed)                            AS total_redeemed,
    SUM(t.points_earned - t.points_redeemed)          AS net_owed
FROM transactions t
WHERE t.transaction_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '12 months'
  AND t.transaction_date <  DATE_TRUNC('month', CURRENT_DATE)
GROUP BY t.partner_id, t.partner_name, TO_CHAR(t.transaction_date, 'YYYY-MM')
ORDER BY year_month DESC, t.partner_id;

-- -----------------------------------------------------------------------------
-- Consulta 2: Liquidación mensual optimizada para Athena (S3 + Parquet)
-- -----------------------------------------------------------------------------
-- Se asume la tabla particionada por year y month (ver plan de particionamiento
-- más abajo). El filtro sobre las COLUMNAS DE PARTICIÓN evita escanear los
-- prefijos de S3 que no correspondan al rango consultado (partition pruning).
SELECT
    partner_id,
    MAX(partner_name)                                 AS partner_name, -- Evita agrupar por strings largos si no es necesario
    CONCAT(year, '-', month)                          AS year_month,
    SUM(points_earned)                                AS total_earned,
    SUM(points_redeemed)                              AS total_redeemed,
    SUM(points_earned - points_redeemed)              AS net_owed
FROM fincard_loyalty.transactions
WHERE CAST(year AS INTEGER) * 100 + CAST(month AS INTEGER)
      >= CAST(date_format(date_add('month', -12, current_date), '%Y%m') AS INTEGER)
GROUP BY partner_id, partner_name, CONCAT(year, '-', month)
ORDER BY year_month DESC, t.partner_id;

-- -----------------------------------------------------------------------------
-- Consulta 3: Detección de anomalías (>50% de cambio vs mes anterior)
-- -----------------------------------------------------------------------------
WITH monthly AS (
    SELECT
        partner_id,
        partner_name,
        DATE_TRUNC('month', transaction_date)             AS month_start,
        SUM(points_earned - points_redeemed)              AS net_points
    FROM transactions
    GROUP BY partner_id, partner_name, DATE_TRUNC('month', transaction_date)
),
with_previous AS (
    SELECT
        partner_id,
        partner_name,
        month_start,
        net_points,
        LAG(month_start) OVER (PARTITION BY partner_id ORDER BY month_start) AS prev_month_start,
        LAG(net_points)  OVER (PARTITION BY partner_id ORDER BY month_start) AS prev_net_points
    FROM monthly
)
SELECT
    partner_id,
    partner_name,
    TO_CHAR(month_start, 'YYYY-MM')                       AS current_month,
    net_points                                            AS current_net,
    TO_CHAR(prev_month_start, 'YYYY-MM')                  AS prev_month,
    prev_net_points                                       AS prev_net,
    ROUND(
        100.0 * (net_points - prev_net_points) / NULLIF(ABS(prev_net_points), 0),
        2
    )                                                     AS pct_change
FROM with_previous
WHERE prev_net_points IS NOT NULL
  -- Solo meses consecutivos: evita comparar contra meses con huecos.
  AND prev_month_start = month_start - INTERVAL '1 month'
  AND ABS(net_points - prev_net_points) > 0.5 * NULLIF(ABS(prev_net_points), 0)
ORDER BY ABS(100.0 * (net_points - prev_net_points) / NULLIF(ABS(prev_net_points), 0)) DESC;

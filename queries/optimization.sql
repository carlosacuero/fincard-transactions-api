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
--     de modo que el filtro por fecha pode bloques y el GROUP BY por aliado
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
ORDER BY t.partner_id, year_month;

-- -----------------------------------------------------------------------------
-- Consulta 2: Liquidación mensual optimizada para Athena (S3 + Parquet)
-- -----------------------------------------------------------------------------
-- Se asume la tabla particionada por year y month (ver plan de particionamiento
-- más abajo). El filtro sobre las COLUMNAS DE PARTICIÓN evita escanear los
-- prefijos de S3 que no correspondan al rango consultado (partition pruning).
SELECT
    partner_id,
    partner_name,
    CONCAT(year, '-', month)                          AS year_month,
    SUM(points_earned)                                AS total_earned,
    SUM(points_redeemed)                              AS total_redeemed,
    SUM(points_earned - points_redeemed)              AS net_owed
FROM fincard_loyalty.transactions
WHERE CAST(year AS INTEGER) * 100 + CAST(month AS INTEGER)
      >= CAST(date_format(date_add('month', -12, current_date), '%Y%m') AS INTEGER)
GROUP BY partner_id, partner_name, CONCAT(year, '-', month)
ORDER BY partner_id, year_month;

-- Estrategias para reducir costos en Athena ($5.00/TB escaneado):
--
-- 1. PARTICIONAMIENTO: particionar por year/month (y opcionalmente partner_id)
--    hace que Athena solo lea los prefijos de S3 del rango consultado.
--    Una consulta de 12 meses deja de escanear todo el histórico.
--
-- 2. FORMATO COLUMNAR (Parquet) + PROYECCIÓN DE COLUMNAS: Athena solo lee las
--    columnas referenciadas en la consulta. Seleccionar 5 columnas de 9 reduce
--    el escaneo proporcionalmente; con CSV siempre se lee la fila completa.
--
-- 3. COMPRESIÓN Y ESTADÍSTICAS: Parquet con compresión Snappy/ZSTD reduce los
--    bytes escaneados (el costo se calcula sobre datos comprimidos) y sus
--    estadísticas min/max por "row group" permiten saltar bloques completos
--    (predicate pushdown).
--
-- 4. (Adicional) ARCHIVOS DE TAMAÑO ÓPTIMO (128–512 MB) y CTAS para
--    pre-agregar: materializar una tabla mensual agregada con CTAS hace que
--    los reportes recurrentes escaneen MB en lugar de TB.
--
-- Plan de particionamiento sugerido para la tabla de Athena:
--
--   s3://fincard-transactions/year=2026/month=07/partner_id=PART01/part-0001.parquet
--
--   CREATE EXTERNAL TABLE fincard_loyalty.transactions (
--       transaction_id   STRING,
--       member_id        STRING,
--       points_earned    INT,
--       points_redeemed  INT,
--       transaction_date DATE,
--       partner_name     STRING,
--       processed_at     TIMESTAMP,
--       batch_id         STRING
--   )
--   PARTITIONED BY (year STRING, month STRING, partner_id STRING)
--   STORED AS PARQUET
--   LOCATION 's3://fincard-transactions/'
--   TBLPROPERTIES ('parquet.compression' = 'SNAPPY');
--
--   Justificación: year/month cubren los reportes mensuales (patrón de acceso
--   dominante) y partner_id acelera las liquidaciones por aliado. Se evita
--   particionar por día para no generar millones de particiones pequeñas.
--
-- Parquet vs CSV:
--   * Columnar: solo se leen las columnas consultadas (CSV lee todo).
--   * Comprimido y binario: 5–10x menos bytes escaneados => menor costo.
--   * Tipado: evita CAST en tiempo de consulta y errores de calidad de dato.
--   * Estadísticas por bloque: permiten omitir row groups fuera del filtro.

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

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
--
-- Rango de fechas — patrón de intervalo semiabierto [inicio, fin):
--   * Límite inferior => ">=" (mayor o IGUAL): incluye el primer día del mes
--     inicial (00:00:00). Si se usara ">" estricto se perderían las
--     transacciones ocurridas exactamente en el instante de inicio del mes.
--   * Límite superior => "<" (menor ESTRICTO): excluye el mes actual, que
--     todavía está en curso (incompleto). Así se liquidan solo los 12 meses
--     COMPLETOS anteriores: [mes actual - 12 meses, mes actual).
--   Este patrón >= ... < es más seguro que BETWEEN porque no depende de si la
--   columna es DATE o TIMESTAMP ni del último instante del día.
SELECT
    t.partner_id,
    t.partner_name,
    TO_CHAR(t.transaction_date, 'YYYY-MM')            AS year_month,
    SUM(t.points_earned)                              AS total_earned,
    SUM(t.points_redeemed)                            AS total_redeemed,
    SUM(t.points_earned - t.points_redeemed)          AS net_owed
FROM transactions t
WHERE t.transaction_date >= DATEADD('month', -12, DATE_TRUNC('month', CURRENT_DATE))
  AND t.transaction_date <  DATE_TRUNC('month', CURRENT_DATE)
GROUP BY t.partner_id, t.partner_name, TO_CHAR(t.transaction_date, 'YYYY-MM')
ORDER BY year_month DESC, t.partner_id;

-- Variante: si además se quiere incluir el mes actual EN CURSO (parcial),
-- cambiar el límite superior por el inicio del próximo mes y ajustar el
-- inferior a -11 meses para seguir cubriendo 12 meses en total:
--   WHERE t.transaction_date >= DATEADD('month', -11, DATE_TRUNC('month', CURRENT_DATE))
--     AND t.transaction_date <  DATEADD('month',  1, DATE_TRUNC('month', CURRENT_DATE))

-- -----------------------------------------------------------------------------
-- Consulta 2: Liquidación mensual optimizada para Athena (S3 + Parquet)
-- -----------------------------------------------------------------------------
-- Se asume la tabla particionada por year y month (ver plan de particionamiento
-- más abajo). El filtro sobre las COLUMNAS DE PARTICIÓN evita escanear los
-- prefijos de S3 que no correspondan al rango consultado (partition pruning).
--
-- Se agrupa solo por partner_id (y por el mes); partner_name se resuelve con
-- MAX() para NO agrupar por un string largo. El mismo rango de 12 meses
-- completos de la Consulta 1 se expresa aquí sobre el entero YYYYMM derivado de
-- las particiones, con límite inferior ">=" y superior "<" (excluye mes actual).
SELECT
    partner_id,
    MAX(partner_name)                                 AS partner_name,
    CONCAT(year, '-', month)                          AS year_month,
    SUM(points_earned)                                AS total_earned,
    SUM(points_redeemed)                              AS total_redeemed,
    SUM(points_earned - points_redeemed)              AS net_owed
FROM fincard_loyalty.transactions
WHERE CAST(year AS INTEGER) * 100 + CAST(month AS INTEGER)
          >= CAST(date_format(date_add('month', -12, current_date), '%Y%m') AS INTEGER)
  AND CAST(year AS INTEGER) * 100 + CAST(month AS INTEGER)
          <  CAST(date_format(current_date, '%Y%m') AS INTEGER)
GROUP BY partner_id, CONCAT(year, '-', month)
ORDER BY year_month DESC, partner_id;

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
  AND prev_month_start = DATEADD('month', -1, month_start)
  -- Cambio de más del 50% en valor absoluto respecto al mes anterior.
  AND ABS(net_points - prev_net_points) > 0.5 * NULLIF(ABS(prev_net_points), 0)
ORDER BY ABS(100.0 * (net_points - prev_net_points) / NULLIF(ABS(prev_net_points), 0)) DESC;

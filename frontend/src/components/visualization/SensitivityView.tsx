import { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Card } from '../shared/Card';
import { Legend } from '../shared/Legend';
import { COLORS } from '../../lib/constants';
import type { SweepResult, SweepPoint, NetworkStage } from '../../types/simulation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<NetworkStage, string> = {
  random: '#D4D4D2',
  nhood: '#1F6C9F',
  school: '#346538',
  earnings: '#956400',
};

const STAGE_LABELS: Record<NetworkStage, string> = {
  random: '随机网络',
  nhood: '社区网络',
  school: '学校网络',
  earnings: '收入网络',
};

const GRID_LINE = '#F0F0EE';
const TEXT_SECONDARY = '#787774';
const TRANSITION_MS = 600;

const MARGIN = { top: 20, right: 32, bottom: 44, left: 52 };
const CHART_HEIGHT = 420;

// ---------------------------------------------------------------------------
// Metric definitions
// ---------------------------------------------------------------------------

interface MetricOption {
  key: string;
  label: string;
  accessor: (p: SweepPoint) => number | null;
  format: (n: number) => string;
}

const METRICS: MetricOption[] = [
  {
    key: 'gini',
    label: '基尼系数',
    accessor: (p) => p.gini_true,
    format: (n) => n.toFixed(3),
  },
  {
    key: 'race_gap',
    label: '种族差距',
    accessor: (p) => p.race_gap_true,
    format: (n) => n.toFixed(3),
  },
  {
    key: 'bias',
    label: '偏差',
    accessor: (p) => p.gini_bias,
    format: (n) => n.toFixed(4),
  },
];

// ---------------------------------------------------------------------------
// Tooltip state
// ---------------------------------------------------------------------------

interface TooltipDatum {
  stage: NetworkStage;
  stageLabel: string;
  paramValue: number;
  metricValue: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SensitivityViewProps {
  sweepResult: SweepResult | null;
  loading: boolean;
  onJumpToParam?: (value: number) => void;
  error: string | null;
  onRunSweep?: (paramKey: string) => void;
  sweepRunning?: boolean;
  sweepParams?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a map from network stage to an array of {param_value, metric_value, original_point},
 * filtering out null metric values for the selected metric.
 */
function buildSeriesData(
  sweepResult: SweepResult,
  accessor: (p: SweepPoint) => number | null,
): Map<NetworkStage, { param_value: number; value: number; point: SweepPoint }[]> {
  const map = new Map<NetworkStage, { param_value: number; value: number; point: SweepPoint }[]>();

  for (const series of sweepResult.series) {
    const pts: { param_value: number; value: number; point: SweepPoint }[] = [];
    for (const point of series.points) {
      const val = accessor(point);
      if (val !== null && val !== undefined && !Number.isNaN(val)) {
        pts.push({ param_value: point.param_value, value: val, point });
      }
    }
    if (pts.length > 1) {
      // sort by param value ascending so the line draws left-to-right
      pts.sort((a, b) => a.param_value - b.param_value);
      map.set(series.network_stage, pts);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// SensitivityView Component
// ---------------------------------------------------------------------------

export function SensitivityView({
  sweepResult,
  loading,
  onJumpToParam,
  error,
  onRunSweep,
  sweepRunning,
  sweepParams,
}: SensitivityViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [selectedMetricKey, setSelectedMetricKey] = useState('gini');
  const [containerWidth, setContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    datum: TooltipDatum | null;
  }>({ x: 0, y: 0, datum: null });

  const metric = METRICS.find((m) => m.key === selectedMetricKey)!;

  // Sweep parameter selector
  const availableParams = sweepParams || [
    'beta_race_income', 'beta_race_nhood', 'beta_race_school', 'beta_race_earnings',
    'beta_ability_school', 'beta_ability_earnings', 'beta_nhood_school', 'beta_school_earnings',
  ];
  const [selectedSweepParam, setSelectedSweepParam] = useState(availableParams[0] || 'beta_race_earnings');

  // -----------------------------------------------------------------------
  // Measure container width on resize
  // -----------------------------------------------------------------------

  const measure = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // -----------------------------------------------------------------------
  // D3 rendering
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!sweepResult || containerWidth === 0) return;

    const svg = d3.select(svgRef.current!);
    svg.selectAll('*').remove();

    const width = containerWidth;
    const height = CHART_HEIGHT;
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    svg.attr('width', width).attr('height', height);

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // ── Build per-stage data ──
    const stageDataMap = buildSeriesData(sweepResult, metric.accessor);

    // ── Compute combined extent across all stages ──
    const allParamVals: number[] = [];
    const allMetricVals: number[] = [];
    for (const [, pts] of stageDataMap) {
      for (const pt of pts) {
        allParamVals.push(pt.param_value);
        allMetricVals.push(pt.value);
      }
    }

    if (allParamVals.length === 0 || allMetricVals.length === 0) {
      // No data for the selected metric
      g.append('text')
        .attr('x', innerW / 2)
        .attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', TEXT_SECONDARY)
        .style('font-family', "'Geist Sans', sans-serif")
        .style('font-size', '0.8rem')
        .text(`No ${metric.label} data available`);
      return;
    }

    const xExtent = d3.extent(allParamVals) as [number, number];
    const xPad = Math.max((xExtent[1] - xExtent[0]) * 0.06, 0.02);
    const xScale = d3
      .scaleLinear()
      .domain([xExtent[0] - xPad, xExtent[1] + xPad])
      .range([0, innerW])
      .nice();

    const yExtent = d3.extent(allMetricVals) as [number, number];
    const yPad = Math.max((yExtent[1] - yExtent[0]) * 0.12, 0.01);
    const yScale = d3
      .scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([innerH, 0])
      .nice();

    // ── Grid lines (horizontal) ──
    const yTicks = yScale.ticks(7);
    g.selectAll('.grid-h')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'grid-h')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', GRID_LINE)
      .attr('stroke-width', 0.5);

    // ── X axis ──
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(7)
      .tickSize(5)
      .tickFormat(d3.format('.3f'));
    const xAxisG = g
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis);

    xAxisG.select('.domain').attr('stroke', GRID_LINE).attr('stroke-width', 0.5);
    xAxisG
      .selectAll('.tick line')
      .attr('stroke', GRID_LINE)
      .attr('stroke-width', 0.5);
    xAxisG
      .selectAll('.tick text')
      .attr('fill', TEXT_SECONDARY)
      .style('font-family', "'Geist Sans', sans-serif")
      .style('font-size', '0.65rem');

    // X-axis label (parameter name)
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 34)
      .attr('text-anchor', 'middle')
      .attr('fill', TEXT_SECONDARY)
      .style('font-family', "'Geist Sans', sans-serif")
      .style('font-size', '0.65rem')
      .text(sweepResult.sweep_param_label);

    // ── Y axis ──
    const yAxis = d3.axisLeft(yScale).ticks(7).tickSize(5).tickFormat(d3.format('.3f'));
    const yAxisG = g.append('g').attr('class', 'y-axis').call(yAxis);

    yAxisG.select('.domain').attr('stroke', GRID_LINE).attr('stroke-width', 0.5);
    yAxisG
      .selectAll('.tick line')
      .attr('stroke', GRID_LINE)
      .attr('stroke-width', 0.5);
    yAxisG
      .selectAll('.tick text')
      .attr('fill', TEXT_SECONDARY)
      .style('font-family', "'Geist Sans', sans-serif")
      .style('font-size', '0.65rem');

    // ── Y-axis label ──
    g.append('text')
      .attr('x', -innerH / 2)
      .attr('y', -40)
      .attr('transform', 'rotate(-90)')
      .attr('text-anchor', 'middle')
      .attr('fill', TEXT_SECONDARY)
      .style('font-family', "'Geist Sans', sans-serif")
      .style('font-size', '0.65rem')
      .style('letter-spacing', '0.03em')
      .text(metric.label);

    // ── Line generator ──
    const lineGen = d3
      .line<{ param_value: number; value: number }>()
      .x((d) => xScale(d.param_value))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // ── Draw one line + dots per stage ──
    for (const [stage, pts] of stageDataMap) {
      const color = STAGE_COLORS[stage];

      // Line path — animated from zero length
      const path = g
        .append('path')
        .datum(pts)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('d', lineGen);

      const totalLen = (path.node() as SVGPathElement | null)?.getTotalLength?.() ?? 0;
      if (totalLen > 0) {
        path
          .attr('stroke-dasharray', `${totalLen} ${totalLen}`)
          .attr('stroke-dashoffset', totalLen)
          .transition()
          .duration(TRANSITION_MS)
          .ease(d3.easeCubicOut)
          .attr('stroke-dashoffset', 0);
      }

      // ── Data point dots ──
      const dotG = g
        .selectAll(`.dot-${stage}`)
        .data(pts)
        .enter()
        .append('g')
        .attr('class', `dot-${stage}`)
        .attr(
          'transform',
          (d) => `translate(${xScale(d.param_value)},${yScale(d.value)})`,
        )
        .style('cursor', 'pointer');

      // Invisible wide hit-target
      dotG
        .append('circle')
        .attr('r', 10)
        .attr('fill', 'transparent')
        .attr('stroke', 'none');

      // Visible dot
      dotG
        .append('circle')
        .attr('r', 3.5)
        .attr('fill', color)
        .attr('stroke', '#FFFFFF')
        .attr('stroke-width', 1.2)
        .attr('opacity', 0)
        .transition()
        .delay(TRANSITION_MS * 0.6)
        .duration(TRANSITION_MS * 0.4)
        .attr('opacity', 1);

      // ── Interaction: hover + click ──
      dotG
        .on('mouseenter', function (event, d) {
          d3.select(this)
            .select('circle:nth-child(2)')
            .transition()
            .duration(120)
            .attr('r', 5.5)
            .attr('stroke-width', 2);

          const [mx, my] = d3.pointer(event, svgRef.current!);
          setTooltip({
            x: mx,
            y: my,
            datum: {
              stage,
              stageLabel: STAGE_LABELS[stage],
              paramValue: d.param_value,
              metricValue: d.value,
            },
          });
        })
        .on('mousemove', function (event) {
          const [mx, my] = d3.pointer(event, svgRef.current!);
          setTooltip((prev) => ({ ...prev, x: mx, y: my }));
        })
        .on('mouseleave', function () {
          d3.select(this)
            .select('circle:nth-child(2)')
            .transition()
            .duration(120)
            .attr('r', 3.5)
            .attr('stroke-width', 1.2);
          setTooltip((prev) => ({ ...prev, datum: null }));
        })
        .on('click', function (event, d) {
          event.stopPropagation();
          onJumpToParam?.(d.param_value);
        });
    }

    // ── Inline legend (top-right of chart area) ──
    const stagesInOrder: NetworkStage[] = ['random', 'nhood', 'school', 'earnings'];
    const legendG = svg
      .append('g')
      .attr(
        'transform',
        `translate(${width - MARGIN.right - 140}, ${MARGIN.top + 4})`,
      );

    stagesInOrder.forEach((stage, i) => {
      const y = i * 20;
      const color = STAGE_COLORS[stage];

      // tiny line swatch
      legendG
        .append('line')
        .attr('x1', 0)
        .attr('x2', 18)
        .attr('y1', y + 8)
        .attr('y2', y + 8)
        .attr('stroke', color)
        .attr('stroke-width', 2.5)
        .attr('stroke-linecap', 'round');

      // dot on the line
      legendG
        .append('circle')
        .attr('cx', 9)
        .attr('cy', y + 8)
        .attr('r', 3)
        .attr('fill', color);

      legendG
        .append('text')
        .attr('x', 24)
        .attr('y', y + 12)
        .attr('fill', TEXT_SECONDARY)
        .style('font-family', "'Geist Sans', sans-serif")
        .style('font-size', '0.6rem')
        .text(STAGE_LABELS[stage]);
    });
  }, [sweepResult, selectedMetricKey, containerWidth, metric, onJumpToParam]);

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  const hasData =
    sweepResult !== null &&
    sweepResult.series.length > 0 &&
    sweepResult.series.some((s) => s.points.length > 0);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Card
      title="参数敏感性分析"
      subtitle={
        sweepResult
          ? `参数 ${sweepResult.sweep_param_label} 在不同网络阶段的扫描`
          : '运行参数扫描以查看结果敏感性'
      }
    >
      {/* ── Sweep trigger ── */}
      {onRunSweep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: '0.7rem', fontFamily: "'Geist Sans', sans-serif", color: 'var(--color-ink-secondary)' }}>扫描参数:</span>
          <select value={selectedSweepParam} onChange={(e) => setSelectedSweepParam(e.target.value)}
            style={{ fontSize: '0.7rem', fontFamily: "'Geist Mono', monospace", padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-surface)', color: 'var(--color-ink)', cursor: 'pointer' }}>
            {availableParams.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => onRunSweep(selectedSweepParam)} disabled={sweepRunning}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: '0.7rem', fontFamily: 'var(--font-sans)', backgroundColor: 'var(--color-accent)', color: '#FFF', border: 'none', borderRadius: 'var(--radius-sm)', cursor: sweepRunning ? 'not-allowed' : 'pointer', opacity: sweepRunning ? 0.6 : 1 }}>
            {sweepRunning ? '扫描中...' : '▶ 运行参数扫描'}
          </button>
        </div>
      )}

      {/* ── Metric selector tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {METRICS.map((m) => {
          const active = selectedMetricKey === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelectedMetricKey(m.key)}
              style={{
                padding: '5px 14px',
                fontSize: '0.7rem',
                fontFamily: "'Geist Sans', sans-serif",
                fontWeight: active ? 600 : 400,
                color: active ? '#1A1A1A' : TEXT_SECONDARY,
                background: active ? COLORS.majority.bg : 'transparent',
                border: `1px solid ${active ? COLORS.majority.stroke : COLORS.border}`,
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 150ms ease',
                lineHeight: 1.4,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ── Legend ── */}
      <Legend
        items={[
          { color: STAGE_COLORS.random, label: '随机网络', shape: 'line' },
          { color: STAGE_COLORS.nhood, label: '社区网络', shape: 'line' },
          { color: STAGE_COLORS.school, label: '学校网络', shape: 'line' },
          { color: STAGE_COLORS.earnings, label: '收入网络', shape: 'line' },
        ]}
        className="mb-4"
      />

      {/* ── Loading skeleton ── */}
      {loading && (
        <div
          className="skeleton-shimmer"
          style={{ height: CHART_HEIGHT }}
        />
      )}

      {/* ── Error state ── */}
      {!loading && error && (
        <div
          style={{
            height: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--color-error-text)' }}>{error}</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-ink-secondary)' }}>
            请检查后端状态后重试
          </span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && !hasData && (
        <div
          style={{
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Geist Sans', sans-serif",
            fontSize: '0.8rem',
            color: TEXT_SECONDARY,
          }}
        >
          运行参数扫描以查看敏感性分析。
        </div>
      )}

      {/* ── Chart ── */}
      {!loading && !error && hasData && (
        <div ref={containerRef} style={{ position: 'relative' }}>
          <svg ref={svgRef} style={{ display: 'block' }} />

          {/* Hover tooltip */}
          {tooltip.datum && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(tooltip.x + 14, containerWidth - 190),
                top: Math.max(tooltip.y - 60, 0),
                background: '#FFFFFF',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: '0.7rem',
                fontFamily: "'Geist Sans', sans-serif",
                color: '#1A1A1A',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                pointerEvents: 'none',
                zIndex: 30,
                whiteSpace: 'nowrap',
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 3,
                  color: STAGE_COLORS[tooltip.datum.stage],
                  fontSize: '0.75rem',
                }}
              >
                {tooltip.datum.stageLabel}
              </div>
              <div style={{ color: TEXT_SECONDARY }}>
                {sweepResult.sweep_param_label}:{' '}
                <span style={{ color: '#1A1A1A', fontWeight: 500 }}>
                  {tooltip.datum.paramValue.toFixed(3)}
                </span>
              </div>
              <div style={{ color: TEXT_SECONDARY }}>
                {metric.label}:{' '}
                <span style={{ color: '#1A1A1A', fontWeight: 500 }}>
                  {metric.format(tooltip.datum.metricValue)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Summary footnote ── */}
      {!loading && !error && sweepResult && sweepResult.summary.max_gini_bias_stage && (
        <p
          style={{
            marginTop: 12,
            marginBottom: 0,
            fontFamily: "'Geist Sans', sans-serif",
            fontSize: '0.65rem',
            color: TEXT_SECONDARY,
          }}
        >
          最大基尼偏差出现在 {sweepResult.summary.max_gini_bias_stage} 阶段
          {sweepResult.summary.max_gini_bias !== null &&
            ` (${sweepResult.summary.max_gini_bias.toFixed(4)})`}
          。
        </p>
      )}
    </Card>
  );
}

export default SensitivityView;

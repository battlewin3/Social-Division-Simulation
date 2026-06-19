import { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Card } from '../shared/Card';
import { Legend } from '../shared/Legend';
import type { GodsEyeStats, PerceptionData } from '../../types/simulation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricDef {
  key: string;
  label: string;
  truthAccessor: (g: GodsEyeStats) => number | null;
  perceptionAccessor: (p: PerceptionData) => number | null;
  biasAccessor: (p: PerceptionData) => number | null;
  format: (n: number) => string;
}

interface BarChartDatum {
  label: string;
  metricKey: string;
  truthValue: number | null;
  perceivedValue: number | null;
  bias: number | null;
  format: (n: number) => string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRUTH_COLOR = '#2F3437';
const PERCEPTION_FILL = '#E1F3FE';
const PERCEPTION_STROKE = '#1F6C9F';
const BIAS_BG = '#FDEBEC';
const BIAS_TEXT = '#9F2F2D';
const GRID_LINE = '#F0F0EE';
const TEXT_SECONDARY = '#787774';

const BAR_HEIGHT = 18;
const BAR_GAP = 6;
const ROW_HEIGHT = BAR_HEIGHT * 2 + BAR_GAP;
const TOP_PAD = 28;
const BOTTOM_PAD = 4;
const LEFT_PAD = 56;
const RIGHT_PAD = 72;
const CHART_MIN_HEIGHT = TOP_PAD + ROW_HEIGHT + BOTTOM_PAD; // ~74px
const ERROR_TICK_HALF = 4;

const TRANSITION_MS = 750;

// ---------------------------------------------------------------------------
// Metric definitions
// ---------------------------------------------------------------------------

const METRICS: MetricDef[] = [
  {
    key: 'gini',
    label: '基尼系数',
    truthAccessor: (g) => g.gini,
    perceptionAccessor: (p) => p.perception_mean.mean_perceived_gini,
    biasAccessor: (p) => p.biases.gini_bias ?? null,
    format: (n) => n.toFixed(3),
  },
  {
    key: 'race_gap',
    label: '种族收入差距',
    truthAccessor: (g) => g.race_gap,
    perceptionAccessor: (p) => p.perception_mean.mean_perceived_race_gap,
    biasAccessor: (p) => p.biases.race_gap_bias ?? null,
    format: (n) => n.toFixed(3),
  },
  {
    key: 'ability_coef',
    label: 'OLS 能力系数',
    truthAccessor: (g) => g.ols_full.beta_ability ?? null,
    perceptionAccessor: (p) => p.perception_mean.mean_perceived_beta_ability,
    biasAccessor: (p) => p.biases.ability_coef_bias ?? null,
    format: (n) => n.toFixed(3),
  },
  {
    key: 'r_squared',
    label: 'R² 解释力',
    truthAccessor: (g) => g.ols_full.r_squared,
    perceptionAccessor: (p) => p.perception_mean.mean_perceived_r_squared,
    biasAccessor: (p) => null,
    format: (n) => n.toFixed(3),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the four chart-data objects from gods-eye + perception. */
function buildChartData(
  godsEye: GodsEyeStats | null,
  perception: PerceptionData | null,
): BarChartDatum[] {
  return METRICS.map((m) => ({
    label: m.label,
    metricKey: m.key,
    truthValue: godsEye ? m.truthAccessor(godsEye) : null,
    perceivedValue: perception ? m.perceptionAccessor(perception) : null,
    bias: perception ? m.biasAccessor(perception) : null,
    format: m.format,
  }));
}

/** Compute a sensible x-domain for a single chart given its data. */
function computeDomain(d: BarChartDatum): [number, number] {
  const vals: number[] = [];
  if (d.truthValue !== null) vals.push(d.truthValue);
  if (d.perceivedValue !== null) {
    vals.push(d.perceivedValue);
    if (d.bias !== null && d.bias !== undefined) {
      vals.push(d.perceivedValue - Math.abs(d.bias));
      vals.push(d.perceivedValue + Math.abs(d.bias));
    }
  }

  if (vals.length === 0) return [0, 1];

  const minVal = d3.min(vals) ?? 0;
  const maxVal = d3.max(vals) ?? 1;
  const span = maxVal - minVal || 1;

  // Always include 0 so the bar direction is clearly readable
  const lo = Math.min(0, minVal - span * 0.15);
  const hi = Math.max(0, maxVal + span * 0.25);

  // For metrics naturally bounded in [0, 1] (Gini, R²), clamp loosely
  if (d.metricKey === 'gini' || d.metricKey === 'r_squared') {
    return [Math.max(-0.05, lo), Math.min(1.1, hi)];
  }
  if (d.metricKey === 'race_gap') {
    return [Math.max(-0.5, lo), hi];
  }
  return [lo, hi];
}

// ---------------------------------------------------------------------------
// Single horizontal-bar-chart renderer
// ---------------------------------------------------------------------------

function renderChart(
  svgEl: SVGSVGElement,
  datum: BarChartDatum,
  width: number,
  _index: number,
): void {
  const height = CHART_MIN_HEIGHT;
  const sel = d3.select(svgEl);

  // --- clear ---
  sel.selectAll('*').remove();

  sel.attr('width', width).attr('height', height);

  const domain = computeDomain(datum);
  const xScale = d3.scaleLinear().domain(domain).range([LEFT_PAD, width - RIGHT_PAD]);

  const hasAny =
    datum.truthValue !== null || datum.perceivedValue !== null;

  // --- background bias indicator ---
  const truthIsPositive =
    datum.truthValue !== null ? datum.truthValue >= 0 : null;
  const percIsPositive =
    datum.perceivedValue !== null ? datum.perceivedValue >= 0 : null;
  const differentDirection =
    truthIsPositive !== null &&
    percIsPositive !== null &&
    truthIsPositive !== percIsPositive;

  if (differentDirection) {
    sel
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', BIAS_BG)
      .attr('rx', 4)
      .attr('opacity', 0)
      .transition()
      .duration(TRANSITION_MS)
      .attr('opacity', 0.55);
  }

  if (!hasAny) {
    sel
      .append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', TEXT_SECONDARY)
      .style('font-family', "'Geist Mono', 'SF Mono', monospace")
      .style('font-size', '0.7rem')
      .text('No data');
    return;
  }

  // --- x-axis (thin top axis) ---
  const axis = d3.axisTop(xScale).ticks(4).tickSize(3).tickFormat(d3.format('.2f'));
  const axisG = sel.append('g').attr('class', 'x-axis').call(axis);
  axisG
    .selectAll('.tick line')
    .attr('stroke', GRID_LINE)
    .attr('stroke-width', 0.5);
  axisG
    .selectAll('.tick text')
    .attr('fill', TEXT_SECONDARY)
    .style('font-family', "'Geist Sans', sans-serif")
    .style('font-size', '0.6rem');
  axisG.select('.domain').attr('stroke', GRID_LINE).attr('stroke-width', 0.5);

  // --- zero line ---
  if (domain[0] < 0 && domain[1] > 0) {
    sel
      .append('line')
      .attr('x1', xScale(0))
      .attr('x2', xScale(0))
      .attr('y1', TOP_PAD - 2)
      .attr('y2', height - BOTTOM_PAD)
      .attr('stroke', GRID_LINE)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,2');
  }

  // --- row positions ---
  const truthY = TOP_PAD;
  const percY = TOP_PAD + BAR_HEIGHT + BAR_GAP;

  // --- truth bar ---
  if (datum.truthValue !== null) {
    const tVal = datum.truthValue;
    const tX = Math.min(xScale(tVal), xScale(0));
    const tW = Math.abs(xScale(tVal) - xScale(0));

    sel
      .append('rect')
      .attr('x', tX)
      .attr('y', truthY)
      .attr('width', 0)
      .attr('height', BAR_HEIGHT)
      .attr('fill', TRUTH_COLOR)
      .attr('rx', 3)
      .transition()
      .duration(TRANSITION_MS)
      .attr('width', tW);

    // label
    sel
      .append('text')
      .attr('x', xScale(tVal) + (tVal >= 0 ? 4 : -4))
      .attr('y', truthY + BAR_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', tVal >= 0 ? 'start' : 'end')
      .attr('fill', '#1A1A1A')
      .style('font-family', "'Geist Mono', 'SF Mono', monospace")
      .style('font-size', '0.65rem')
      .style('font-weight', '500')
      .text(datum.format(tVal));
  }

  // --- perception bar ---
  if (datum.perceivedValue !== null) {
    const pVal = datum.perceivedValue;
    const pX = Math.min(xScale(pVal), xScale(0));
    const pW = Math.abs(xScale(pVal) - xScale(0));

    sel
      .append('rect')
      .attr('x', pX)
      .attr('y', percY)
      .attr('width', 0)
      .attr('height', BAR_HEIGHT)
      .attr('fill', PERCEPTION_FILL)
      .attr('stroke', PERCEPTION_STROKE)
      .attr('stroke-width', 1)
      .attr('rx', 3)
      .transition()
      .duration(TRANSITION_MS)
      .attr('width', pW);

    // error bars (using bias as ± extent)
    if (datum.bias !== null && datum.bias !== undefined && datum.bias !== 0) {
      const biasAbs = Math.abs(datum.bias);
      const errLo = xScale(pVal - biasAbs);
      const errHi = xScale(pVal + biasAbs);
      const errY = percY + BAR_HEIGHT / 2;

      sel
        .append('line')
        .attr('x1', errLo)
        .attr('x2', errHi)
        .attr('y1', errY)
        .attr('y2', errY)
        .attr('stroke', BIAS_TEXT)
        .attr('stroke-width', 1.2)
        .attr('opacity', 0)
        .transition()
        .delay(TRANSITION_MS * 0.6)
        .duration(TRANSITION_MS * 0.5)
        .attr('opacity', 0.7);

      // end ticks
      [errLo, errHi].forEach((ex) => {
        sel
          .append('line')
          .attr('x1', ex)
          .attr('x2', ex)
          .attr('y1', errY - ERROR_TICK_HALF)
          .attr('y2', errY + ERROR_TICK_HALF)
          .attr('stroke', BIAS_TEXT)
          .attr('stroke-width', 1.2)
          .attr('opacity', 0)
          .transition()
          .delay(TRANSITION_MS * 0.6)
          .duration(TRANSITION_MS * 0.5)
          .attr('opacity', 0.7);
      });
    }

    // label
    sel
      .append('text')
      .attr('x', xScale(pVal) + (pVal >= 0 ? 4 : -4))
      .attr('y', percY + BAR_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', pVal >= 0 ? 'start' : 'end')
      .attr('fill', PERCEPTION_STROKE)
      .style('font-family', "'Geist Mono', 'SF Mono', monospace")
      .style('font-size', '0.65rem')
      .style('font-weight', '500')
      .text(datum.format(pVal));
  }

  // --- row labels ("Truth" / "Perceived") on the left ---
  const labelStyle = {
    'font-family': "'Geist Sans', sans-serif",
    'font-size': '0.6rem',
    fill: TEXT_SECONDARY,
  };

  sel
    .append('text')
    .attr('x', LEFT_PAD - 5)
    .attr('y', truthY + BAR_HEIGHT / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'central')
    .style('font-family', labelStyle['font-family'])
    .style('font-size', labelStyle['font-size'])
    .attr('fill', labelStyle.fill)
    .text('真相');

  sel
    .append('text')
    .attr('x', LEFT_PAD - 5)
    .attr('y', percY + BAR_HEIGHT / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'central')
    .style('font-family', labelStyle['font-family'])
    .style('font-size', labelStyle['font-size'])
    .attr('fill', labelStyle.fill)
    .text('感知');
}

// ---------------------------------------------------------------------------
// StatsView Component
// ---------------------------------------------------------------------------

interface StatsViewProps {
  godsEye: GodsEyeStats | null;
  perception: PerceptionData | null;
  loading: boolean;
  error: string | null;
}

export function StatsView({ godsEye, perception, loading, error }: StatsViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef0 = useRef<SVGSVGElement>(null);
  const svgRef1 = useRef<SVGSVGElement>(null);
  const svgRef2 = useRef<SVGSVGElement>(null);
  const svgRef3 = useRef<SVGSVGElement>(null);
  const svgRefs = [svgRef0, svgRef1, svgRef2, svgRef3];

  const [containerWidth, setContainerWidth] = useState(0);

  // --- measure container width on resize ---
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

  // Each cell is half the grid width (2 columns with 12px gap)
  const cellWidth = Math.max(200, (containerWidth - 12) / 2);

  // --- build chart data ---
  const chartData = buildChartData(godsEye, perception);
  const hasData = godsEye !== null || perception !== null;

  // Metric descriptions
  const METRIC_DESCRIPTIONS: Record<string, string> = {
    gini: '收入不平等程度 (0=完全平等, 1=完全不平等)',
    race_gap: '多数群体与少数群体的平均收入差距',
    ability_coef: '先天能力对劳动收入的因果效应',
    r_squared: '模型对收入变异的解释比例',
  };

  // --- D3 rendering ---
  useEffect(() => {
    if (!hasData || containerWidth === 0) return;

    chartData.forEach((datum, i) => {
      const svgEl = svgRefs[i].current;
      if (svgEl) {
        renderChart(svgEl, datum, cellWidth, i);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [godsEye, perception, cellWidth]);

  // --- Render ---
  return (
    <Card
      title="客观真相 vs 个体感知"
      subtitle="客观统计与智能体主观信念的小图对比"
    >
      {/* Legend */}
      <Legend
        items={[
          { color: TRUTH_COLOR, label: '客观真相', shape: 'rect' },
          { color: PERCEPTION_FILL, label: '平均感知', shape: 'rect' },
          { color: BIAS_BG, label: '符号偏差', shape: 'rect' },
        ]}
        className="mb-4"
      />

      {/* Loading skeleton */}
      {loading && (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton-shimmer"
              style={{ height: CHART_MIN_HEIGHT }}
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          className="flex flex-col items-center justify-center gap-2"
          style={{ height: 160, fontFamily: 'var(--font-sans)' }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--color-error-text)' }}>{error}</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-ink-secondary)' }}>
            请检查后端状态后重试
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !hasData && (
        <div
          className="flex items-center justify-center text-text-secondary"
          style={{ height: 160, fontFamily: "'Geist Sans', sans-serif", fontSize: '0.8rem' }}
        >
          运行模拟以查看统计对比。
        </div>
      )}

      {/* Charts grid — always render the measure container so ResizeObserver can bind */}
      <div ref={containerRef}>
        {!loading && !error && hasData && (
          <>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: '1fr 1fr',
              }}
            >
            {chartData.map((datum, i) => (
              <div
                key={datum.metricKey}
                className="bg-surface border border-border rounded-card overflow-hidden"
                style={{ padding: '4px 6px 2px 6px' }}
              >
                {/* Metric title */}
                <div
                  className="text-label uppercase tracking-wider mb-0.5"
                  style={{
                    fontFamily: "'Geist Sans', sans-serif",
                    fontSize: '0.6rem',
                    color: TEXT_SECONDARY,
                    paddingLeft: LEFT_PAD,
                  }}
                >
                  {datum.label}
                </div>

                <svg ref={svgRefs[i]} />
                <div style={{ fontFamily: "'Geist Sans', sans-serif", fontSize: '0.55rem', color: TEXT_SECONDARY, paddingLeft: LEFT_PAD, paddingTop: 2, lineHeight: 1.3 }}>
                  {METRIC_DESCRIPTIONS[datum.metricKey] || ''}
                </div>
              </div>
            ))}
          </div>

          {/* Summary footnote */}
          {perception && (
            <p
              className="mt-3 mb-0"
              style={{
                fontFamily: "'Geist Sans', sans-serif",
                fontSize: '0.65rem',
                color: TEXT_SECONDARY,
              }}
            >
              基于 {perception.n_agents_with_inference} 个具有推断数据的智能体。
              {godsEye && (
                <>
                  {' '}
                  总计 N = {godsEye.n_agents} ({godsEye.n_majority} 多数,{' '}
                  {godsEye.n_minority} 少数)
                </>
              )}
            </p>
          )}
          </>
        )}
      </div>
    </Card>
  );
}

export default StatsView;

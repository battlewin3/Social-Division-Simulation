import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Card } from '../shared/Card';
import { Legend } from '../shared/Legend';
import { COLORS } from '../../lib/constants';
import type { AgentData } from '../../types/simulation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterMode = 'all' | 'majority' | 'minority' | 'selected';

interface TrajectoryViewProps {
  agents: AgentData[];
  selectedAgentId: number | null;
  onSelectAgent: (id: number) => void;
  loading: boolean;
  error: string | null;
}

/** Z-score normalized agent for chart rendering. */
interface NormalizedAgent {
  agentId: number;
  race: number;
  zValues: [number, number, number, number]; // income, nhood, school, earnings
}

interface BrushState {
  axisIndex: number;
  y0: number;  // data coordinate
  y1: number;  // data coordinate (y0 may be > y1)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AXIS_LABELS = ['继承阶层', '社区质量', '学校质量', '劳动收入'] as const;
const AXIS_KEYS = ['income', 'nhood_proper', 'school_proper', 'earnings'] as const;

const Y_MIN = -3;
const Y_MAX = 3;

/** Clamp a value to [lo, hi] — replaces removed d3.clamp in D3 v7. */
const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const MAJORITY_HEX = COLORS.majority.text;   // #1F6C9F
const MINORITY_HEX = COLORS.minority.text;   // #956400

const MAJORITY_RGB = { r: 0x1f, g: 0x6c, b: 0x9f };
const MINORITY_RGB = { r: 0x95, g: 0x64, b: 0x00 };

const NORMAL_ALPHA = 0.08;
const BRUSHED_IN_ALPHA = 0.22;
const BRUSHED_OUT_ALPHA = 0.02;

const SELECTED_STROKE_WIDTH = 3;
const MEAN_STROKE_WIDTH = 2;
const MEAN_DASHARRAY = '6,4';

const MARGIN = { top: 16, right: 20, bottom: 56, left: 20 };

const CHART_HEIGHT = 440;
const HOVER_THRESHOLD_PX = 14;
const BRUSH_DRAG_THRESHOLD_PX = 3;

// ---------------------------------------------------------------------------
// Z-score standardization
// ---------------------------------------------------------------------------

function computeZScoredAgents(agents: AgentData[]): NormalizedAgent[] {
  if (agents.length === 0) return [];

  const keys = AXIS_KEYS;
  const means: number[] = [0, 0, 0, 0];
  const stds: number[] = [0, 0, 0, 0];

  // Compute means
  for (const agent of agents) {
    for (let i = 0; i < 4; i++) {
      means[i] += (agent as any)[keys[i]] as number;
    }
  }
  for (let i = 0; i < 4; i++) {
    means[i] /= agents.length;
  }

  // Compute std deviations
  for (const agent of agents) {
    for (let i = 0; i < 4; i++) {
      const v = (agent as any)[keys[i]] as number;
      stds[i] += (v - means[i]) ** 2;
    }
  }
  for (let i = 0; i < 4; i++) {
    stds[i] = Math.sqrt(stds[i] / agents.length);
  }

  return agents.map((agent) => ({
    agentId: agent.agent_id,
    race: agent.race,
    zValues: keys.map((key, i) => {
      const raw = (agent as any)[key] as number;
      if (stds[i] < 1e-12) return 0;
      return (raw - means[i]) / stds[i];
    }) as NormalizedAgent['zValues'],
  }));
}

// ---------------------------------------------------------------------------
// Group mean computation
// ---------------------------------------------------------------------------

interface GroupMeans {
  majority: [number, number, number, number] | null;
  minority: [number, number, number, number] | null;
}

function computeGroupMeans(normAgents: NormalizedAgent[]): GroupMeans {
  const majVals: number[][] = [[], [], [], []];
  const minVals: number[][] = [[], [], [], []];

  for (const a of normAgents) {
    const bucket = a.race === 1 ? majVals : minVals;
    for (let i = 0; i < 4; i++) {
      bucket[i].push(a.zValues[i]);
    }
  }

  const mean = (arr: number[]) => {
    if (arr.length === 0) return NaN;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  };

  const maj: [number, number, number, number] = [
    mean(majVals[0]), mean(majVals[1]), mean(majVals[2]), mean(majVals[3]),
  ];
  const min: [number, number, number, number] = [
    mean(minVals[0]), mean(minVals[1]), mean(minVals[2]), mean(minVals[3]),
  ];

  const majValid = maj.every((v) => !isNaN(v));
  const minValid = min.every((v) => !isNaN(v));

  return {
    majority: majValid ? maj : null,
    minority: minValid ? min : null,
  };
}

// ---------------------------------------------------------------------------
// Color helpers (with alpha for canvas)
// ---------------------------------------------------------------------------

function rgbaFromHex(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function majorityRGBA(alpha: number): string {
  return rgbaFromHex(MAJORITY_HEX, alpha);
}

function minorityRGBA(alpha: number): string {
  return rgbaFromHex(MINORITY_HEX, alpha);
}

// ---------------------------------------------------------------------------
// Filter button component
// ---------------------------------------------------------------------------

interface FilterButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterButton({ label, active, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Geist Sans', sans-serif",
        fontSize: '0.7rem',
        fontWeight: active ? 600 : 400,
        padding: '4px 12px',
        borderRadius: '6px',
        border: `1px solid ${active ? COLORS.textPrimary : COLORS.border}`,
        backgroundColor: active ? COLORS.textPrimary : COLORS.surface,
        color: active ? COLORS.surface : COLORS.textSecondary,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TrajectoryView({
  agents,
  selectedAgentId,
  onSelectAgent,
  loading,
  error,
}: TrajectoryViewProps) {
  // ---- Refs ----
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ---- State ----
  const [containerWidth, setContainerWidth] = useState(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [brush, setBrush] = useState<BrushState | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<number | null>(null);

  // ---- Derived dimensions ----
  const chartWidth = containerWidth > 0 ? containerWidth : 800;
  const totalHeight = CHART_HEIGHT;
  const plotLeft = MARGIN.left;
  const plotRight = chartWidth - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = totalHeight - MARGIN.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // ---- Scales (memoized) ----
  const axisXPositions = useMemo(() => {
    if (plotWidth <= 0) return [0, 0, 0, 0];
    return [
      plotLeft,
      plotLeft + plotWidth / 3,
      plotLeft + (2 * plotWidth) / 3,
      plotRight,
    ];
  }, [plotLeft, plotRight, plotWidth]);

  const yScale = useMemo(
    () => d3.scaleLinear().domain([Y_MIN, Y_MAX]).range([plotBottom, plotTop]),
    [plotBottom, plotTop],
  );

  // ---- Data processing ----
  const normalizedAgents = useMemo(
    () => computeZScoredAgents(agents),
    [agents],
  );

  const groupMeans = useMemo(
    () => computeGroupMeans(normalizedAgents),
    [normalizedAgents],
  );

  // ---- Filter agents by toggle mode ----
  const filteredAgents = useMemo(() => {
    switch (filterMode) {
      case 'all':
        return normalizedAgents;
      case 'majority':
        return normalizedAgents.filter((a) => a.race === 1);
      case 'minority':
        return normalizedAgents.filter((a) => a.race !== 1);
      case 'selected':
        return normalizedAgents.filter((a) => a.agentId === selectedAgentId);
      default:
        return normalizedAgents;
    }
  }, [normalizedAgents, filterMode, selectedAgentId]);

  // Always include the selected agent if one is chosen and it's not already in the filtered set
  const visibleAgents = useMemo(() => {
    if (selectedAgentId === null) return filteredAgents;
    if (filterMode === 'selected') return filteredAgents;
    const hasSelected = filteredAgents.some((a) => a.agentId === selectedAgentId);
    if (hasSelected) return filteredAgents;
    const sel = normalizedAgents.find((a) => a.agentId === selectedAgentId);
    return sel ? [...filteredAgents, sel] : filteredAgents;
  }, [filteredAgents, normalizedAgents, selectedAgentId, filterMode]);

  const selectedNorm = useMemo(
    () => normalizedAgents.find((a) => a.agentId === selectedAgentId) ?? null,
    [normalizedAgents, selectedAgentId],
  );

  // ---- Resize observer ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setContainerWidth(el.clientWidth);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Canvas rendering ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || plotWidth <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = chartWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${chartWidth}px`;
    canvas.style.height = `${totalHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, chartWidth, totalHeight);

    // ---- Compute brush range in data coords ----
    let brushLo = Y_MIN;
    let brushHi = Y_MAX;
    let hasBrush = false;
    if (brush !== null) {
      hasBrush = true;
      brushLo = Math.min(brush.y0, brush.y1);
      brushHi = Math.max(brush.y0, brush.y1);
    }

    // ---- Draw agent polylines ----
    for (const agent of visibleAgents) {
      const isSelected = agent.agentId === selectedAgentId;
      const isMajority = agent.race === 1;
      const z = agent.zValues;

      // Determine alpha
      let alpha: number;
      if (isSelected) {
        // Selected agent drawn on SVG overlay, skip canvas rendering
        continue;
      } else if (!hasBrush) {
        alpha = NORMAL_ALPHA;
      } else {
        const valOnBrushAxis = z[brush!.axisIndex];
        const inRange = valOnBrushAxis >= brushLo && valOnBrushAxis <= brushHi;
        alpha = inRange ? BRUSHED_IN_ALPHA : BRUSHED_OUT_ALPHA;
      }

      const color = isMajority
        ? `rgba(${MAJORITY_RGB.r},${MAJORITY_RGB.g},${MAJORITY_RGB.b},${alpha})`
        : `rgba(${MINORITY_RGB.r},${MINORITY_RGB.g},${MINORITY_RGB.b},${alpha})`;

      ctx.beginPath();
      ctx.moveTo(axisXPositions[0], yScale(clamp(z[0], Y_MIN, Y_MAX)));
      for (let i = 1; i < 4; i++) {
        ctx.lineTo(axisXPositions[i], yScale(clamp(z[i], Y_MIN, Y_MAX)));
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    ctx.restore();
  }, [
    visibleAgents,
    selectedAgentId,
    axisXPositions,
    yScale,
    plotWidth,
    brush,
    chartWidth,
    totalHeight,
  ]);

  // ---- SVG rendering of axes, brush, selected line, group means ----
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || plotWidth <= 0) return;

    const sel = d3.select(svgEl);
    sel.selectAll('*').remove();

    sel.attr('width', chartWidth).attr('height', totalHeight);

    const svg = sel.append('g');

    // ---- Y axis ticks and grid lines ----
    const yTickValues = d3.range(Y_MIN, Y_MAX + 0.5, 1);

    // Light horizontal grid lines
    svg
      .selectAll('.grid-line')
      .data(yTickValues)
      .join('line')
      .attr('class', 'grid-line')
      .attr('x1', plotLeft)
      .attr('x2', plotRight)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', COLORS.gridLine)
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '2,2');

    // ---- Draw 4 axis vertical lines with tick marks ----
    axisXPositions.forEach((x, axisIdx) => {
      const g = svg.append('g').attr('class', `axis axis-${axisIdx}`);

      // Vertical axis line
      g.append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', plotTop)
        .attr('y2', plotBottom)
        .attr('stroke', COLORS.textSecondary)
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

      // Tick marks
      yTickValues.forEach((val) => {
        const yy = yScale(val);
        g.append('line')
          .attr('x1', x - 5)
          .attr('x2', x + 5)
          .attr('y1', yy)
          .attr('y2', yy)
          .attr('stroke', COLORS.textSecondary)
          .attr('stroke-width', 0.6)
          .attr('opacity', 0.6);

        // Tick labels on first and last axis only to reduce clutter
        if (axisIdx === 0 || axisIdx === 3) {
          g.append('text')
            .attr('x', axisIdx === 0 ? x - 8 : x + 8)
            .attr('y', yy)
            .attr('text-anchor', axisIdx === 0 ? 'end' : 'start')
            .attr('dominant-baseline', 'central')
            .attr('fill', COLORS.textSecondary)
            .style('font-family', "'Geist Mono', 'SF Mono', monospace")
            .style('font-size', '0.55rem')
            .text(val);
        }
      });

      // Axis label below
      g.append('text')
        .attr('x', x)
        .attr('y', plotBottom + 16)
        .attr('text-anchor', 'middle')
        .attr('fill', COLORS.textPrimary)
        .style('font-family', "'Geist Sans', sans-serif")
        .style('font-size', '0.7rem')
        .style('font-weight', '500')
        .text(AXIS_LABELS[axisIdx]);

      // Y-axis label "z-score" on the first axis
      if (axisIdx === 0) {
        g.append('text')
          .attr('x', plotLeft - 6)
          .attr('y', plotTop - 8)
          .attr('text-anchor', 'start')
          .attr('fill', COLORS.textSecondary)
          .style('font-family', "'Geist Sans', sans-serif")
          .style('font-size', '0.55rem')
          .text('z-score');
      }
    });

    // ---- Group mean lines ----
    const drawMeanLine = (
      means: [number, number, number, number],
      color: string,
    ) => {
      const lineFn = d3
        .line<number>()
        .x((_, i) => axisXPositions[i])
        .y((d) => yScale(clamp(d, Y_MIN, Y_MAX)))
        .curve(d3.curveLinear);

      svg
        .append('path')
        .datum(means)
        .attr('d', lineFn)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', MEAN_STROKE_WIDTH)
        .attr('stroke-dasharray', MEAN_DASHARRAY)
        .attr('opacity', 0.7)
        .attr('pointer-events', 'none');
    };

    if (groupMeans.majority) {
      drawMeanLine(groupMeans.majority, MAJORITY_HEX);
    }
    if (groupMeans.minority) {
      drawMeanLine(groupMeans.minority, MINORITY_HEX);
    }

    // ---- Selected agent polyline (SVG overlay, crisp) ----
    if (selectedNorm) {
      const selLine = d3
        .line<number>()
        .x((_, i) => axisXPositions[i])
        .y((d) => yScale(clamp(d, Y_MIN, Y_MAX)))
        .curve(d3.curveLinear);

      // Glow / halo
      svg
        .append('path')
        .datum(selectedNorm.zValues)
        .attr('d', selLine)
        .attr('fill', 'none')
        .attr('stroke', '#FFFFFF')
        .attr('stroke-width', SELECTED_STROKE_WIDTH + 4)
        .attr('opacity', 0.4)
        .attr('pointer-events', 'none');

      // Main selected line
      const selColor =
        selectedNorm.race === 1 ? MAJORITY_HEX : MINORITY_HEX;
      svg
        .append('path')
        .datum(selectedNorm.zValues)
        .attr('d', selLine)
        .attr('fill', 'none')
        .attr('stroke', selColor)
        .attr('stroke-width', SELECTED_STROKE_WIDTH)
        .attr('pointer-events', 'none');

      // Dots at each axis intersection
      selectedNorm.zValues.forEach((zVal, i) => {
        svg
          .append('circle')
          .attr('cx', axisXPositions[i])
          .attr('cy', yScale(clamp(zVal, Y_MIN, Y_MAX)))
          .attr('r', 4)
          .attr('fill', '#FFFFFF')
          .attr('stroke', selColor)
          .attr('stroke-width', 2)
          .attr('pointer-events', 'none');
      });
    }

    // ---- Brush selection rectangle (visual overlay) ----
    if (brush !== null) {
      const bx = axisXPositions[brush.axisIndex];
      const by0 = yScale(brush.y0);
      const by1 = yScale(brush.y1);
      const bY = Math.min(by0, by1);
      const bH = Math.abs(by1 - by0);

      svg
        .append('rect')
        .attr('x', bx - 15)
        .attr('y', bY)
        .attr('width', 30)
        .attr('height', bH)
        .attr('fill', COLORS.textPrimary)
        .attr('opacity', 0.1)
        .attr('stroke', COLORS.textPrimary)
        .attr('stroke-width', 0.8)
        .attr('rx', 2)
        .attr('pointer-events', 'none');
    }
  }, [
    chartWidth,
    totalHeight,
    plotWidth,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    axisXPositions,
    yScale,
    groupMeans,
    selectedNorm,
    brush,
    selectedAgentId,
  ]);

  // ---- Hover detection ----
  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (visibleAgents.length === 0 || selectedNorm) {
        // When a specific agent is selected, hover is less useful
      }

      const svgEl = svgRef.current;
      if (!svgEl) return;

      const rect = svgEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Find closest agent polyline
      let closestId: number | null = null;
      let closestDist = HOVER_THRESHOLD_PX;

      for (const agent of visibleAgents) {
        if (agent.agentId === selectedAgentId) continue;

        let minDist = Infinity;
        for (let seg = 0; seg < 3; seg++) {
          const x0 = axisXPositions[seg];
          const y0 = yScale(clamp(agent.zValues[seg], Y_MIN, Y_MAX));
          const x1 = axisXPositions[seg + 1];
          const y1 = yScale(clamp(agent.zValues[seg + 1], Y_MIN, Y_MAX));

          // Point-to-segment distance
          const dx = x1 - x0;
          const dy = y1 - y0;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-9) {
            const d = Math.hypot(mx - x0, my - y0);
            if (d < minDist) minDist = d;
            continue;
          }

          let t = ((mx - x0) * dx + (my - y0) * dy) / lenSq;
          t = Math.max(0, Math.min(1, t));

          const px = x0 + t * dx;
          const py = y0 + t * dy;
          const d = Math.hypot(mx - px, my - py);
          if (d < minDist) minDist = d;
        }

        if (minDist < closestDist) {
          closestDist = minDist;
          closestId = agent.agentId;
        }
      }

      setHoveredAgentId(closestId);
    },
    [visibleAgents, axisXPositions, yScale, selectedAgentId],
  );

  const handleSvgMouseLeave = useCallback(() => {
    setHoveredAgentId(null);
  }, []);

  // ---- Brush interaction ----
  const brushRef = useRef<{
    active: boolean;
    axisIndex: number;
    startY: number; // screen Y in px
  } | null>(null);

  const handleAxisMouseDown = useCallback(
    (axisIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const svgEl = svgRef.current;
      if (!svgEl) return;

      const rect = svgEl.getBoundingClientRect();
      const my = e.clientY - rect.top;
      const dataY = yScale.invert(my);

      brushRef.current = {
        active: true,
        axisIndex,
        startY: my,
      };

      setBrush({ axisIndex, y0: dataY, y1: dataY });
    },
    [yScale],
  );

  const handleSvgMouseMoveBrush = useCallback(
    (e: React.MouseEvent) => {
      if (!brushRef.current?.active) return;

      const svgEl = svgRef.current;
      if (!svgEl) return;

      const rect = svgEl.getBoundingClientRect();
      const my = e.clientY - rect.top;
      const dataY = yScale.invert(my);

      setBrush({
        axisIndex: brushRef.current.axisIndex,
        y0: yScale.invert(brushRef.current.startY),
        y1: dataY,
      });
    },
    [yScale],
  );

  const handleSvgMouseUpBrush = useCallback(
    (e: React.MouseEvent) => {
      if (!brushRef.current?.active) {
        return;
      }

      const svgEl = svgRef.current;
      if (!svgEl) {
        brushRef.current = null;
        return;
      }

      const rect = svgEl.getBoundingClientRect();
      const my = e.clientY - rect.top;
      const dy = Math.abs(my - brushRef.current.startY);

      if (dy < BRUSH_DRAG_THRESHOLD_PX) {
        // Click without meaningful drag: clear brush
        setBrush(null);
      }
      // else: keep the brush (already set via mousemove)

      brushRef.current = null;
    },
    [],
  );

  // Global mouseup to clear brush interaction
  useEffect(() => {
    const handleGlobalUp = () => {
      brushRef.current = null;
    };
    window.addEventListener('mouseup', handleGlobalUp);
    return () => window.removeEventListener('mouseup', handleGlobalUp);
  }, []);

  // ---- Click on canvas/SVG background to deselect ----
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking on empty space (not on a brushed axis)
      if (brushRef.current?.active) return;
      // Don't clear selection here — the user might want to keep it
    },
    [],
  );

  // ---- Loading / empty states ----
  const isEmpty = !loading && agents.length === 0;
  const agentCount = agents.length;

  // ---- Legend items ----
  const legendItems = [
    { color: MAJORITY_HEX, label: '多数群体', shape: 'line' as const },
    { color: MINORITY_HEX, label: '少数群体', shape: 'line' as const },
    { color: COLORS.textPrimary, label: '选中个体', shape: 'line' as const },
    {
      color: MAJORITY_HEX,
      label: '多数均值 (虚线)',
      shape: 'line' as const,
    },
    {
      color: MINORITY_HEX,
      label: '少数均值 (虚线)',
      shape: 'line' as const,
    },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Card
      title="个体生命轨迹"
      subtitle={
        loading
          ? '加载中...'
          : isEmpty
            ? '无数据'
            : `${agentCount} 个智能体  ·  继承阶层 → 社区质量 → 学校质量 → 劳动收入`
      }
    >
      {/* Legend */}
      <Legend items={legendItems} className="mb-3" />

      {/* Filter toggle buttons */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <FilterButton
          label="全部"
          active={filterMode === 'all'}
          onClick={() => setFilterMode('all')}
        />
        <FilterButton
          label="仅多数"
          active={filterMode === 'majority'}
          onClick={() => setFilterMode('majority')}
        />
        <FilterButton
          label="仅少数"
          active={filterMode === 'minority'}
          onClick={() => setFilterMode('minority')}
        />
        <FilterButton
          label="仅选中"
          active={filterMode === 'selected'}
          onClick={() => setFilterMode('selected')}
        />
        {brush !== null && (
          <span
            style={{
              fontFamily: "'Geist Sans', sans-serif",
              fontSize: '0.65rem',
              color: COLORS.textSecondary,
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: COLORS.textPrimary,
                opacity: 0.4,
              }}
            />
            刷选: {AXIS_LABELS[brush.axisIndex]} [{brush.y0.toFixed(1)}, {brush.y1.toFixed(1)}]
            <button
              onClick={() => setBrush(null)}
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: '0.6rem',
                border: 'none',
                background: 'none',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                padding: 0,
                marginLeft: 4,
              }}
            >
              ✕
            </button>
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div
          className="skeleton-shimmer"
          style={{ height: CHART_HEIGHT, width: '100%' }}
        />
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            height: 160,
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

      {/* Empty state */}
      {!loading && !error && isEmpty && (
        <div
          style={{
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Geist Sans', sans-serif",
            fontSize: '0.8rem',
            color: COLORS.textSecondary,
          }}
        >
          运行仿真以查看个体生命轨迹
        </div>
      )}

      {/* Chart */}
      {!loading && !error && !isEmpty && (
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            width: '100%',
            height: CHART_HEIGHT,
            overflow: 'hidden',
          }}
        >
          {/* Canvas layer: agent polylines */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
            }}
          />

          {/* SVG layer: axes, brush, selected line, group means, interaction */}
          <svg
            ref={svgRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              cursor: hoveredAgentId !== null ? 'pointer' : 'crosshair',
            }}
            onMouseMove={(e) => {
              handleSvgMouseMove(e);
              handleSvgMouseMoveBrush(e);
            }}
            onMouseLeave={handleSvgMouseLeave}
            onMouseUp={handleSvgMouseUpBrush}
            onClick={(e) => {
              if (hoveredAgentId !== null) {
                onSelectAgent(hoveredAgentId);
              }
            }}
          >
            {/* Invisible interaction rects over each axis for brushing */}
            {axisXPositions.map((x, i) => (
              <rect
                key={`brush-rect-${i}`}
                x={x - 15}
                y={plotTop}
                width={30}
                height={plotHeight}
                fill="transparent"
                style={{ cursor: 'col-resize' }}
                onMouseDown={(e) => handleAxisMouseDown(i, e)}
              />
            ))}
          </svg>

          {/* Hover tooltip */}
          {hoveredAgentId !== null && (
            <div
              style={{
                position: 'absolute',
                top: 4,
                right: 8,
                fontFamily: "'Geist Mono', 'SF Mono', monospace",
                fontSize: '0.65rem',
                color: COLORS.textPrimary,
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 4,
                padding: '2px 8px',
                pointerEvents: 'none',
              }}
            >
              Agent #{hoveredAgentId}
            </div>
          )}

          {/* Brushing instruction */}
          {brush === null && (
            <div
              style={{
                position: 'absolute',
                bottom: MARGIN.bottom + 4,
                left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: "'Geist Sans', sans-serif",
                fontSize: '0.6rem',
                color: COLORS.textSecondary,
                pointerEvents: 'none',
                opacity: 0.6,
              }}
            >
              在坐标轴上拖拽以刷选范围  |  悬停轨迹查看个体  |  点击选中个体
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default TrajectoryView;

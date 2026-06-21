import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from 'react';
import * as d3 from 'd3';
import type { NetworkData, NetworkNode } from '../../types/simulation';
import { COLORS } from '../../lib/constants';
import { Card } from '../shared/Card';
import { CaretLeft, GearSix } from '@phosphor-icons/react';
import type { SimNode, CommunityNode, CommunityEdge, ForceParams, HierarchicalNetworkViewProps } from './NetworkCanvas/types';
import { FORCE_DEFAULTS, FORCE_LABELS, FORCE_RANGES } from './NetworkCanvas/types';

// ============================================================
// Helpers
// ============================================================

function raceFill(race: number, alpha: number = 1): string {
  const hex = race === 1 ? COLORS.majority.text : COLORS.minority.text;
  if (alpha >= 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ============================================================
// HierarchicalNetworkView
// ============================================================

export function HierarchicalNetworkView({
  network,
  selectedAgentId,
  onSelectAgent,
  loading,
  error,
}: HierarchicalNetworkViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Hierarchy state
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(null);

  // Force parameter tuning
  const [showForceControls, setShowForceControls] = useState(false);
  const [forceParams, setForceParams] = useState<ForceParams>(
    FORCE_DEFAULTS.community,
  );
  const forceParamsRef = useRef<ForceParams>(FORCE_DEFAULTS.community);
  forceParamsRef.current = forceParams;

  // D3-managed refs (no React re-render)
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simRef = useRef<d3.Simulation<any, any> | null>(null);
  const viewTypeRef = useRef<'community' | 'interior' | null>(null);
  const nodeDataRef = useRef<(CommunityNode | SimNode)[]>([]);

  // ---- Build community data ----
  const communityData = useMemo(() => {
    if (!network || network.nodes.length === 0) return null;

    const nodes = network.nodes;
    const edges = network.edges;

    const groups = new Map<number, NetworkNode[]>();
    for (const node of nodes) {
      const g = node.nhood_proper;
      const bucket = groups.get(g);
      if (bucket) bucket.push(node);
      else groups.set(g, [node]);
    }

    const communities: CommunityNode[] = [];
    for (const [key, members] of groups) {
      const majority = members.filter((n) => n.race === 1).length;
      communities.push({
        id: `c_${key}`,
        groupKey: key,
        label: `社区 ${key}`,
        memberCount: members.length,
        majorityCount: majority,
        minorityCount: members.length - majority,
        radius: Math.max(14, Math.sqrt(members.length) * 2.8),
      });
    }

    const nodeGroup = new Map<number, number>();
    for (const node of nodes) {
      nodeGroup.set(node.id, node.nhood_proper);
    }

    const crossEdges = new Map<string, number>();
    for (const [src, tgt] of edges) {
      const gSrc = nodeGroup.get(src);
      const gTgt = nodeGroup.get(tgt);
      if (gSrc === undefined || gTgt === undefined) continue;
      if (gSrc === gTgt) continue;
      const key = gSrc < gTgt ? `${gSrc}_${gTgt}` : `${gTgt}_${gSrc}`;
      crossEdges.set(key, (crossEdges.get(key) || 0) + 1);
    }

    const commEdges: CommunityEdge[] = [];
    for (const [key, weight] of crossEdges) {
      const [g1, g2] = key.split('_').map(Number);
      commEdges.push({ source: `c_${g1}`, target: `c_${g2}`, weight });
    }

    return { communities, commEdges, nodes, edges, groups };
  }, [network]);

  // Reset drill-down when network changes
  useEffect(() => {
    setSelectedCommunity(null);
  }, [network]);

  // Reset force params when switching community <-> interior
  useEffect(() => {
    const defaults = selectedCommunity === null
      ? FORCE_DEFAULTS.community
      : FORCE_DEFAULTS.interior;
    setForceParams(defaults);
  }, [selectedCommunity]);

  // Update running simulation force when a param changes
  const updateForceParam = useCallback((key: keyof ForceParams, value: number) => {
    setForceParams(prev => ({ ...prev, [key]: value }));
    const sim = simRef.current;
    if (!sim) return;
    const fp = { ...forceParamsRef.current, [key]: value };
    const cx = sizeRef.current.w / 2;
    const cy = sizeRef.current.h / 2;

    switch (key) {
      case 'chargeStrength':
        sim.force('charge', d3.forceManyBody().strength(value));
        break;
      case 'linkDistance': {
        const lf = sim.force('link') as d3.ForceLink<any, any> | undefined;
        if (lf) lf.distance(value);
        break;
      }
      case 'linkStrength': {
        const lf = sim.force('link') as d3.ForceLink<any, any> | undefined;
        if (lf) lf.strength(value);
        break;
      }
      case 'collisionPadding': {
        const nodes = nodeDataRef.current;
        if (nodes.length > 0) {
          const baseR = (d: any) => d.radius || 5;
          sim.force('collision', d3.forceCollide<any>().radius((d: any) => baseR(d) + value));
        }
        break;
      }
      case 'centerStrength':
        sim.force('center', d3.forceCenter(cx, cy).strength(value));
        break;
      case 'alphaDecay':
        sim.alphaDecay(value);
        break;
    }
    // Reheat to visually apply changes
    if (sim.alpha() < 0.01) sim.alpha(0.15).restart();
  }, []);

  // ---- Resize observer ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- D3 zoom behavior (set up once) ----
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (e) => {
        d3.select(svg).select<SVGGElement>('g.zoom-layer')
          .attr('transform', e.transform.toString());
      });
    svg.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    d3.select(svg).call(zoom);
    zoomBehaviorRef.current = zoom;
  }, []);

  // ---- Tooltip helpers ----
  const showTooltip = useCallback((html: string, x: number, y: number) => {
    const el = tooltipRef.current;
    if (!el) return;
    el.innerHTML = html;
    el.style.opacity = '1';
    el.style.left = `${x + 12}px`;
    el.style.top = `${y - 8}px`;
  }, []);

  const hideTooltip = useCallback(() => {
    const el = tooltipRef.current;
    if (!el) return;
    el.style.opacity = '0';
  }, []);

  // ---- Force simulation effect ----
  useEffect(() => {
    if (!communityData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const zoomG = svg.select<SVGGElement>('g.zoom-layer');
    // Clear previous content
    zoomG.selectAll('*').remove();
    // Stop previous simulation
    if (simRef.current) {
      simRef.current.stop();
      simRef.current = null;
    }

    const { communities, commEdges, nodes, edges, groups } = communityData;
    const cx = size.w / 2;
    const cy = size.h / 2;

    if (selectedCommunity === null) {
      // ============ COMMUNITY VIEW ============
      viewTypeRef.current = 'community';

      // Init positions
      for (const node of communities) {
        node.x = cx + (Math.random() - 0.5) * 120;
        node.y = cy + (Math.random() - 0.5) * 120;
      }
      nodeDataRef.current = communities;

      // Edges
      const edgeMap = new Map<string, CommunityNode>();
      for (const n of communities) edgeMap.set(n.id, n);

      const edgeG = zoomG.append('g').attr('class', 'edges');
      const edgeSel = edgeG.selectAll<SVGLineElement, CommunityEdge>('line')
        .data(commEdges)
        .join('line')
        .attr('stroke', '#C8C8C4')
        .attr('stroke-width', d => Math.max(0.4, Math.min(4, d.weight / 8)))
        .attr('stroke-opacity', d => Math.min(0.7, d.weight / 15));

      // Nodes
      const nodeG = zoomG.append('g').attr('class', 'nodes');
      const nodeSel = nodeG.selectAll<SVGGElement, CommunityNode>('g')
        .data(communities)
        .join('g')
        .style('cursor', 'pointer');

      // Majority arc path (relative to group center at 0,0)
      nodeSel.append('path')
        .attr('d', d => {
          const r = d.radius;
          const majPct = d.memberCount > 0 ? d.majorityCount / d.memberCount : 0.5;
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + majPct * Math.PI * 2;
          const x1 = r * Math.cos(startAngle);
          const y1 = r * Math.sin(startAngle);
          const x2 = r * Math.cos(endAngle);
          const y2 = r * Math.sin(endAngle);
          const largeArc = majPct > 0.5 ? 1 : 0;
          return `M0,0L${x1},${y1}A${r},${r} 0 ${largeArc} 1 ${x2},${y2}Z`;
        })
        .attr('fill', COLORS.majority.text);

      // Minority arc path (relative to group center at 0,0)
      nodeSel.append('path')
        .attr('d', d => {
          const r = d.radius;
          const majPct = d.memberCount > 0 ? d.majorityCount / d.memberCount : 0.5;
          const startAngle = -Math.PI / 2 + majPct * Math.PI * 2;
          const endAngle = -Math.PI / 2 + Math.PI * 2;
          const x1 = r * Math.cos(startAngle);
          const y1 = r * Math.sin(startAngle);
          const x2 = r * Math.cos(endAngle);
          const y2 = r * Math.sin(endAngle);
          const largeArc = (1 - majPct) > 0.5 ? 1 : 0;
          return `M0,0L${x1},${y1}A${r},${r} 0 ${largeArc} 1 ${x2},${y2}Z`;
        })
        .attr('fill', COLORS.minority.text);

      // Border circle
      nodeSel.append('circle')
        .attr('r', d => d.radius)
        .attr('fill', 'none')
        .attr('stroke', '#FFFFFF')
        .attr('stroke-width', 2.5);

      nodeSel.append('circle')
        .attr('r', d => d.radius)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(0,0,0,0.08)')
        .attr('stroke-width', 0.8);

      // Label: member count
      nodeSel.append('text')
        .text(d => `${d.memberCount}人`)
        .attr('text-anchor', 'middle')
        .attr('dy', d => -d.radius - 6)
        .attr('font-size', '11px')
        .attr('font-weight', '700')
        .attr('font-family', 'var(--font-sans)')
        .attr('fill', COLORS.textPrimary)
        .style('pointer-events', 'none');

      // Label: nhood group
      nodeSel.append('text')
        .text(d => `nhood=${d.groupKey}`)
        .attr('text-anchor', 'middle')
        .attr('dy', d => d.radius + 14)
        .attr('font-size', '9px')
        .attr('font-family', "'Geist Mono', monospace")
        .attr('fill', COLORS.textSecondary)
        .style('pointer-events', 'none');

      // Hover/click interactions
      nodeSel
        .on('mouseenter', function(e, d) {
          showTooltip(
            `<strong>${d.label}</strong><br/>多数: ${d.majorityCount} · 少数: ${d.minorityCount}<br/>点击查看内部结构`,
            (e as MouseEvent).clientX,
            (e as MouseEvent).clientY,
          );
        })
        .on('mouseleave', hideTooltip)
        .on('click', (e, d) => {
          setSelectedCommunity(d.groupKey);
        });

      // Drag
      nodeSel.call(
        d3.drag<SVGGElement, CommunityNode>()
          .on('start', (e, d) => {
            if (!e.active) simRef.current?.alpha(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (e, d) => {
            d.fx = e.x;
            d.fy = e.y;
          })
          .on('end', (e, d) => {
            if (!e.active) simRef.current?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as any,
      );

      // Simulation
      const fp = forceParamsRef.current;
      const sim = d3.forceSimulation<CommunityNode>(communities)
        .force('link', d3.forceLink<CommunityNode, CommunityEdge>(commEdges)
          .id(d => d.id)
          .distance(e => fp.linkDistance / Math.sqrt(e.weight + 1))
          .strength(e => fp.linkStrength * Math.min(1, e.weight / 5)))
        .force('charge', d3.forceManyBody().strength(fp.chargeStrength))
        .force('center', d3.forceCenter(cx, cy).strength(fp.centerStrength))
        .force('collision', d3.forceCollide<CommunityNode>().radius(d => d.radius + fp.collisionPadding))
        .alphaDecay(fp.alphaDecay)
        .alphaMin(0.001)
        .on('tick', () => {
          // Update edge positions
          edgeSel
            .attr('x1', d => (d.source as unknown as CommunityNode).x!)
            .attr('y1', d => (d.source as unknown as CommunityNode).y!)
            .attr('x2', d => (d.target as unknown as CommunityNode).x!)
            .attr('y2', d => (d.target as unknown as CommunityNode).y!);

          // Update node group positions
          nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
        });

      for (let i = 0; i < 120; i++) sim.tick();
      sim.alphaTarget(0);
      simRef.current = sim;
    } else {
      // ============ INTERIOR VIEW ============
      viewTypeRef.current = 'interior';

      const group = groups.get(selectedCommunity);
      if (!group) return;

      const memberIds = new Set(group.map(n => n.id));
      const intraEdges: [number, number][] = [];
      for (const [src, tgt] of edges) {
        if (memberIds.has(src) && memberIds.has(tgt)) {
          intraEdges.push([src, tgt]);
        }
      }

      const simNodes: SimNode[] = group.map(n => ({
        id: n.id,
        race: n.race,
        earnings: n.earnings,
        radius: 2.5 + 3 * (n.earnings_proper / 10),
      }));
      nodeDataRef.current = simNodes;

      // Init positions
      for (const node of simNodes) {
        node.x = cx + (Math.random() - 0.5) * 100;
        node.y = cy + (Math.random() - 0.5) * 100;
      }

      const linkData = intraEdges.map(([s, t]) => ({ source: s, target: t }));

      // Edges
      const edgeG = zoomG.append('g').attr('class', 'edges');
      const edgeSel = edgeG.selectAll<SVGLineElement, typeof linkData[0]>('line')
        .data(linkData)
        .join('line')
        .attr('stroke', '#E6E6E4')
        .attr('stroke-width', 0.3)
        .attr('stroke-opacity', 0.3);

      // Nodes
      const nodeG = zoomG.append('g').attr('class', 'nodes');
      const nodeSel = nodeG.selectAll<SVGCircleElement, SimNode>('circle')
        .data(simNodes)
        .join('circle')
        .attr('r', d => d.radius)
        .attr('fill', d => raceFill(d.race, 0.7))
        .attr('stroke', '#FFFFFF')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer');

      // Hover & click
      nodeSel
        .on('mouseenter', function(e, d) {
          const el = this as SVGCircleElement;
          d3.select(el)
            .attr('stroke-width', 2.5)
            .attr('stroke', raceFill(d.race))
            .attr('r', d.radius + 2);
          showTooltip(
            `<strong>Agent #${d.id}</strong><br/>` +
            `群体: ${d.race === 1 ? '多数' : '少数'}<br/>` +
            `收入: ${d.earnings.toFixed(3)}`,
            (e as MouseEvent).clientX,
            (e as MouseEvent).clientY,
          );
        })
        .on('mouseleave', function(e, d) {
          const el = this as SVGCircleElement;
          const isSel = d.id === selectedAgentId;
          d3.select(el)
            .attr('stroke-width', isSel ? 2.5 : 0.5)
            .attr('stroke', isSel ? raceFill(d.race) : '#FFFFFF')
            .attr('r', isSel ? d.radius + 4 : d.radius);
          hideTooltip();
        })
        .on('click', (e, d) => {
          onSelectAgent(d.id);
        });

      // Drag
      nodeSel.call(
        d3.drag<SVGCircleElement, SimNode>()
          .on('start', (e, d) => {
            if (!e.active) simRef.current?.alpha(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (e, d) => {
            d.fx = e.x;
            d.fy = e.y;
          })
          .on('end', (e, d) => {
            if (!e.active) simRef.current?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as any,
      );

      // Simulation
      const fp = forceParamsRef.current;
      const sim = d3.forceSimulation<SimNode>(simNodes)
        .force('link', d3.forceLink<SimNode, { source: number; target: number }>(linkData)
          .id(d => d.id)
          .distance(fp.linkDistance)
          .strength(fp.linkStrength))
        .force('charge', d3.forceManyBody().strength(fp.chargeStrength))
        .force('center', d3.forceCenter(cx, cy).strength(fp.centerStrength))
        .force('collision', d3.forceCollide<SimNode>().radius(d => d.radius + fp.collisionPadding))
        .alphaDecay(fp.alphaDecay)
        .alphaMin(0.001)
        .on('tick', () => {
          edgeSel
            .attr('x1', d => (d.source as unknown as SimNode).x!)
            .attr('y1', d => (d.source as unknown as SimNode).y!)
            .attr('x2', d => (d.target as unknown as SimNode).x!)
            .attr('y2', d => (d.target as unknown as SimNode).y!);
          nodeSel
            .attr('cx', d => d.x!)
            .attr('cy', d => d.y!);
        });

      for (let i = 0; i < 200; i++) sim.tick();
      sim.alphaTarget(0);
      simRef.current = sim;
    }
  }, [communityData, selectedCommunity, size, showTooltip, hideTooltip, onSelectAgent]);

  // ---- Update interior view when selectedAgentId changes ----
  useEffect(() => {
    if (viewTypeRef.current !== 'interior' || selectedCommunity === null) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGCircleElement, SimNode>('g.zoom-layer g.nodes circle')
      .attr('stroke', d => d.id === selectedAgentId ? raceFill(d.race) : '#FFFFFF')
      .attr('stroke-width', d => d.id === selectedAgentId ? 2.5 : 0.5)
      .attr('r', d => d.id === selectedAgentId ? d.radius + 4 : d.radius)
      .attr('fill', d => d.id === selectedAgentId ? '#FFFFFF' : raceFill(d.race, 0.7));
  }, [selectedAgentId, selectedCommunity]);

  // ---- Click on empty area to deselect ----
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target === svgRef.current || target.classList.contains('zoom-layer')) {
      onSelectAgent(-1);
    }
  }, [onSelectAgent]);

  // ---- Zoom controls ----
  const handleZoomIn = () => {
    const svg = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svg || !zoom) return;
    d3.select(svg).transition().duration(200).call(zoom.scaleBy, 1.3);
  };
  const handleZoomOut = () => {
    const svg = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svg || !zoom) return;
    d3.select(svg).transition().duration(200).call(zoom.scaleBy, 0.7);
  };
  const handleZoomReset = () => {
    const svg = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svg || !zoom) return;
    d3.select(svg).transition().duration(400).call(zoom.transform, d3.zoomIdentity);
  };

  // ---- Force controls handlers ----
  const handleResetForce = useCallback(() => {
    const defaults = selectedCommunity === null
      ? FORCE_DEFAULTS.community
      : FORCE_DEFAULTS.interior;
    setForceParams(defaults);
    // Reheat the sim with defaults
    const sim = simRef.current;
    if (sim) {
      const cx = sizeRef.current.w / 2;
      const cy = sizeRef.current.h / 2;
      sim.force('charge', d3.forceManyBody().strength(defaults.chargeStrength));
      sim.force('center', d3.forceCenter(cx, cy).strength(defaults.centerStrength));
      sim.alphaDecay(defaults.alphaDecay);
      // Update collision
      const nodes = nodeDataRef.current;
      if (nodes.length > 0) {
        const baseR = (d: any) => d.radius || 5;
        sim.force('collision', d3.forceCollide<any>().radius((d: any) => baseR(d) + defaults.collisionPadding));
      }
      // Update link forces
      const lf = sim.force('link') as d3.ForceLink<any, any> | undefined;
      if (lf) {
        lf.distance(defaults.linkDistance);
        lf.strength(defaults.linkStrength);
      }
      if (sim.alpha() < 0.01) sim.alpha(0.15).restart();
    }
  }, [selectedCommunity]);

  // ---- Render ----
  const empty = !network || network.nodes.length === 0;

  return (
    <Card
      title="社交网络图"
      subtitle={
        loading
          ? '计算中...'
          : empty
            ? '暂无数据'
            : selectedCommunity !== null
              ? `社区 #${selectedCommunity} 内部结构`
              : `${communityData?.communities.length ?? 0} 个社区 · ${network?.nodes.length ?? 0} 个智能体 · ${network?.edges.length ?? 0} 条边`
      }
    >
      {/* Top bar: back button + force controls toggle */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {selectedCommunity !== null && (
          <button
            onClick={() => setSelectedCommunity(null)}
            className="btn-ghost flex items-center gap-1 px-2.5 py-1 text-[0.7rem] font-sans text-accent border border-accent rounded-btn cursor-pointer"
          >
            <CaretLeft size={12} weight="bold" />
            返回社区总览
          </button>
        )}
        {!loading && !error && !empty && (
          <button
            onClick={() => setShowForceControls(v => !v)}
            className="btn-ghost flex items-center gap-1 px-2.5 py-1 text-[0.7rem] font-sans text-ink-secondary border border-border rounded-btn cursor-pointer"
            style={{
              backgroundColor: showForceControls ? 'var(--color-canvas)' : 'transparent',
              marginLeft: selectedCommunity === null ? 0 : 'auto',
            }}
          >
            <GearSix size={12} weight={showForceControls ? 'fill' : 'regular'} />
            力参数
          </button>
        )}
      </div>

      {/* Force parameter controls (collapsible) */}
      {showForceControls && !loading && !error && !empty && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-3 gap-y-2 p-2.5 mb-2 bg-canvas border border-border rounded-card">
          {(Object.keys(FORCE_LABELS) as (keyof ForceParams)[]).map(key => {
            const [min, max, step] = FORCE_RANGES[key];
            return (
              <div key={key} className="flex flex-col gap-0.5">
                <div className="flex justify-between items-baseline">
                  <label className="text-[0.6rem] font-sans text-ink-secondary">
                    {FORCE_LABELS[key]}
                  </label>
                  <span className="text-[0.55rem] font-mono text-ink-secondary">
                    {forceParams[key].toFixed(key === 'alphaDecay' ? 4 : key === 'linkStrength' || key === 'centerStrength' ? 2 : 0)}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={forceParams[key]}
                  onChange={e => updateForceParam(key, parseFloat(e.target.value))}
                  className="w-full h-1 cursor-pointer"
                  style={{ accentColor: 'var(--color-accent)' }}
                />
              </div>
            );
          })}
          <div className="flex items-end justify-end">
            <button
              onClick={handleResetForce}
              className="btn-ghost px-2 py-[3px] text-[0.6rem] font-sans text-accent border border-accent rounded-btn cursor-pointer whitespace-nowrap"
            >
              重置默认
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full bg-canvas rounded-card overflow-hidden transition-[height] duration-200"
        style={{
          height: showForceControls ? 380 : 520,
        }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <span className="font-mono text-text-secondary text-[0.8rem]">
              加载网络中...
            </span>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <span className="font-sans text-[0.8rem]" style={{ color: 'var(--color-error-text)' }}>
              {error}
            </span>
            <span className="font-sans text-text-secondary text-[0.65rem]">
              请检查后端状态后重试
            </span>
          </div>
        ) : empty ? (
          <div className="h-full flex items-center justify-center">
            <span className="font-sans text-text-secondary text-[0.8rem]">
              运行模拟以查看网络
            </span>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              width={size.w}
              height={size.h}
              viewBox={`0 0 ${size.w} ${size.h}`}
              onClick={handleSvgClick}
              className="block cursor-grab"
            >
              <g className="zoom-layer" />
            </svg>

            {/* Tooltip */}
            <div
              ref={tooltipRef}
              className="absolute px-3 py-2 bg-black/85 text-white rounded-md text-xs font-sans pointer-events-none opacity-0 transition-opacity max-w-[280px] leading-relaxed z-[100]"
            />

            {/* Legend */}
            <div className="absolute bottom-[42px] left-2.5 flex gap-4 text-[0.6rem] font-sans text-text-secondary items-center pointer-events-none">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: COLORS.majority.text }}
                />
                多数群体
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: COLORS.minority.text }}
                />
                少数群体
              </span>
              <span>
                {selectedCommunity === null
                  ? '大小=成员数 · 连线=跨社区关系'
                  : '大小=收入 · 连线=社交连接'}
              </span>
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-white/95 border border-border rounded-btn p-[3px_4px]">
              <button onClick={handleZoomOut} className="btn-icon w-[22px] h-[22px]">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              <button onClick={handleZoomIn} className="btn-icon w-[22px] h-[22px]">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              <button onClick={handleZoomReset} className="btn-ghost text-[0.6rem] font-sans text-accent w-auto px-1.5 py-0.5">
                重置
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

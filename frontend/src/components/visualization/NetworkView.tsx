import { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { NetworkData, NetworkNode } from '../../types/simulation';
import { COLORS } from '../../lib/constants';
import { Card } from '../shared/Card';
import { Legend } from '../shared/Legend';

// ============================================================
// Types
// ============================================================

interface NetworkViewProps {
  network: NetworkData | null;
  selectedAgentId: number | null;
  onSelectAgent: (id: number) => void;
  loading: boolean;
  error: string | null;
}

// ============================================================
// Layout computation
//
// Places nodes in concentric rings at different heights,
// grouped by nhood_proper so agents in the same neighborhood
// cluster together visually.
// ============================================================

function computeLayout(
  nodes: NetworkNode[],
): Map<number, [number, number, number]> {
  const positions = new Map<number, [number, number, number]>();

  // Group nodes by nhood_proper
  const groups = new Map<number, NetworkNode[]>();
  for (const node of nodes) {
    const g = node.nhood_proper;
    const bucket = groups.get(g);
    if (bucket) {
      bucket.push(node);
    } else {
      groups.set(g, [node]);
    }
  }

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a - b);
  const nGroups = sortedKeys.length;

  const BASE_RADIUS = 12;
  const HEIGHT_SPREAD = 22;
  const RADIUS_STEP = 2;

  sortedKeys.forEach((groupKey, gi) => {
    const groupNodes = groups.get(groupKey)!;
    const count = groupNodes.length;

    // Spread groups evenly along Y-axis
    const y =
      nGroups <= 1
        ? 0
        : (gi / (nGroups - 1) - 0.5) * HEIGHT_SPREAD;

    // Slightly larger ring per group so rings don't overlap
    const radius = BASE_RADIUS + gi * RADIUS_STEP;

    // Phase offset so rings aren't visually aligned
    const phaseShift = gi * (Math.PI / 6);

    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count + phaseShift;
      positions.set(groupNodes[i].id, [
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      ]);
    }
  });

  return positions;
}

// ============================================================
// Helpers
// ============================================================

/** Map an agent's earnings to a sphere radius in [0.25, 0.8]. */
function earningsToRadius(
  earnings: number,
  minEarnings: number,
  maxEarnings: number,
): number {
  const MIN_R = 0.25;
  const MAX_R = 0.8;
  if (maxEarnings <= minEarnings) return (MIN_R + MAX_R) / 2;
  return (
    MIN_R +
    ((earnings - minEarnings) / (maxEarnings - minEarnings)) *
      (MAX_R - MIN_R)
  );
}

/** Color by race. 1 = majority (blue), otherwise minority (amber). */
function getNodeColor(race: number, selected: boolean): string {
  if (selected) return '#FFFFFF';
  return race === 1 ? COLORS.majority.text : COLORS.minority.text;
}

// ============================================================
// EdgeLines — all edges in a single lineSegments draw call
// ============================================================

function EdgeLines({
  edges,
  positions,
}: {
  edges: [number, number][];
  positions: Map<number, [number, number, number]>;
}) {
  const geometry = useMemo(() => {
    const verts: number[] = [];
    for (const [a, b] of edges) {
      const pa = positions.get(a);
      const pb = positions.get(b);
      if (pa && pb) {
        verts.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2]);
      }
    }
    if (verts.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(verts, 3),
    );
    return geo;
  }, [edges, positions]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color="#EAEAEA"
        transparent
        opacity={0.08}
      />
    </lineSegments>
  );
}

// ============================================================
// NetworkGraph — the 3D scene rendered inside the Canvas
// ============================================================

function NetworkGraph({
  network,
  selectedAgentId,
  onSelectAgent,
}: {
  network: NetworkData;
  selectedAgentId: number | null;
  onSelectAgent: (id: number) => void;
}) {
  const controlsRef = useRef<any>(null);

  // ---- Layout ----
  const positions = useMemo(
    () => computeLayout(network.nodes),
    [network.nodes],
  );

  // ---- Earnings range (for sizing) ----
  const earningsExtent = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const n of network.nodes) {
      if (n.earnings < min) min = n.earnings;
      if (n.earnings > max) max = n.earnings;
    }
    return {
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 1 : max,
    };
  }, [network.nodes]);

  // ---- Smooth camera animation on double-click ----
  const focusTarget = useRef(new THREE.Vector3(0, 0, 0));
  const focusDistance = useRef(50);
  const isAnimating = useRef(false);

  const zoomToNeighborhood = useCallback(
    (nodeId: number) => {
      const centerPos = positions.get(nodeId);
      if (!centerPos) return;

      // Collect neighbor ids from edge list
      const neighborIds = new Set<number>();
      for (const [src, tgt] of network.edges) {
        if (src === nodeId) neighborIds.add(tgt);
        if (tgt === nodeId) neighborIds.add(src);
      }

      // Compute centroid of the node + its neighbors
      const centroid = new THREE.Vector3(
        centerPos[0],
        centerPos[1],
        centerPos[2],
      );
      let count = 1;
      for (const nid of neighborIds) {
        const np = positions.get(nid);
        if (np) {
          centroid.add(new THREE.Vector3(np[0], np[1], np[2]));
          count++;
        }
      }
      centroid.divideScalar(count);

      focusTarget.current.copy(centroid);
      // Pull the camera closer — distance scales with neighborhood size
      focusDistance.current = 8 + neighborIds.size * 1.5;
      isAnimating.current = true;
    },
    [positions, network.edges],
  );

  // Animate camera on each frame when a focus target is active
  useFrame((_, delta) => {
    if (!isAnimating.current || !controlsRef.current) return;

    const ctrl = controlsRef.current;
    const t = Math.min(delta * 5, 1);

    // Lerp the orbit target
    ctrl.target.lerp(focusTarget.current, t);

    // Lerp the camera distance
    const camDir = new THREE.Vector3()
      .subVectors(ctrl.object.position, ctrl.target)
      .normalize();
    const curDist = ctrl.object.position.distanceTo(ctrl.target);
    const newDist = THREE.MathUtils.lerp(
      curDist,
      focusDistance.current,
      t,
    );
    ctrl.object.position.copy(
      ctrl.target.clone().addScaledVector(camDir, newDist),
    );

    ctrl.update();

    // Stop animating once we are close enough
    if (
      ctrl.target.distanceTo(focusTarget.current) < 0.01 &&
      Math.abs(newDist - focusDistance.current) < 0.01
    ) {
      isAnimating.current = false;
    }
  });

  // ---- Render the scene ----
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.55} />
      <pointLight position={[30, 30, 30]} intensity={0.7} />
      <pointLight position={[-25, -20, -30]} intensity={0.3} />

      {/* Controls — slow auto-rotate when idle */}
      <OrbitControls
        ref={controlsRef}
        autoRotate
        autoRotateSpeed={0.25}
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={100}
      />

      {/* Edge lines */}
      <EdgeLines edges={network.edges} positions={positions} />

      {/* Node spheres */}
      {network.nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;

        const radius = earningsToRadius(
          node.earnings,
          earningsExtent.min,
          earningsExtent.max,
        );
        const selected = node.id === selectedAgentId;
        const color = getNodeColor(node.race, selected);

        return (
          <mesh
            key={node.id}
            position={pos}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelectAgent(node.id);
            }}
            onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              zoomToNeighborhood(node.id);
            }}
          >
            <sphereGeometry args={[radius, 32, 16]} />
            <meshStandardMaterial
              color={color}
              roughness={0.35}
              metalness={0.05}
              emissive={selected ? color : '#000000'}
              emissiveIntensity={selected ? 0.5 : 0}
            />
          </mesh>
        );
      })}
    </>
  );
}

// ============================================================
// NetworkView — exported top-level component
// ============================================================

export function NetworkView({
  network,
  selectedAgentId,
  onSelectAgent,
  loading,
  error,
}: NetworkViewProps) {
  const nodeCount = network?.nodes.length ?? 0;
  const edgeCount = network?.edges.length ?? 0;
  const empty = !network || network.nodes.length === 0;

  const legendItems = [
    { color: COLORS.majority.text, label: 'Majority' },
    { color: COLORS.minority.text, label: 'Minority' },
    { color: '#C0C0C0', label: 'Connection', shape: 'line' as const },
  ];

  return (
    <Card
      title="Social Network Graph"
      subtitle={
        loading
          ? 'Computing...'
          : empty
            ? 'No data'
            : `${nodeCount} nodes  ·  ${edgeCount} edges`
      }
    >
      <div style={{ position: 'relative', width: '100%', height: 520 }}>
        {/* Legend — absolutely positioned over the Canvas */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 14,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {/* Inner div re-enables pointer events so legend text is selectable */}
          <div style={{ pointerEvents: 'auto' }}>
            <Legend items={legendItems} />
          </div>
        </div>

        {loading ? (
          <div style={placeholderStyle}>
            <span
              style={{
                fontFamily: "'Geist Mono', 'SF Mono', 'JetBrains Mono', monospace",
                color: COLORS.textSecondary,
                fontSize: '0.8rem',
              }}
            >
              Loading network...
            </span>
          </div>
        ) : error ? (
          <div style={{ ...placeholderStyle, flexDirection: 'column', gap: 8 }}>
            <span
              style={{
                fontFamily: "'Geist Sans', sans-serif",
                color: 'var(--color-error-text)',
                fontSize: '0.8rem',
              }}
            >
              {error}
            </span>
            <span
              style={{
                fontFamily: "'Geist Sans', sans-serif",
                color: COLORS.textSecondary,
                fontSize: '0.65rem',
              }}
            >
              请检查后端状态后重试
            </span>
          </div>
        ) : empty ? (
          <div style={placeholderStyle}>
            <span
              style={{
                fontFamily: "'Geist Sans', sans-serif",
                color: COLORS.textSecondary,
                fontSize: '0.8rem',
              }}
            >
              Run a simulation to see the network
            </span>
          </div>
        ) : (
          <Canvas
            camera={{
              position: [0, 0, 50],
              fov: 45,
              near: 0.1,
              far: 500,
            }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent' }}
          >
            <NetworkGraph
              network={network}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
            />
          </Canvas>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// Styles
// ============================================================

const placeholderStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

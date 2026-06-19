// Design tokens — JS-accessible values for canvas/WebGL rendering.
// Mirrors the CSS custom properties in globals.css.
// For DOM elements, prefer CSS variables over importing these values.
export const COLORS = {
  canvas: '#F8F8F7',
  surface: '#FFFFFF',
  border: '#E6E6E4',
  textPrimary: '#1A1A18',
  textSecondary: '#545450',
  accent: '#1A5C8A',
  // Majority / Minority pastels (preserved)
  majority: {
    bg: '#E1F3FE',
    text: '#1F6C9F',
    stroke: '#8FC9E8',
  },
  minority: {
    bg: '#FBF3DB',
    text: '#956400',
    stroke: '#E8D5A3',
  },
  ability: {
    bg: '#EDF3EC',
    text: '#346538',
  },
  bias: {
    bg: '#FDEBEC',
    text: '#9F2F2D',
  },
  neutral: '#D4D4D2',
  gridLine: '#EEEEEC',
  // Semantic
  error: '#9F2F2D',
  success: '#2D6A3C',
  warning: '#8A6D1A',
} as const;

export const LAYOUT = {
  controlPanelWidth: 280,
  navHeight: 56,
} as const;

export const WS_URL = (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:8000/ws`;
})();

export const NETWORK_STAGE_LABELS: Record<string, string> = {
  random: '随机网络',
  nhood: '社区网络',
  school: '学校网络',
  earnings: '收入网络',
};

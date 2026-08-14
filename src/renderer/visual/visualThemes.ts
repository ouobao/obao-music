export type VisualThemeId = 'white' | 'black';

export interface VisualTheme {
  id: VisualThemeId;
  label: string;
  accent: string;
  accentSoft: string;
  text: string;
  mutedText: string;
  inverseText: string;
  chromeText: string;
  panelBorder: string;
  surface: string;
  deepSurface: string;
  canvasBase: string;
  canvasGlow: string;
  particleA: string;
  particleB: string;
  materialA: string;
  materialB: string;
}

export const visualThemes: Record<VisualThemeId, VisualTheme> = {
  white: {
    id: 'white',
    label: '白色',
    accent: '#cf3434',
    accentSoft: '#f5dede',
    text: '#202124',
    mutedText: '#74666c',
    inverseText: '#fff7f5',
    chromeText: '#2c2024',
    panelBorder: '#f1cfca',
    surface: '#ffffff',
    deepSurface: '#f7f4f4',
    canvasBase: '#f7f1f1',
    canvasGlow: '#e05656',
    particleA: '#ff6b6b',
    particleB: '#efc06a',
    materialA: '#d84848',
    materialB: '#2f6f90'
  },
  black: {
    id: 'black',
    label: '黑色',
    accent: '#247981',
    accentSoft: '#153a3e',
    text: '#effffc',
    mutedText: '#9bc4c3',
    inverseText: '#ffffff',
    chromeText: '#effffc',
    panelBorder: '#23464a',
    surface: '#0b2024',
    deepSurface: '#07171a',
    canvasBase: '#041114',
    canvasGlow: '#74bfe5',
    particleA: '#68d2ad',
    particleB: '#f0b38f',
    materialA: '#52bda1',
    materialB: '#dc987d'
  }
};

export function getVisualTheme(themeId: VisualThemeId): VisualTheme {
  return visualThemes[themeId] ?? visualThemes.white;
}

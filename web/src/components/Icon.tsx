// One small authored icon set: 24px grid, 1.75 stroke, round joins. No emoji in the interface.
const PATHS: Record<string, string[]> = {
  bell: ['M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z', 'M10 19a2 2 0 0 0 4 0'],
  pin: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  locate: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  rain: ['M7 15a4 4 0 0 1 .6-7.96A5.5 5.5 0 0 1 18.2 9 3.5 3.5 0 0 1 17.5 15', 'M9 18l-1 2.5', 'M13 18l-1 2.5', 'M17 18l-1 2.5'],
  wave: ['M3 9c2.2 0 2.2 2 4.5 2s2.3-2 4.5-2 2.2 2 4.5 2 2.3-2 4.5-2', 'M3 15c2.2 0 2.2 2 4.5 2s2.3-2 4.5-2 2.2 2 4.5 2 2.3-2 4.5-2'],
  satellite: ['M9.5 9.5l5 5', 'M7 12l5-5 2.5 2.5-5 5Z', 'M4.5 9.5l3-3', 'M14.5 19.5l3-3', 'M5 6l-2 2 3 3', 'M18 13l3 3-2 2', 'M15 5a4 4 0 0 1 4 4'],
  sensor: ['M5 8h14v8H5Z', 'M9 8V5', 'M15 8V5', 'M9 19v-3', 'M15 19v-3', 'M9.5 12h5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  drag: ['M9 7l-5 5 5 5', 'M15 7l5 5-5 5'],
}

export default function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(PATHS[name] ?? []).map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

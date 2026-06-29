/** MAVLink severity → Tailwind color class */
export function severityColor(severity: number): string {
  switch (severity) {
    case 0: case 1: case 2: case 3:
      return 'text-red-400';
    case 4:
      return 'text-yellow-400';
    case 5:
      return 'text-blue-400';
    case 6:
      return 'text-content';
    case 7:
      return 'text-content-secondary';
    default:
      return 'text-content-secondary';
  }
}

/** MAVLink severity → left border color */
export function severityBorder(severity: number): string {
  switch (severity) {
    case 0: case 1: case 2: case 3:
      return 'border-l-red-500';
    case 4:
      return 'border-l-yellow-500';
    case 5:
      return 'border-l-blue-500';
    case 6:
      return 'border-l-gray-500';
    case 7:
      return 'border-l-gray-600';
    default:
      return 'border-l-gray-600';
  }
}

/** MAVLink severity → badge bg color */
export function severityBadgeBg(severity: number): string {
  switch (severity) {
    case 0: case 1: case 2: case 3:
      return 'bg-red-500/20 text-red-400';
    case 4:
      return 'bg-yellow-500/20 text-yellow-400';
    case 5:
      return 'bg-blue-500/20 text-blue-400';
    case 6:
      return 'bg-gray-500/20 text-gray-400';
    case 7:
      return 'bg-gray-600/20 text-gray-500';
    default:
      return 'bg-gray-600/20 text-gray-500';
  }
}

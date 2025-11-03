export function getPhaseColor(phase: string): 'info' | 'success' | 'muted' {
  switch (phase) {
    case 'LEARNING': return 'info';
    case 'FEEDBACK_LOOP': return 'success';
    case 'EXITED': return 'muted';
    default: return 'muted';
  }
}

export function getModeColor(mode: string | null): 'purple' | 'warning' | 'info' | 'muted' {
  if (!mode) return 'muted';

  switch (mode) {
    case 'SIMULATOR_BASED_POINTER': return 'purple';
    case 'BID_REDUCTION_POINTER': return 'warning';
    case 'DEPLETION_POINTER': return 'info';
    case 'BID_POINTER': return 'muted';
    default: return 'muted';
  }
}

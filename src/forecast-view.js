// Event times are retrospective; reveal them only when replay reaches the event.
export function revealedDiagnosticMarkers(selected, time, windowEnd) {
  return [
    { time: selected.onset, color: '#ff967d', dash: [] },
    { time: selected.confirmation, color: '#8c999f', dash: [2, 3] },
  ].filter(marker => Number.isFinite(marker.time) && marker.time >= 0 && marker.time <= time + 1e-9 && marker.time <= windowEnd + 1e-9);
}

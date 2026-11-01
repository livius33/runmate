// Where an activity can be opened at its source (shown on the run page). Pure: also used in the browser.
export function externalActivityLink(source: string, sourceActivityId: string | null): { url: string; label: string } | null {
  if ((source === 'garmin' || source === 'garmin-api') && sourceActivityId && /^\d+$/.test(sourceActivityId)) {
    return { url: `https://connect.garmin.com/modern/activity/${sourceActivityId}`, label: 'In Garmin öffnen' }
  }
  return null
}

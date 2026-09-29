import SiteStep from './SiteStep.jsx';
import BriefStep from './BriefStep.jsx';
import GeometryStep from './GeometryStep.jsx';
import PlaceholderStep from './PlaceholderStep.jsx';

/**
 * Step registry. `section` maps to validateDesignInput().errors keys.
 * Later phases replace `PlaceholderStep` entries with the real components.
 */
export const STEPS = [
  { id: 'site', label: 'Site', section: 'site', Component: SiteStep },
  { id: 'brief', label: 'Shelter brief', section: 'shelter', Component: BriefStep },
  { id: 'geometry', label: 'Geometry', section: 'geometry', Component: GeometryStep },
  { id: 'envelope', label: 'Envelope', section: 'envelope', Component: PlaceholderStep },
  { id: 'openings', label: 'Openings', section: 'openings', Component: PlaceholderStep },
  { id: 'operations', label: 'Operations', section: 'operations', Component: PlaceholderStep },
];

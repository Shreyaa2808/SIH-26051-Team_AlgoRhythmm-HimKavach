import SiteStep from './SiteStep.jsx';
import BriefStep from './BriefStep.jsx';
import GeometryStep from './GeometryStep.jsx';
import EnvelopeStep from './EnvelopeStep.jsx';
import OpeningsStep from './OpeningsStep.jsx';
import OperationsStep from './OperationsStep.jsx';

/**
 * Step registry. `section` maps to validateDesignInput().errors keys.
 */
export const STEPS = [
  { id: 'site', label: 'Site', section: 'site', Component: SiteStep },
  { id: 'brief', label: 'Shelter brief', section: 'shelter', Component: BriefStep },
  { id: 'geometry', label: 'Geometry', section: 'geometry', Component: GeometryStep },
  { id: 'envelope', label: 'Envelope', section: 'envelope', Component: EnvelopeStep },
  { id: 'openings', label: 'Openings', section: 'openings', Component: OpeningsStep },
  { id: 'operations', label: 'Operations', section: 'operations', Component: OperationsStep },
];

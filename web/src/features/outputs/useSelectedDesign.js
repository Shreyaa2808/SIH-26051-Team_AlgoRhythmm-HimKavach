// One hook that every Person-6 page uses, so Blueprint, Report/CSV, Field
// Monitoring and Validation all resolve THE SAME design (same project id, same
// saved simulation, same materials) — never a baseline or another candidate.
import { useEffect, useMemo, useState } from 'react';
import {
  buildSiteInfo, buildTrace, listMaterials, listProjects, loadApiInfo, loadClimateStatus,
  loadProjectRaw, materialIndex, normalizeProject,
} from './outputsService';
import { assessGeometry, buildDrawingModel, buildMaterialSchedule } from './blueprint/geometry';
import { useTelemetry } from '../telemetry/telemetryStore';
import { buildValidationStatus } from '../validation/validationService';

export default function useSelectedDesign({ projectId, selection = null, location = null }) {
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [climateSites, setClimateSites] = useState([]);
  const [apiInfo, setApiInfo] = useState(null);
  const [loaded, setLoaded] = useState({ id: null, project: null, error: null });

  // Reference lists (once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, m, c, a] = await Promise.allSettled([
        listProjects(), listMaterials(), loadClimateStatus(), loadApiInfo(),
      ]);
      if (cancelled) return;
      if (p.status === 'fulfilled') setProjects(p.value);
      else setProjectsError(`Could not load saved designs: ${p.reason?.message ?? 'backend not reachable'}`);
      if (m.status === 'fulfilled') setMaterials(m.value);
      if (c.status === 'fulfilled') setClimateSites(c.value);
      if (a.status === 'fulfilled') setApiInfo(a.value);
    })();
    return () => { cancelled = true; };
  }, []);

  // The selected design (re-fetched whenever the id changes).
  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const raw = await loadProjectRaw(projectId);
        if (cancelled) return;
        const project = normalizeProject(raw);
        setLoaded({
          id: projectId,
          project,
          error: project ? null : 'The saved design has no usable model data.',
        });
      } catch (err) {
        if (!cancelled) setLoaded({ id: projectId, project: null, error: err.message });
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const loading = Boolean(projectId) && loaded.id !== projectId;
  const project = !loading && loaded.id === projectId ? loaded.project : null;
  const error = !loading && loaded.id === projectId ? loaded.error : null;

  // Only trust App-level selection metadata if it belongs to THIS design.
  const activeSelection = selection && selection.projectId === project?.id ? selection : null;

  const telemetry = useTelemetry(project?.id ?? null);
  const materialsById = useMemo(() => materialIndex(materials), [materials]);
  const site = useMemo(() => buildSiteInfo(project, location, climateSites), [project, location, climateSites]);
  const validation = useMemo(
    () => buildValidationStatus({ project, selection: activeSelection, telemetry }),
    [project, activeSelection, telemetry],
  );
  const trace = useMemo(
    () => (project ? buildTrace(project, activeSelection, site, apiInfo, validation) : null),
    [project, activeSelection, site, apiInfo, validation],
  );
  const geometryCheck = useMemo(() => assessGeometry(project), [project]);
  const drawing = useMemo(
    () => (project ? buildDrawingModel(project, materialsById) : null),
    [project, materialsById],
  );
  const schedule = useMemo(
    () => (project && drawing?.ok ? buildMaterialSchedule(project, drawing, materialsById) : []),
    [project, drawing, materialsById],
  );

  return {
    projects, projectsError, project, loading, error, selection: activeSelection,
    materials, materialsById, site, apiInfo, trace, validation, telemetry,
    geometryCheck, drawing, schedule,
  };
}

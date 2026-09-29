import useMaterials from '../fields/useMaterials.js';
import EnvelopeEditor from './EnvelopeEditor.jsx';

export default function EnvelopeStep(props) {
  const { materials, byId, loading, error } = useMaterials();
  return (
    <>
      {loading && <p className="dw-muted">Loading materials…</p>}
      {error && <p className="dw-error">Could not load materials: {error}. Defaults will still work.</p>}
      <EnvelopeEditor {...props} materials={materials} byId={byId} />
    </>
  );
}

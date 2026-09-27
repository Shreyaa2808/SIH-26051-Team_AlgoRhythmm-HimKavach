const TABS = [
  { id: 'siting', label: '1. Micro-Siting', icon: '📍' },
  { id: 'climate', label: '2. Climate Engine', icon: '📈' },
  { id: 'materials', label: '3. Materials DB', icon: '🧱' },
  { id: 'twin', label: '4. 3D Digital Twin', icon: '🧊' },
  { id: 'optimize', label: '5. Multi-Objective', icon: '🔥' },
  { id: 'benchmark', label: '6. ANSYS Benchmark', icon: '✅' },
  { id: 'telemetry', label: '7. Real-Time Telemetry', icon: '📡' },
];

export default function TabNav({ active, onChange, unlockedTabs }) {
  return (
    <div className="tab-nav">
      {TABS.map((t) => {
        const unlocked = unlockedTabs.includes(t.id);
        return (
          <button
            key={t.id}
            className={`tab-btn ${active === t.id ? 'active' : ''} ${!unlocked ? 'locked' : ''}`}
            onClick={() => unlocked && onChange(t.id)}
            disabled={!unlocked}
          >
            {t.icon} {t.label}
          </button>
        );
      })}
    </div>
  );
}
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/**
 * Predicted (model) vs Measured indoor temperature over hour of day.
 * `dataLabel` is what the measured line is called in the legend — it is
 * "Measured (imported log)" or "Demo data (synthetic)", never "live".
 */
export default function PredictedVsMeasured({ aligned, dataLabel, isDemo, showOutdoor }) {
  const data = (aligned ?? []).map((p) => ({
    hour: p.hour,
    label: p.label,
    predicted: p.predicted,
    measured: p.measured,
    outdoor: p.measuredOutdoor,
    samples: p.samples,
  }));
  return (
    <div className="op-card op-chart-card">
      <h3 className="op-card-title">
        Predicted vs measured indoor temperature
        {isDemo ? <span className="op-badge op-badge-demo">DEMO DATA</span> : null}
      </h3>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 10, right: 24, left: 4, bottom: 22 }}>
          <CartesianGrid stroke="rgba(120,135,165,0.28)" strokeDasharray="3 3" />
          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, 23]}
            ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
            tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
            tick={{ fontSize: 12 }}
            label={{ value: 'Time of day (hour)', position: 'insideBottom', offset: -12, fontSize: 12 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            unit=" °C"
            width={64}
            label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fontSize: 12 }}
          />
          <Tooltip
            labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
            formatter={(v, name, item) => [
              typeof v === 'number' ? `${v.toFixed(2)} °C` : 'no sample',
              name === dataLabel && item?.payload?.samples ? `${name} (n=${item.payload.samples})` : name,
            ]}
            contentStyle={{ fontSize: 13, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
          <Line type="monotone" dataKey="predicted" name="Predicted (model)" stroke="#3f7ef7" strokeWidth={2.5} dot={false} />
          <Line
            type="monotone" dataKey="measured" name={dataLabel} stroke={isDemo ? '#b26a00' : '#17a672'}
            strokeWidth={2.5} strokeDasharray={isDemo ? '6 4' : undefined} dot={{ r: 2.5 }} connectNulls={false}
          />
          {showOutdoor ? (
            <Line type="monotone" dataKey="outdoor" name="Outdoor (logged)" stroke="#93a0b4" strokeWidth={1.6} strokeDasharray="4 4" dot={false} />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function TemperatureChart({ hours, indoorTemps, outdoorTemps }) {
  const data = hours.map((h, i) => ({
    hour: h,
    indoor: Math.round(indoorTemps[i] * 10) / 10,
    outdoor: Math.round(outdoorTemps[i] * 10) / 10,
  }));

  return (
    <div className="chart-card">
      <h3>24-Hour Temperature Curve</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="rgba(150,170,210,0.25)" strokeDasharray="3 3" />
          <XAxis
            dataKey="hour"
            stroke="#5c6a85"
            tick={{ fontSize: 12 }}
            label={{ value: 'Hour of day', position: 'insideBottom', offset: -5, fontSize: 12, fill: '#5c6a85' }}
          />
          <YAxis
            stroke="#5c6a85"
            tick={{ fontSize: 12 }}
            label={{ value: '°C', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#5c6a85' }}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(150,170,210,0.4)',
              borderRadius: 10,
              fontSize: 13,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line
            type="monotone"
            dataKey="outdoor"
            name="Outdoor"
            stroke="#e0453f"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="indoor"
            name="Indoor"
            stroke="#3f7ef7"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
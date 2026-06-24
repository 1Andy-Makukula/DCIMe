
export function TopologyBG() {
  const nodes = [
    { x: 8, y: 25 }, { x: 18, y: 12 }, { x: 30, y: 30 }, { x: 42, y: 18 },
    { x: 55, y: 35 }, { x: 65, y: 15 }, { x: 75, y: 28 }, { x: 85, y: 12 },
    { x: 90, y: 42 }, { x: 22, y: 55 }, { x: 38, y: 65 }, { x: 50, y: 55 },
    { x: 63, y: 70 }, { x: 78, y: 58 }, { x: 92, y: 65 },
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14],
    [1, 3], [3, 5], [5, 7], [2, 10], [4, 11], [6, 13], [8, 14],
    [1, 9], [3, 10], [5, 12],
  ];
  return (
    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 80">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={`${nodes[a].x}%`} y1={`${nodes[a].y}%`}
          x2={`${nodes[b].x}%`} y2={`${nodes[b].y}%`}
          stroke="#19C853" strokeWidth="0.35" strokeOpacity="0.4"
        />
      ))}
      {nodes.map((n, i) => (
        <circle
          key={i}
          cx={`${n.x}%`} cy={`${n.y}%`}
          r={i % 4 === 0 ? "1.2" : "0.8"}
          fill="#19C853"
          opacity={i % 3 === 0 ? "0.9" : "0.5"}
        />
      ))}
    </svg>
  );
}

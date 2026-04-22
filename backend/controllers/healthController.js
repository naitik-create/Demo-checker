export function health(_req, res) {
  res.json({ ok: true, service: "backend", time: new Date().toISOString() });
}


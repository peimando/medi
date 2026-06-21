async function getDisplayState(pgPool, cfg) {
  const services = cfg.get('services') || [];
  if (!services.length) return {};

  const { rows } = await pgPool.query(
    `SELECT p.service_id, p.ticket_code, b.name AS box_name
     FROM patients p LEFT JOIN boxes b ON b.id=p.box_id
     WHERE p.status='serving' AND p.service_id=ANY($1)`,
    [services.map(s => s.id)]
  );

  return Object.fromEntries(
    services.map(s => {
      const serving = rows.find(r => r.service_id === s.id);
      return [s.id, {
        serviceName: s.name, color: s.color, icon: s.icon,
        ticketCode: serving?.ticket_code || '---',
        boxName:    serving?.box_name    || '---',
      }];
    })
  );
}

async function getAnalyticsState(pgPool) {
  const { rows } = await pgPool.query(
    `SELECT s.id, s.name, s.color,
            COUNT(p.id) FILTER (WHERE p.status='waiting') AS waiting,
            COUNT(p.id) FILTER (WHERE p.status='serving') AS serving
     FROM services s
     LEFT JOIN patients p ON p.service_id=s.id AND DATE(p.arrival_time)=CURRENT_DATE
     WHERE s.active=true GROUP BY s.id, s.name, s.color`
  );
  return rows;
}

module.exports = { getDisplayState, getAnalyticsState };

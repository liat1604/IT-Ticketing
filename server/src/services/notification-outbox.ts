import type { PoolClient } from "pg";

export async function enqueueTicketStarted(client: PoolClient, input: { ticketId:string; reporterEmail:string; ticketNumber:string; ticketTitle:string; technicianName:string; startedAt:Date|string }) {
  await client.query(
    `INSERT INTO notification_outbox (ticket_id, recipient_email, event_type, payload)
     SELECT $1, $2, 'TICKET_STARTED', $3::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM notification_outbox
       WHERE ticket_id = $1 AND event_type = 'TICKET_STARTED'
     )
     ON CONFLICT DO NOTHING`,
    [input.ticketId,input.reporterEmail,JSON.stringify({ticketNumber:input.ticketNumber,title:input.ticketTitle,technicianName:input.technicianName,startedAt:input.startedAt,status:"IN_PROGRESS"})],
  );
}

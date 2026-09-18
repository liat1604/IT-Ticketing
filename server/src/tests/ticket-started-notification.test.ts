import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../db.js";
import { enqueueTicketStarted } from "../services/notification-outbox.js";

test("starting a ticket creates exactly one TICKET_STARTED notification for its reporter", async () => {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const suffix = randomUUID();
    const reporter = await client.query<{id:string}>(`INSERT INTO users(email,full_name,password_hash,role) VALUES($1,'Notification Test Reporter','test','REPORTER') RETURNING id`,[`reporter-${suffix}@mynwu.ac.za`]);
    const technician = await client.query<{id:string}>(`INSERT INTO users(email,full_name,password_hash,role) VALUES($1,'Notification Test Technician','test','TECHNICIAN') RETURNING id`,[`technician-${suffix}@mynwu.ac.za`]);
    const category = await client.query<{id:number}>(`SELECT id FROM categories ORDER BY id LIMIT 1`);
    const ticket = await client.query<{id:string;ticket_number:string}>(`INSERT INTO tickets(reporter_id,created_by,assigned_to,category_id,title,description,priority,status,source) VALUES($1,$1,$2,$3,'Test notification ticket','Ticket start notification integration test','MEDIUM','ASSIGNED','WEB') RETURNING id,ticket_number`,[reporter.rows[0].id,technician.rows[0].id,category.rows[0].id]);
    const input={ticketId:ticket.rows[0].id,reporterEmail:`reporter-${suffix}@mynwu.ac.za`,ticketNumber:ticket.rows[0].ticket_number,ticketTitle:"Test notification ticket",technicianName:"Notification Test Technician",startedAt:new Date()};
    await enqueueTicketStarted(client,input);
    await enqueueTicketStarted(client,input);
    const result=await client.query<{count:number;recipient_email:string}>(`SELECT COUNT(*)::INTEGER AS count,MIN(recipient_email) AS recipient_email FROM notification_outbox WHERE ticket_id=$1 AND event_type='TICKET_STARTED'`,[ticket.rows[0].id]);
    assert.equal(result.rows[0].count,1);
    assert.equal(result.rows[0].recipient_email,input.reporterEmail);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test.after(async()=>{await pool.end();});

// netlify/functions/admin-sus.js
// Handles retrieval and management of SUS survey responses. Protected by admin password check.

const { Client } = require('pg');

exports.handler = async (event) => {
  const authHeader = event.headers['authorization'];
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Admin password environment variable is not configured.' })
    };
  }

  if (authHeader !== adminPassword) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized: Invalid admin passcode.' })
    };
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    if (event.httpMethod === 'GET') {
      const result = await client.query('SELECT * FROM sus_responses ORDER BY submitted_at DESC');
      // Format rows to match the frontend expected format
      const formatted = result.rows.map(row => ({
        id: row.id,
        session: row.session,
        date: row.session_date ? new Date(row.session_date).toISOString().slice(0, 10) : '',
        name: row.name,
        role: row.role,
        sus: [
          row.sus_q1, row.sus_q2, row.sus_q3, row.sus_q4, row.sus_q5,
          row.sus_q6, row.sus_q7, row.sus_q8, row.sus_q9, row.sus_q10
        ],
        score: parseFloat(row.score),
        sat: row.sat,
        fb: [row.fb_q1, row.fb_q2, row.fb_q3, row.fb_q4]
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formatted)
      };
    } 

    if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body);
      } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      }
      
      const { active_session } = body;
      if (!active_session) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing active_session parameter' }) };
      }

      await client.query(`
        INSERT INTO sus_settings (key, value)
        VALUES ('active_session', $1)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      `, [active_session.trim()]);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, active_session })
      };
    }
    
    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (id) {
        // Delete a specific response
        await client.query('DELETE FROM sus_responses WHERE id = $1', [id]);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, message: `Response ${id} deleted.` })
        };
      } else {
        // Clear all responses
        await client.query('TRUNCATE TABLE sus_responses');
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, message: 'All responses cleared.' })
        };
      }
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Admin DB error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Database error', detail: err.message })
    };
  } finally {
    await client.end();
  }
};

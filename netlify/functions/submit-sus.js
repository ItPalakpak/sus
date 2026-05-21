// netlify/functions/submit-sus.js
// Receives SUS survey data from the frontend and saves it to Neon PostgreSQL.

const { Client } = require('pg');
const crypto = require('crypto');

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CSRF: Require X-Requested-With header
  if (!event.headers['x-requested-with']) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Missing required header' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { session, date, name, role, sus, score, sat, fb } = body;

  // Basic validation
  if (!session || !date || !role || !sus || sus.length !== 10 || score === undefined || score === null) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  // XSS sanitization: strip all HTML tags from text inputs
  const SANITIZE_RE = /<[^>]*>/g;
  const sanitize = (str) => (str && typeof str === 'string') ? str.replace(SANITIZE_RE, '').trim() : str;

  // Strip accidental PII from open-ended text fields
  const PII_PATTERN = /(\b\d{4}\s?\d{4}\s?\d{4}\b|\b\d{2}-\d{2}-\d{4}\b|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\b09\d{9}\b|\b\+63\d{10}\b)/g;
  const stripPII = (str) => (str && typeof str === 'string') ? str.replace(PII_PATTERN, '[REDACTED]') : str;

  // Rate limiting: hash the IP, allow max 5 per IP in 24h
  const MAX_PER_RESPONDENT = 5;
  const RATE_WINDOW_HOURS = 24;
  const rawIp = event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]
    || event.headers['client-ip']
    || 'unknown';
  const ipHash = crypto.createHash('sha256').update(rawIp + process.env.DATABASE_URL).digest('hex');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon
  });

  const MAX_RESPONSES = 400;

  try {
    await client.connect();

    // Check current response count before accepting
    const countResult = await client.query('SELECT COUNT(*) AS cnt FROM sus_responses');
    if (parseInt(countResult.rows[0].cnt) >= MAX_RESPONSES) {
      await client.end();
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Survey is closed', detail: 'We have reached the maximum number of responses. Thank you for your interest!' })
      };
    }

    // Rate limit: check submission count for this IP hash
    const rateResult = await client.query(
      'SELECT COUNT(*) AS cnt FROM sus_submission_rate_limits WHERE ip_hash = $1 AND created_at > NOW() - $2::interval',
      [ipHash, `${RATE_WINDOW_HOURS} hours`]
    );
    if (parseInt(rateResult.rows[0].cnt) >= MAX_PER_RESPONDENT) {
      await client.end();
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Rate limit exceeded', detail: 'You have reached the maximum number of submissions. Thank you for your participation!' })
      };
    }

    const query = `
      INSERT INTO sus_responses (
        session,
        session_date,
        name,
        role,
        sus_q1, sus_q2, sus_q3, sus_q4, sus_q5,
        sus_q6, sus_q7, sus_q8, sus_q9, sus_q10,
        score,
        sat,
        fb_q1, fb_q2, fb_q3, fb_q4,
        submitted_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15,
        $16,
        $17, $18, $19, $20,
        NOW()
      )
      RETURNING id;
    `;

    const values = [
      sanitize(session),                             // $1
      sanitize(date),                                // $2
      sanitize(name) || 'Anonymous',                 // $3
      sanitize(role),                                // $4
      sus[0], sus[1], sus[2], sus[3], sus[4],        // $5, $6, $7, $8, $9
      sus[5], sus[6], sus[7], sus[8], sus[9],        // $10, $11, $12, $13, $14
      score,                                         // $15
      sat || null,                                   // $16
      stripPII(sanitize(fb[0])) || null,             // $17
      stripPII(sanitize(fb[1])) || null,             // $18
      stripPII(sanitize(fb[2])) || null,             // $19
      stripPII(sanitize(fb[3])) || null,             // $20
    ];

    const result = await client.query(query, values);

    // Log this submission for rate limiting
    await client.query(
      'INSERT INTO sus_submission_rate_limits (ip_hash) VALUES ($1)',
      [ipHash]
    );

    // Clean up expired rate limit rows (housekeeping)
    await client.query('DELETE FROM sus_submission_rate_limits WHERE created_at < NOW() - $1::interval', [`${RATE_WINDOW_HOURS} hours`]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, id: result.rows[0].id })
    };

  } catch (err) {
    console.error('Database error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Database error', detail: err.message })
    };
  } finally {
    await client.end();
  }
};

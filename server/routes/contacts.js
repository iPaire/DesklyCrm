const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET all contacts (with optional search)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query, params;

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = `
        SELECT * FROM contacts
        WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 OR company ILIKE $1
        ORDER BY created_at DESC
      `;
      params = [term];
    } else {
      query = 'SELECT * FROM contacts ORDER BY created_at DESC';
      params = [];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single contact
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create contact
router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, company, status, notes } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    const result = await pool.query(
      `INSERT INTO contacts (first_name, last_name, email, phone, company, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [first_name, last_name, email || null, phone || null, company || null, status || 'lead', notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update contact
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, phone, company, status, notes } = req.body;

    const result = await pool.query(
      `UPDATE contacts
       SET first_name=$1, last_name=$2, email=$3, phone=$4, company=$5, status=$6, notes=$7
       WHERE id=$8
       RETURNING *`,
      [first_name, last_name, email || null, phone || null, company || null, status || 'lead', notes || null, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE contact
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM contacts WHERE id=$1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

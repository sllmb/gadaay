// api/index.js  —  GADAAY Backend  |  L2 GLSI 2026
require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const cors     = require('cors');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Connexion MySQL ──────────────────────────────────────────
const pool = mysql.createPool({
  uri: process.env.MYSQL_URL,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false }
});

// ── Helper ────────────────────────────────────────────────────
async function q(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ── Route de test DB ─────────────────────────────────────────
app.get('/api/test', async (req, res) => {
  try {
    const rows = await q('SELECT 1 AS ok');
    res.json({ ok: true, db: 'connectée', rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
//  CIRCUITS
// ============================================================

// GET  /api/circuits  — liste complète avec places restantes
app.get('/api/circuits', async (req, res) => {
  try {
    const rows = await q(`
      SELECT ci.id, ci.code, ci.libelle, ci.duree, ci.prix_personne,
             ci.nb_places_max, ci.image_url,
             dest.pays, dest.ville,
             d.id AS id_depart, d.date_depart,
             d.nb_places_restantes, d.statut
      FROM Circuit ci
      JOIN Destination dest ON dest.id = ci.id_destination
      LEFT JOIN Depart d    ON d.id_circuit = ci.id
        AND d.date_depart >= CURDATE()
        AND d.statut != 'annule'
      ORDER BY d.date_depart ASC`);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET  /api/circuits/:id  — détail
app.get('/api/circuits/:id', async (req, res) => {
  try {
    const [circ] = await q(
      `SELECT ci.*, dest.pays, dest.ville, dest.description, dest.duree_visa
       FROM Circuit ci JOIN Destination dest ON dest.id = ci.id_destination
       WHERE ci.id = ?`, [req.params.id]);
    if (!circ) return res.status(404).json({ ok: false, error: 'Circuit introuvable' });
    const departs = await q(
      `SELECT * FROM Depart WHERE id_circuit = ? AND date_depart >= CURDATE()
       ORDER BY date_depart`, [req.params.id]);
    res.json({ ok: true, data: { ...circ, departs } });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/circuits  — créer
app.post('/api/circuits', async (req, res) => {
  const { code, libelle, id_destination, duree, prix_personne, nb_places_max, image_url, date_depart } = req.body;
  if (!code || !libelle || !id_destination || !duree || !prix_personne || !nb_places_max)
    return res.status(400).json({ ok: false, error: 'Champs obligatoires manquants' });
  try {
    const r = await q(
      `INSERT INTO Circuit (code, libelle, id_destination, duree, prix_personne, nb_places_max, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, libelle, id_destination, duree, prix_personne, nb_places_max, image_url || null]);
    const circId = r.insertId;
    if (date_depart) {
      await q(`INSERT INTO Depart (id_circuit, date_depart, nb_places_restantes) VALUES (?, ?, ?)`,
        [circId, date_depart, nb_places_max]);
    }
    res.json({ ok: true, id: circId });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
//  DÉPARTS
// ============================================================

// GET /api/departs  — départs disponibles (vue)
app.get('/api/departs', async (req, res) => {
  try {
    const rows = await q(`SELECT * FROM vue_departs_disponibles`);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
//  CLIENTS
// ============================================================

// GET  /api/clients
app.get('/api/clients', async (req, res) => {
  try {
    const rows = await q(`
      SELECT c.*, COUNT(r.id) AS nb_reservations
      FROM Client c
      LEFT JOIN Reservation r ON r.id_client = c.id
      GROUP BY c.id ORDER BY c.nom`);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/clients  — ajouter
app.post('/api/clients', async (req, res) => {
  const { nom, prenom, nationalite, email, telephone } = req.body;
  if (!nom || !prenom || !email)
    return res.status(400).json({ ok: false, error: 'Nom, prénom et email requis' });
  try {
    const r = await q(
      `INSERT INTO Client (nom, prenom, nationalite, email, telephone) VALUES (?, ?, ?, ?, ?)`,
      [nom, prenom, nationalite || null, email, telephone || null]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ ok: false, error: 'Cet email existe déjà' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/clients/:id/historique
app.get('/api/clients/:id/historique', async (req, res) => {
  try {
    const rows = await q(`
      SELECT r.code, r.date_reservation, r.statut, r.montant_total,
             ci.libelle AS circuit, d.date_depart,
             COALESCE(SUM(p.montant),0) AS total_paye
      FROM Reservation r
      JOIN Depart d   ON d.id = r.id_depart
      JOIN Circuit ci ON ci.id = d.id_circuit
      LEFT JOIN Paiement p ON p.id_reservation = r.id
      WHERE r.id_client = ?
      GROUP BY r.id ORDER BY r.date_reservation DESC`, [req.params.id]);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
//  RÉSERVATIONS
// ============================================================

// GET  /api/reservations
app.get('/api/reservations', async (req, res) => {
  try {
    const rows = await q(`
      SELECT r.id, r.code, r.nb_personnes, r.montant_total, r.statut, r.date_reservation,
             CONCAT(c.prenom,' ',c.nom) AS client, c.email,
             ci.libelle AS circuit, d.date_depart,
             COALESCE(SUM(p.montant),0) AS total_paye,
             r.montant_total - COALESCE(SUM(p.montant),0) AS solde_restant
      FROM Reservation r
      JOIN Client c   ON c.id = r.id_client
      JOIN Depart d   ON d.id = r.id_depart
      JOIN Circuit ci ON ci.id = d.id_circuit
      LEFT JOIN Paiement p ON p.id_reservation = r.id
      GROUP BY r.id ORDER BY r.date_reservation DESC`);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/reservations  — créer (avec prepared statement)
app.post('/api/reservations', async (req, res) => {
  const { id_client, id_depart, id_guide, nb_personnes } = req.body;
  if (!id_client || !id_depart || !nb_personnes)
    return res.status(400).json({ ok: false, error: 'Champs obligatoires manquants' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Vérifier les places disponibles
    const [[depart]] = await conn.execute(
      'SELECT nb_places_restantes, statut FROM Depart WHERE id = ? FOR UPDATE', [id_depart]);
    if (!depart || depart.statut !== 'ouvert')
      throw new Error('Ce départ n\'est pas disponible');
    if (depart.nb_places_restantes < nb_personnes)
      throw new Error(`Places insuffisantes (${depart.nb_places_restantes} disponible(s))`);

    // Récupérer le prix
    const [[circ]] = await conn.execute(
      `SELECT ci.prix_personne FROM Circuit ci
       JOIN Depart d ON d.id_circuit = ci.id WHERE d.id = ?`, [id_depart]);
    const montant_total = circ.prix_personne * nb_personnes;

    // Code unique
    const code = 'R-' + Date.now().toString().slice(-6);

    // Insérer la réservation
    const [ins] = await conn.execute(
      `INSERT INTO Reservation (code, id_client, id_depart, id_guide, nb_personnes, montant_total, statut, date_reservation)
       VALUES (?, ?, ?, ?, ?, ?, 'confirme', CURDATE())`,
      [code, id_client, id_depart, id_guide || null, nb_personnes, montant_total]);

    // Décrémenter les places
    await conn.execute(
      `UPDATE Depart SET nb_places_restantes = nb_places_restantes - ?
       WHERE id = ?`, [nb_personnes, id_depart]);

    // Marquer complet si nécessaire
    await conn.execute(
      `UPDATE Depart SET statut = 'complet'
       WHERE id = ? AND nb_places_restantes <= 0`, [id_depart]);

    // Enregistrer l'acompte (30%)
    const acompte = Math.round(montant_total * 0.3);
    await conn.execute(
      `INSERT INTO Paiement (id_reservation, montant, date_paiement, mode_paiement)
       VALUES (?, ?, CURDATE(), 'especes')`, [ins.insertId, acompte]);

    await conn.commit();
    res.json({ ok: true, id: ins.insertId, code, montant_total, acompte });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ ok: false, error: e.message });
  } finally { conn.release(); }
});

// PUT /api/reservations/:id/annuler
app.put('/api/reservations/:id/annuler', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[r]] = await conn.execute(
      'SELECT * FROM Reservation WHERE id = ?', [req.params.id]);
    if (!r) throw new Error('Réservation introuvable');
    if (r.statut === 'annule') throw new Error('Déjà annulée');

    await conn.execute(
      `UPDATE Reservation SET statut = 'annule' WHERE id = ?`, [req.params.id]);
    // Restituer les places
    await conn.execute(
      `UPDATE Depart SET nb_places_restantes = nb_places_restantes + ?, statut = 'ouvert'
       WHERE id = ?`, [r.nb_personnes, r.id_depart]);

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ ok: false, error: e.message });
  } finally { conn.release(); }
});

// ============================================================
//  PAIEMENTS
// ============================================================

// GET  /api/paiements
app.get('/api/paiements', async (req, res) => {
  try {
    const rows = await q(`
      SELECT p.*, r.code AS code_resa,
             CONCAT(c.prenom,' ',c.nom) AS client,
             ci.libelle AS circuit
      FROM Paiement p
      JOIN Reservation r ON r.id = p.id_reservation
      JOIN Client c      ON c.id = r.id_client
      JOIN Depart d      ON d.id = r.id_depart
      JOIN Circuit ci    ON ci.id = d.id_circuit
      ORDER BY p.date_paiement DESC LIMIT 50`);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/paiements  — enregistrer un paiement
app.post('/api/paiements', async (req, res) => {
  const { id_reservation, montant, mode_paiement } = req.body;
  if (!id_reservation || !montant || !mode_paiement)
    return res.status(400).json({ ok: false, error: 'Champs manquants' });
  try {
    const r = await q(
      `INSERT INTO Paiement (id_reservation, montant, date_paiement, mode_paiement)
       VALUES (?, ?, CURDATE(), ?)`,
      [id_reservation, montant, mode_paiement]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/soldes-impayes  — vue
app.get('/api/soldes-impayes', async (req, res) => {
  try {
    const rows = await q(`SELECT * FROM vue_soldes_impayes`);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
//  GUIDES
// ============================================================

app.get('/api/guides', async (req, res) => {
  try {
    const rows = await q(`SELECT * FROM Guide ORDER BY nb_voyageurs DESC`);
    res.json({ ok: true, data: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ============================================================
//  DASHBOARD STATS
// ============================================================

app.get('/api/dashboard', async (req, res) => {
  try {
    const [[departs]]   = await pool.execute(`SELECT COUNT(*) AS n FROM Depart WHERE MONTH(date_depart)=MONTH(CURDATE()) AND YEAR(date_depart)=YEAR(CURDATE())`);
    const [[impayes]]   = await pool.execute(`SELECT COUNT(*) AS n FROM vue_soldes_impayes`);
    const [[ca]]        = await pool.execute(`SELECT COALESCE(SUM(montant),0) AS total FROM Paiement WHERE MONTH(date_paiement)=MONTH(CURDATE())`);
    const [[taux]]      = await pool.execute(`SELECT ROUND(AVG((1 - nb_places_restantes/ci.nb_places_max)*100),0) AS taux FROM Depart d JOIN Circuit ci ON ci.id=d.id_circuit WHERE d.statut!='annule'`);
    const departsData   = await q(`SELECT d.date_depart, d.nb_places_restantes, d.statut, ci.libelle FROM Depart d JOIN Circuit ci ON ci.id=d.id_circuit WHERE d.date_depart >= CURDATE() ORDER BY d.date_depart LIMIT 8`);

    res.json({ ok: true, data: {
      departs_mois   : departs.n,
      soldes_impayes : impayes.n,
      ca_mois        : ca.total,
      taux_remplissage: taux.taux || 0,
      prochains_departs: departsData
    }});
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Requêtes de consultation (Partie 2)
app.get('/api/requetes/departs-disponibles', async (req, res) => {
  const rows = await q(`SELECT * FROM vue_departs_disponibles`);
  res.json({ ok: true, data: rows });
});

app.get('/api/requetes/ca-par-destination', async (req, res) => {
  const rows = await q(`SELECT * FROM vue_ca_par_destination`);
  res.json({ ok: true, data: rows });
});

app.get('/api/requetes/clients-multi-circuits', async (req, res) => {
  const rows = await q(`
    SELECT CONCAT(c.prenom,' ',c.nom) AS client, COUNT(DISTINCT d.id_circuit) AS nb_circuits
    FROM Reservation r JOIN Client c ON c.id=r.id_client
    JOIN Depart d ON d.id=r.id_depart
    WHERE r.statut!='annule'
    GROUP BY r.id_client HAVING nb_circuits > 1`);
  res.json({ ok: true, data: rows });
});

app.get('/api/requetes/circuits-jamais-reserves', async (req, res) => {
  const rows = await q(`
    SELECT ci.code, ci.libelle FROM Circuit ci
    WHERE ci.id NOT IN (
      SELECT DISTINCT d.id_circuit FROM Reservation r
      JOIN Depart d ON d.id=r.id_depart WHERE r.statut!='annule')`);
  res.json({ ok: true, data: rows });
});

app.get('/api/requetes/guide-top', async (req, res) => {
  const rows = await q(`
    SELECT CONCAT(g.prenom,' ',g.nom) AS guide,
           SUM(r.nb_personnes) AS total_voyageurs
    FROM Reservation r JOIN Guide g ON g.id=r.id_guide
    WHERE r.statut='confirme'
    GROUP BY r.id_guide ORDER BY total_voyageurs DESC LIMIT 1`);
  res.json({ ok: true, data: rows });
});

// ── SPA fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => console.log(`GADAAY API running on :${PORT}`));
module.exports = app;
